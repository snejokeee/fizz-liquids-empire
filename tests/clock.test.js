// Clock tests: the day/night cycle (issue #2) and time control (issue #6).
// When the stall opens and closes, the OPEN/CLOSED badge, the daily recap,
// and the fast-forward to the next day boundary (including while paused).
// Run by tests/smoke.js — it boots a fresh game for this file.
'use strict';

// ---- starting state ----
assert(state.ticks === 0 && formatClock() === '06:00 01/08/1990', 'game starts at 06:00 on 01/08/1990');
assert(!isOpen(), 'stall is closed at start (06:00, two hours before opening)');
assert(els.statusBadge.textContent === 'CLOSED' && els.statusBadge.classList.contains('closed'), 'badge shows CLOSED');
assert(els.buyLemons.disabled === false, 'pre-opening shopping available at start');

// ---- day/night cycle (issue #2) ----
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
assert(/^Today: \d+ cups sold, \$\d+ earned\.$/.test(texts[0]), 'daily recap logged: ' + texts[0]);
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
assert(/^Today: \d+ cups sold, \$\d+ earned\.$/.test(logTexts()[0]), 'daily recap after day skip');
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
