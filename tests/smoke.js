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

assert(state.ticks === 0 && formatClock() === '08:00 01/08/1990', 'game starts at 08:00 on 01/08/1990');
assert(isOpen(), 'stall is open at start');
assert(els.statusBadge.textContent === 'OPEN' && els.statusBadge.classList.contains('open'), 'badge shows OPEN');

state.stock = 100000; // abundant stock: sold-out logic must not interfere with the day/night test

for (let i = 0; i < 89; i += 1) tick();
assert(isOpen(), 'stall still open at 22:50 (tick 89)');

tick();
assert(!isOpen(), 'stall closes at 23:00 (tick 90)');
assert(els.statusBadge.textContent === 'CLOSED' && els.statusBadge.classList.contains('closed'), 'badge shows CLOSED');
let texts = logTexts();
assert(texts[1] === 'Closing time — the stall is now closed.', 'closing log line present');
assert(/^Today: \\d+ cups sold, \\$\\d+ earned\\.$/.test(texts[0]), 'daily recap logged: ' + texts[0]);
const salesAtClose = state.dayCupsSold;
assert(salesAtClose === 89, '89 cups sold during the open day (deterministic run)');

for (let i = 0; i < 53; i += 1) tick();
assert(state.dayCupsSold === salesAtClose, 'no sales while closed (hard gate)');

tick();
assert(state.ticks === 144, 'clock reached tick 144 (next morning)');
assert(isOpen(), 'stall reopens at 08:00 next day');
texts = logTexts();
assert(texts[1] === 'The stall opens for the day!', 'opening log line present');
assert(state.dayCupsSold === 1, 'day counters reset on opening (1 sale at 08:00)');

restart();
assert(state.ticks === 0 && isOpen() && state.dayCupsSold === 0 && state.dayEarned === 0 && state.lemons === 0,
  'restart resets clock to 08:00 open with fresh day counters and an empty supply crate');

// ---- phase gating (issue #3) + night supplies (issue #5) ----
restart(); // 08:00, open: restock is a day action but needs lemons
assert(els.restock.disabled === true, 'restock disabled while open without lemons');
assert(els.restock.textContent.includes('10 lemons'), 'restock label states the lemon requirement');
assert(els.buyLemons.disabled === true, 'buy lemons disabled while open');
assert(els.buyLemons.textContent.includes('only while closed'), 'buy lemons label states the closed-phase reason');
assert(els.upgradeQuality.disabled === true && els.upgradeStall.disabled === true, 'upgrades disabled while open');
restock();
assert(state.money === 50 && state.stock === 10 && state.lemons === 0, 'restock blocked by lemon shortage');
assert(logTexts()[0] === 'Not enough lemons to restock (need 10, have 0). Buy lemons while the stall is closed.',
  'log explains the lemon shortage');
buyLemons();
assert(state.money === 50 && state.lemons === 0, 'buy lemons while open is ignored');
assert(logTexts()[0] === 'Supplies are only available while the stall is closed.',
  'log explains why supplies are blocked while open');
upgrade('quality');
assert(state.money === 50 && state.upgrades.quality === 0, 'upgrade click while open is ignored');
assert(logTexts()[0] === 'Better Recipe is only available while the stall is closed.',
  'log explains why upgrade is blocked while open');

for (let i = 0; i < 90; i += 1) tick(); // pass the day → 23:00
assert(!isOpen(), 'stall closed for the gating test');
assert(els.restock.disabled === true, 'restock disabled while closed');
assert(els.restock.textContent.includes('only while open'), 'restock label states the open-phase reason');
assert(els.buyLemons.disabled === false, 'buy lemons enabled while closed');
assert(els.upgradeQuality.disabled === false && els.upgradeStall.disabled === false, 'upgrades enabled while closed');
const moneyAtNight = state.money; // 100: 50 starter + 10 sales × $5
const stockAtNight = state.stock; // 0 after the day's 10 sales
restock();
assert(state.money === moneyAtNight && state.stock === stockAtNight, 'restock click while closed is ignored');
assert(logTexts()[0] === 'Restock is only available while the stall is open.',
  'log explains why restock is blocked while closed');
buyLemons();
assert(state.lemons === 10 && state.money === moneyAtNight - 10, 'buy lemons works while closed');
assert(logTexts()[0] === 'Bought 10 lemons for $10.', 'buy lemons is logged');
upgrade('quality');
assert(state.upgrades.quality === 1 && state.quality === 60, 'upgrade works while closed');
upgrade('stall');
assert(state.upgrades.stall === 1 && state.attractiveness === 20, 'second upgrade works while closed');

skipToBoundary(); // next morning: 23:00 → 08:00
assert(isOpen(), 'stall reopened after the night skip');
assert(els.restock.disabled === false, 'restock enabled while open with lemons in the crate');
restock();
assert(state.money === 25 && state.stock === 10 && state.lemons === 0, 'restock consumes money and lemons');
assert(logTexts()[0] === 'Restocked 10 cups for $10 and 10 lemons.', 'restock is logged with lemons');
restock();
assert(state.money === 25 && state.stock === 10 && state.lemons === 0, 'second restock blocked without lemons');
assert(logTexts()[0] === 'Not enough lemons to restock (need 10, have 0). Buy lemons while the stall is closed.',
  'log explains the shortage on the second restock');

// ---- fast-forward to the next day boundary (issue #6) ----
restart(); // 08:00, open
assert(!els.skipTime.classList.contains('hidden'), 'skip button shown while open');
assert(els.skipTime.textContent === 'Wait until closing', 'label says "Wait until closing" while open');
const t0 = state.ticks;
skipToBoundary();
assert(state.ticks - t0 === 90, 'day skip jumps 08:00 → 23:00 (90 ticks at 10 min/tick)');
assert(!isOpen(), 'stall closed after day skip');
assert(logTexts()[1] === 'Closing time — the stall is now closed.', 'closing log after day skip');
assert(/^Today: \\d+ cups sold, \\$\\d+ earned\\.$/.test(logTexts()[0]), 'daily recap after day skip');
assert(els.skipTime.textContent === 'Wait until morning', 'label says "Wait until morning" while closed');
const t1 = state.ticks;
skipToBoundary();
assert(state.ticks - t1 === 54, 'night skip jumps 23:00 → 08:00 (54 ticks at 10 min/tick)');
assert(isOpen(), 'stall open after night skip');
assert(logTexts()[0] === 'The stall opens for the day!', 'opening log after night skip');
assert(state.dayCupsSold === 0 && state.dayEarned === 0, 'day counters reset after night skip');

state.paused = true;
const t2 = state.ticks;
skipToBoundary();
assert(state.ticks - t2 === 90, 'day skip works while paused');
state.paused = false;

state.gameOver = true;
render();
assert(els.skipTime.classList.contains('hidden'), 'skip button hidden on game over');
const t3 = state.ticks;
skipToBoundary();
assert(state.ticks === t3, 'skip does nothing on game over');
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
