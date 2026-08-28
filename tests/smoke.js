// Smoke test for the game logic. Run with: node tests/smoke.js
//
// Covers the derivable logic in game.js: in-game clock and opening hours
// (issue #2), phase-gated actions (issue #3), night supplies (issue #5), the
// fast-forward to the next day boundary (issue #6), and auto-restock with
// recipe fallback (issue #7). It runs game.js in a Node vm with a stubbed DOM
// and Math.random = 0, so every open tick deterministically produces one sale
// — the test asserts exact tick counts, not probabilities.
//
// Rendering visuals are NOT covered (the DOM is stubbed); layout is verified
// by playing the game in the browser.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl() {
  const el = {
    textContent: '',
    value: '',
    innerHTML: '',
    disabled: false,
    style: {},
    offsetWidth: 0,
    offsetHeight: 0,
    _classes: new Set(),
    children: [],
  };
  el.classList = {
    add: (c) => el._classes.add(c),
    remove: (c) => el._classes.delete(c),
    toggle: (c, force) => { if (force) el._classes.add(c); else el._classes.delete(c); },
    contains: (c) => el._classes.has(c),
  };
  el.prepend = (child) => {
    el.children.unshift(child);
    child.remove = () => {
      const i = el.children.indexOf(child);
      if (i >= 0) el.children.splice(i, 1);
    };
  };
  el.replaceChildren = () => { el.children = []; };
  el.addEventListener = () => {};
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, bottom: 0 });
  return el;
}

const elsById = {};
const sandbox = {
  console,
  process,
  document: {
    getElementById: (id) => elsById[id] || (elsById[id] = makeEl()),
    createElement: () => makeEl(),
    querySelectorAll: () => [],
    addEventListener: () => {},
  },
  window: { innerWidth: 800, innerHeight: 600 },
  setInterval: (fn) => { sandbox.__tick = fn; return 1; },
};
vm.createContext(sandbox);

const gameSrc = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
vm.runInContext(gameSrc, sandbox);
vm.runInContext('Math.random = () => 0;', sandbox);

const tests = `
function assert(cond, msg) {
  if (cond) { console.log('ok: ' + msg); }
  else { console.error('FAIL: ' + msg); process.exitCode = 1; }
}
const logTexts = () => els.logList.children.map((c) => c.textContent);

assert(state.ticks === 0 && formatClock() === '06:00 01/08/1990', 'game starts at 06:00 on 01/08/1990');
assert(!isOpen(), 'stall is closed at start (06:00, two hours before opening)');
assert(els.statusBadge.textContent === 'CLOSED' && els.statusBadge.classList.contains('closed'), 'badge shows CLOSED');
assert(els.buyLemons.disabled === false, 'pre-opening shopping available at start');

state.stock = 100000; // abundant stock: sold-out logic must not interfere with the day/night test

for (let i = 0; i < 11; i += 1) tick();
assert(!isOpen(), 'stall still closed at 07:50 (tick 11)');

tick();
assert(isOpen(), 'stall opens at 08:00 (tick 12)');
assert(els.statusBadge.textContent === 'OPEN' && els.statusBadge.classList.contains('open'), 'badge shows OPEN');
assert(logTexts()[1] === 'The stall opens for the day!', 'opening log line present');

for (let i = 0; i < 89; i += 1) tick();
assert(isOpen(), 'stall still open at 22:50 (tick 101)');

tick();
assert(!isOpen(), 'stall closes at 23:00 (tick 102)');
assert(els.statusBadge.textContent === 'CLOSED' && els.statusBadge.classList.contains('closed'), 'badge shows CLOSED');
let texts = logTexts();
assert(texts[1] === 'Closing time — the stall is now closed.', 'closing log line present');
assert(/^Today: \\d+ cups sold, \\$\\d+ earned\\.$/.test(texts[0]), 'daily recap logged: ' + texts[0]);
const salesAtClose = state.dayCupsSold;
assert(salesAtClose === 90, '90 cups sold during the open day (deterministic run)');

for (let i = 0; i < 53; i += 1) tick(); // 23:00 → 07:50 next day, still closed
assert(state.dayCupsSold === salesAtClose, 'no sales while closed (hard gate)');

tick();
assert(state.ticks === 156, 'clock reached tick 156 (next morning)');
assert(isOpen(), 'stall reopens at 08:00 next day');
texts = logTexts();
assert(texts[1] === 'The stall opens for the day!', 'opening log line present');
assert(state.dayCupsSold === 1, 'day counters reset on opening (1 sale at 08:00)');

restart();
assert(state.ticks === 0 && !isOpen() && state.dayCupsSold === 0 && state.dayEarned === 0 && state.lemons === 0
  && state.recipeLevel === 1 && state.servedLevel === 1 && effectiveRecipe().quality === 50,
  'restart resets clock to 06:00 closed with fresh day counters, an empty supply crate and the starter recipe');

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
assert(state.attractiveness === 10, 'attractiveness is a constant after the stall upgrade was cut');

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

// serving selector: which unlocked recipe the stall sells
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

// ---- fast-forward to the next day boundary (issue #6) ----
restart(); // 06:00, closed
assert(!els.skipTime.classList.contains('hidden'), 'skip button shown while closed');
assert(els.skipTime.textContent === 'Wait until morning', 'label says "Wait until morning" while closed');
const t0 = state.ticks;
skipToBoundary();
assert(state.ticks - t0 === 12, 'pre-opening skip jumps 06:00 → 08:00 (12 ticks at 10 min/tick)');
assert(isOpen(), 'stall open after the pre-opening skip');
assert(logTexts()[0] === 'The stall opens for the day!', 'opening log after pre-opening skip');
assert(state.dayCupsSold === 0 && state.dayEarned === 0, 'day counters reset after pre-opening skip');
assert(els.skipTime.textContent === 'Wait until closing', 'label says "Wait until closing" while open');

// auto-restock processes during fast-forward (deterministic, no randomness)
restart();
buyLemons(); // money 30, lemons 10
state.stock = 0; // empty stall: production should refill during the pre-opening skip
skipToBoundary(); // 06:00 → 08:00: 12 ticks of production
assert(state.stock === 4 && state.lemons === 6 && state.money === 26,
  'pre-opening skip runs 12 ticks of auto-restock (4 cups, $4, 4 lemons)');

const t1 = state.ticks;
skipToBoundary();
assert(state.ticks - t1 === 90, 'day skip jumps 08:00 → 23:00 (90 ticks at 10 min/tick)');
assert(!isOpen(), 'stall closed after day skip');
assert(logTexts()[1] === 'Closing time — the stall is now closed.', 'closing log after day skip');
assert(/^Today: \\d+ cups sold, \\$\\d+ earned\\.$/.test(logTexts()[0]), 'daily recap after day skip');
assert(els.skipTime.textContent === 'Wait until morning', 'label says "Wait until morning" while closed');
const t2 = state.ticks;
skipToBoundary();
assert(state.ticks - t2 === 54, 'night skip jumps 23:00 → 08:00 (54 ticks at 10 min/tick)');
assert(isOpen(), 'stall open after night skip');
assert(logTexts()[0] === 'The stall opens for the day!', 'opening log after night skip');
assert(state.dayCupsSold === 0 && state.dayEarned === 0, 'day counters reset after night skip');

state.paused = true;
const t3 = state.ticks;
skipToBoundary();
assert(state.ticks - t3 === 90, 'day skip works while paused');
assert(els.statusBadge.textContent === 'PAUSED' && els.statusBadge.classList.contains('paused'),
  'badge shows PAUSED (not CLOSED) while paused at night');
state.paused = false;
render();
assert(els.statusBadge.textContent === 'CLOSED' && !els.statusBadge.classList.contains('paused'),
  'badge shows CLOSED again after unpausing');

skipToBoundary(); // 23:00 → 08:00, open
state.paused = true;
render();
assert(els.statusBadge.textContent === 'PAUSED' && els.statusBadge.classList.contains('paused'),
  'badge shows PAUSED (not OPEN) while paused during the day');
state.paused = false;

state.gameOver = true;
render();
assert(els.skipTime.classList.contains('hidden'), 'skip button hidden on game over');
const t4 = state.ticks;
skipToBoundary();
assert(state.ticks === t4, 'skip does nothing on game over');
state.gameOver = false;

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
restart();

console.log('done');
`;
vm.runInContext(tests, sandbox);
