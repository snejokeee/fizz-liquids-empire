// Production tests: auto-restock and the game-over bar (issues #5, #7).
// How the stall produces cups by itself (money + lemons, 3 ticks per cup),
// when it pauses or stops, the recipe fallback when the crate runs low,
// and the lose condition: no stock and not even one cup producible.
// Run by tests/smoke.js — it boots a fresh game for this file.
'use strict';

// ---- auto-restock (issue #7): production is automatic, costs money, takes time ----
restart(); // 06:00, closed — production runs day and night
state.money = 100;
state.lemons = 20;
state.stock = 0;
render();
assert(els.productionStatus.textContent === 'Restocking… 0/3', 'production status shows idle progress');
for (let i = 0; i < 3; i += 1) tick();
assert(state.stock === 1 && state.lemons === 19 && state.money === 99,
  'one cup auto-produced after 3 ticks ($1 + 1 lemon)');
for (let i = 0; i < 3; i += 1) tick();
assert(state.stock === 2 && state.lemons === 18 && state.money === 98,
  'production keeps going while supplies last');
assert(els.productionStatus.textContent === 'Restocking… 0/3', 'progress resets after each cup');

// production stops at capacity: no unbounded money drain
restart();
state.money = 100;
state.lemons = 20;
state.stock = 0;
render();
skipToBoundary(); // 06:00 → 08:00: 12 ticks → 4 cups
skipToBoundary(); // 08:00 → 23:00: refills to capacity
assert(state.stock === 10 && state.lemons === 10 && state.money === 90,
  'production stops at stock capacity (10 cups, $10 spent)');
skipToBoundary(); // 23:00 → 08:00: full stock, nothing to produce
assert(state.stock === 10 && state.lemons === 10 && state.money === 90,
  'full stock: no further production, no further spending');
assert(els.productionStatus.textContent === 'Stock full', 'status says stock full');

// waiting for lemons: production pauses without spending
restart();
state.money = 100;
state.stock = 0;
render();
assert(els.productionStatus.textContent === 'Waiting for lemons', 'status says waiting for lemons');
for (let i = 0; i < 3; i += 1) tick();
assert(state.stock === 0 && state.money === 100, 'no production and no spending without lemons');

// fallback: a recipe whose lemons the crate lacks falls back to a cheaper one
restart();
state.recipeLevel = 3;
state.servedLevel = 3; // Citrus Sparkle needs 2 lemons/cup
state.lemons = 1;
state.money = 100;
state.stock = 0;
render();
assert(effectiveRecipe().name === 'Iced Lemon Fizz', 'falls back to the best affordable recipe');
assert(els.servingNote.textContent === 'Out of lemons for Citrus Sparkle — serving Iced Lemon Fizz.',
  'serving note explains the fallback');
for (let i = 0; i < 3; i += 1) tick();
assert(state.stock === 1 && state.lemons === 0 && state.money === 99,
  "fallback production spends 1 lemon + $1, not the selected recipe's 2 lemons");
assert(effectiveRecipe().name === 'Fizzy Lemonade', 'with no lemons left the base recipe is the floor');
for (let i = 0; i < 3; i += 1) tick();
assert(state.stock === 1 && state.lemons === 0 && state.money === 99,
  'no production once the crate is empty');

// ---- game over (issue #5/#7): stock 0 and not even one cup producible ----
restart();
state.stock = 0;
state.money = 1; // below production $1 + one lemon $1
state.lemons = 0;
tick();
assert(state.gameOver === true, 'game over when even one cup is unaffordable');
restart();
state.stock = 0;
state.money = 1;
state.lemons = 1; // a lemon in the crate: only the production $ is needed
tick();
assert(state.gameOver === false, 'not game over with a lemon in the crate');
restart();
state.stock = 0;
state.money = 15; // enough to buy lemons tonight and produce tomorrow
state.lemons = 0;
tick();
assert(state.gameOver === false, 'not game over when the chain can restart');
