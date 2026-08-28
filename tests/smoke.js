// Smoke test for the game logic. Run with: node tests/smoke.js
//
// Covers the derivable logic in game.js: in-game clock and opening hours
// (issue #2), phase-gated actions (issue #3), night supplies (issue #5), and
// the fast-forward to the next day boundary (issue #6). It runs game.js in a
// Node vm with a stubbed DOM and Math.random = 0, so every open tick
// deterministically produces one sale — the test asserts exact tick counts,
// not probabilities.
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
assert(state.ticks === 0 && !isOpen() && state.dayCupsSold === 0 && state.dayEarned === 0 && state.lemons === 0,
  'restart resets clock to 06:00 closed with fresh day counters and an empty supply crate');

// ---- phase gating (issue #3) + night supplies (issue #5) ----
restart(); // 06:00, closed: two hours to shop before the first opening
assert(!isOpen(), 'game starts in the closed phase');
assert(els.restock.disabled === true, 'restock disabled while closed');
assert(els.restock.textContent.includes('only while open'), 'restock label states the open-phase reason');
assert(els.buyLemons.disabled === false, 'buy lemons enabled during the pre-opening night');
assert(els.upgradeQuality.disabled === true && els.upgradeStall.disabled === true,
  'upgrades disabled at start: starter money cannot afford them (from zero to hero)');
assert(els.upgradeQuality.textContent.includes('$120'), 'quality upgrade shows the new price');
restock();
assert(state.money === 40 && state.stock === 10 && state.lemons === 0, 'restock click while closed is ignored');
assert(logTexts()[0] === 'Restock is only available while the stall is open.',
  'log explains why restock is blocked while closed');
buyLemons();
assert(state.lemons === 10 && state.money === 30, 'pre-opening lemon shopping works');
assert(logTexts()[0] === 'Bought 10 lemons for $10.', 'buy lemons is logged');
upgrade('quality');
assert(state.money === 30 && state.upgrades.quality === 0, 'quality upgrade blocked by price at start');
assert(logTexts()[0] === 'Not enough money for Better Recipe ($120).', 'log explains the price block');
upgrade('stall');
assert(state.money === 30 && state.upgrades.stall === 0, 'stall upgrade blocked by price at start');
assert(logTexts()[0] === 'Not enough money for Nicer Stall ($100).', 'log explains the price block');

for (let i = 0; i < 102; i += 1) tick(); // 06:00 → 23:00: day 1 sells the free starter batch
assert(!isOpen(), 'stall closed for the gating test');
const moneyNight1 = state.money; // 80: 40 starter − 10 lemons + 10 sales × $5
assert(moneyNight1 === 80, 'night 1 money is $80 (deterministic run)');
assert(state.stock === 0 && state.lemons === 10, 'day 1 sold the starter batch, lemons untouched');
assert(els.restock.disabled === true, 'restock disabled while closed');
assert(els.buyLemons.disabled === false, 'buy lemons enabled while closed');
assert(els.upgradeQuality.disabled === true && els.upgradeStall.disabled === true,
  'upgrades still disabled on the first night (prices above night-1 money)');
restock();
assert(state.money === moneyNight1 && state.stock === 0, 'restock click while closed is ignored');
assert(logTexts()[0] === 'Restock is only available while the stall is open.',
  'log explains why restock is blocked while closed');
upgrade('quality');
assert(state.upgrades.quality === 0 && state.quality === 50, 'no quality upgrade on the first night (from zero to hero)');
assert(logTexts()[0] === 'Not enough money for Better Recipe ($120).', 'first-night quality upgrade is money-blocked');
upgrade('stall');
assert(state.upgrades.stall === 0 && state.attractiveness === 10, 'no stall upgrade on the first night either');
assert(logTexts()[0] === 'Not enough money for Nicer Stall ($100).', 'first-night stall upgrade is money-blocked');

// after saving up, the upgrades become affordable and work while closed
state.money = 1000;
upgrade('quality');
assert(state.upgrades.quality === 1 && state.quality === 60 && state.money === 880, 'quality upgrade works when affordable');
assert(logTexts()[0] === 'Better Recipe! quality is now 60.', 'quality upgrade is logged');
upgrade('stall');
assert(state.upgrades.stall === 1 && state.attractiveness === 20 && state.money === 780, 'stall upgrade works when affordable');
assert(logTexts()[0] === 'Nicer Stall! attractiveness is now 20.', 'stall upgrade is logged');

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

// ---- game over (issue #5): must afford restock money AND missing lemons ----
restart();
state.stock = 0;
state.money = 15; // < restock $10 + lemon batch $10
state.lemons = 0;
tick();
assert(state.gameOver === true, 'game over when a fresh batch is unaffordable');
restart();
state.stock = 0;
state.money = 15;
state.lemons = 10; // lemons already in the crate: only restock money is needed
tick();
assert(state.gameOver === false, 'not game over when lemons are already stocked');
restart();
state.stock = 0;
state.money = 20; // enough for lemons tonight + restock tomorrow
state.lemons = 0;
tick();
assert(state.gameOver === false, 'not game over when the full chain is affordable');
restart();

console.log('done');
`;
vm.runInContext(tests, sandbox);
