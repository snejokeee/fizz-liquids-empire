// Supplies tests: night shopping, the recipe unlock ladder and the serving
// selector (issues #3, #5). Buying lemons while closed, recipe unlocks as
// the single upgrade path (night-gated, money-gated, ends at the top tier),
// and choosing which unlocked recipe the stall sells.
// Run by tests/smoke.js — it boots a fresh game for this file.
'use strict';

// ---- phase gating (issue #3) + night supplies (issue #5) ----
restart(); // 06:00, closed: two hours to shop before the first opening
assert(!isOpen(), 'game starts in the closed phase');
assert(els.buyLemons.disabled === false, 'buy lemons enabled during the pre-opening night');
assert(els.recipeSelect.value === '1' && els.productionStatus.textContent === 'Stock full',
  'serving the starter recipe, stall full at start');
assert(els.upgradeRecipe.disabled === true,
  'recipe unlock disabled at start: starter money cannot afford it (from zero to hero)');
assert(els.upgradeRecipe.textContent.includes('$250'), 'recipe unlock shows the next tier price');
assert(els.drinkName.textContent === 'Fizzy Lemonade' && els.recipeName.textContent === 'Fizzy Lemonade'
  && els.recipeIngredients.textContent === 'water + lemon',
  'stall header and recipe panel show the starter recipe');
buyLemons();
assert(state.lemons === 10 && state.money === 30, 'pre-opening lemon shopping works');
assert(logTexts()[0] === 'Bought 10 lemons for $10.', 'buy lemons is logged');
upgradeRecipe();
assert(state.money === 30 && state.recipeLevel === 1, 'recipe unlock blocked by price at start');
assert(logTexts()[0] === 'Not enough money for Iced Lemon Fizz ($250).', 'log explains the price block');

for (let i = 0; i < 102; i += 1) tick(); // 06:00 → 23:00: day 1 sells the starter batch + auto-produced cups
assert(!isOpen(), 'stall closed for the gating test');
const moneyNight1 = state.money; // 120: 30 after lemons + 20 sales × $5 − $10 production
assert(moneyNight1 === 120, 'night 1 money is $120 (deterministic run)');
assert(state.stock === 0 && state.lemons === 0,
  'day 1 sold the starter batch and 10 auto-produced cups (all lemons spent)');
assert(els.buyLemons.disabled === false, 'buy lemons enabled while closed');
assert(els.upgradeRecipe.disabled === true,
  'recipe unlock still disabled on the first night (prices above night-1 money)');
upgradeRecipe();
assert(state.recipeLevel === 1 && effectiveRecipe().quality === 50, 'no recipe unlock on the first night (from zero to hero)');
assert(logTexts()[0] === 'Not enough money for Iced Lemon Fizz ($250).', 'first-night recipe unlock is money-blocked');

// after saving up, the recipe unlock becomes affordable and works while closed
state.lemons = 10; // so the new recipe is actually servable (no fallback)
state.money = 1000;
upgradeRecipe();
assert(state.recipeLevel === 2 && state.servedLevel === 2 && effectiveRecipe().quality === 60 && state.money === 750,
  'recipe unlock works when affordable and is served by default');
assert(logTexts()[0] === 'Recipe unlocked: Iced Lemon Fizz! Quality is now 60.', 'recipe unlock is logged');
assert(els.drinkName.textContent === 'Iced Lemon Fizz' && els.recipeIngredients.textContent.includes('ice'),
  'stall header and recipe panel follow the unlocked recipe');

// recipe unlocks are night actions: blocked while the stall is open
skipToBoundary(); // 23:00 → 08:00 next morning, now open
upgradeRecipe();
assert(state.recipeLevel === 2, 'recipe unlock ignored while open');
assert(logTexts()[0] === 'Recipe upgrades are only available while the stall is closed.',
  'log explains the open-phase block');

// the ladder ends: at the top tier there is nothing left to unlock
state.money = 100000;
state.recipeLevel = 5;
state.servedLevel = 5;
render();
assert(els.upgradeRecipe.disabled === true && els.upgradeRecipe.textContent === 'All recipes mastered',
  'recipe panel shows the mastered state at the top tier');
upgradeRecipe();
assert(state.recipeLevel === 5 && state.money === 100000, 'no unlock past the final recipe');
assert(logTexts()[0] === 'You already mastered every recipe.', 'mastered log message');

// ---- serving selector: which unlocked recipe the stall sells ----
restart();
state.recipeLevel = 2;
state.lemons = 10;
render();
assert(els.recipeSelect.value === '1' && buyChance() === 0.5, 'serving the starter recipe by default');
setServedRecipe(2);
assert(state.servedLevel === 2 && els.recipeSelect.value === '2' && buyChance() === 0.55,
  'switching the serving recipe changes quality and buy chance');
setServedRecipe(9);
assert(state.servedLevel === 2, 'serving level is clamped to the unlocked recipes');
