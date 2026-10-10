// Balance simulation harness (issue #10). Run with: node tests/sim.js
//
// Plays whole games headlessly: the same game files, booted the same way as
// the smoke tests (tests/game-host.js), driven through the real actions
// (setPrice, buyLemons, upgradeRecipe) — but with a *seeded* PRNG instead of
// the smoke runner's pinned Math.random = 0, so arrivals and buy decisions
// are repeatable yet realistic. Prints, per strategy, days-to-max-reputation
// (across several seeds) plus money curves, and a what-if sweep of the
// reputation gain factor so the pacing retune (issue #10) picks its target
// from data.
'use strict';
const vm = require('vm');
const { bootGame } = require('./game-host');

// Deterministic-but-realistic randomness (mulberry32): same seed → same run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = [1, 2, 3, 4, 5]; // each strategy runs once per seed
const MAX_DAYS = 120; // a run that has not reached the cap by now is a failure
const GAIN_FACTORS = [1, 0.5, 0.25, 0.125]; // what-if sweep of the retune knob

// ---------------------------------------------------------------------------
// STRATEGIES — plain data played by the in-game driver below.
// price:       { mode: 'fixed', value } | { mode: 'fifty' }
//              'fifty' re-solves the buy-chance formula for a ~50% sell chance.
// lemonTarget: top the crate up to this many lemons at night.
// unlock:      'never' | 'surplus' — unlock the next recipe when affordable
//              while keeping reserveForUnlock dollars back ('recipes ASAP'
//              keeps less, so it unlocks earlier and stocks fewer lemons).
// ---------------------------------------------------------------------------
const STRATEGIES = [
  {
    id: 'fixed-5',
    label: 'fixed $5, every dollar → lemons, no recipe unlocks',
    price: { mode: 'fixed', value: 5 },
    lemonTarget: Infinity,
    unlock: 'never',
    reserveForUnlock: 0,
  },
  {
    id: 'fifty',
    label: 'keep ~50% sell chance (price follows reputation), 20-lemon buffer, surplus → recipes',
    price: { mode: 'fifty' },
    lemonTarget: 20,
    unlock: 'surplus',
    reserveForUnlock: 30,
  },
  {
    id: 'recipes-asap',
    label: 'fixed $5, 20-lemon buffer, surplus → recipes ASAP (small reserve)',
    price: { mode: 'fixed', value: 5 },
    lemonTarget: 20,
    unlock: 'surplus',
    reserveForUnlock: 12,
  },
  {
    id: 'price-10',
    label: 'fixed $10, every dollar → lemons, no recipe unlocks',
    price: { mode: 'fixed', value: 10 },
    lemonTarget: Infinity,
    unlock: 'never',
    reserveForUnlock: 0,
  },
];

// ---------------------------------------------------------------------------
// THE IN-GAME DRIVER — these functions are stringified and evaluated inside
// the game context, so `state`, `CONFIG`, `tick`, `buyLemons`, … in their
// bodies are the game's own globals. Keep them self-contained (no references
// to this file's scope) and free of template literals (the outer template
// literal that carries them would eat any `${}`).
// ---------------------------------------------------------------------------
function strategyStep(strategy) {
  const RESERVE = 2; // $1 production + $1 for a lemon if the crate runs dry

  if (!isOpen()) {
    // Recipes first (a night action), then lemons with what is left.
    if (strategy.unlock === 'surplus' && !recipeMastered()
        && state.money - recipeUnlockCost() >= strategy.reserveForUnlock) {
      upgradeRecipe();
    }
    while (state.lemons < strategy.lemonTarget
        && state.money - lemonBatchCost() >= RESERVE) {
      buyLemons();
    }
  }

  if (strategy.price.mode === 'fixed') {
    setPrice(strategy.price.value);
    return;
  }
  // 'fifty': solve the buy-chance formula (DESIGN.md §6) for ~50%:
  // 0.5 + (quality − 10p)/200 + rep/1800 = 0.5  →  p = (quality + rep/9)/10
  const quality = effectiveRecipe().quality;
  setPrice(clamp(Math.round((quality + state.reputation / 9) / 10), 1, 10));
}

function runSimulation(strategy, gainFactor, maxDays) {
  CONFIG.reputationGainPerDollar = gainFactor;
  restart(); // fresh state, clock back to 06:00 closed
  const moneyByDay = [];
  let unlockDay = null;
  const maxTicks = maxDays * TICKS_PER_DAY;
  while (!state.gameOver && state.ticks < maxTicks && state.reputation < CONFIG.reputationMax) {
    strategyStep(strategy);
    tick();
    if (state.ticks % TICKS_PER_DAY === 0) moneyByDay.push(state.money);
    if (unlockDay === null && state.recipeLevel > 1) {
      unlockDay = Math.floor(state.ticks / TICKS_PER_DAY);
    }
  }
  return {
    days: Math.round((state.ticks / TICKS_PER_DAY) * 10) / 10,
    reachedMax: state.reputation >= CONFIG.reputationMax,
    gameOver: state.gameOver,
    reputation: Math.floor(state.reputation),
    money: state.money,
    cupsSold: state.cupsSold,
    recipeLevel: state.recipeLevel,
    unlockDay,
    moneyByDay,
  };
}

// ---------------------------------------------------------------------------
// HOST — boot one game, install the driver, run the strategies.
// ---------------------------------------------------------------------------
const host = bootGame();
// Headless: neuter the DOM renderer — tick() still runs the real simulation,
// but repainting the stub DOM hundreds of thousands of times would dominate
// the runtime, and pixels are irrelevant to balance.
vm.runInContext('render = () => {};', host);

vm.runInContext(
  'var __driver = (function () {'
  + ' const BASELINE_GAIN = CONFIG.reputationGainPerDollar;'
  + ' const TICKS_PER_DAY = (24 * 60) / CONFIG.clockMinutesPerTick;'
  + '\n' + strategyStep.toString()
  + '\n' + runSimulation.toString()
  + '\n return { runSimulation: runSimulation, baselineGain: BASELINE_GAIN, ticksPerDay: TICKS_PER_DAY };'
  + '})();',
  host
);
const driver = host.__driver;

function simulate(strategy, gainFactor) {
  return SEEDS.map((seed) => {
    host.__random = mulberry32(seed);
    vm.runInContext('Math.random = __random;', host);
    return driver.runSimulation(strategy, gainFactor, MAX_DAYS);
  });
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function moneyCurve(run) {
  const parts = [];
  for (const day of [5, 10, 20, 40]) {
    if (day <= run.moneyByDay.length) parts.push('d' + day + '=$' + Math.round(run.moneyByDay[day - 1]));
  }
  if (run.moneyByDay.length > 0) parts.push('end=$' + Math.round(run.money));
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function printStrategy(strategy, runs) {
  console.log('\n=== ' + strategy.id + ' — ' + strategy.label);

  runs.forEach((run, i) => {
    let outcome;
    if (run.reachedMax) outcome = '1000 rep on day ' + run.days;
    else if (run.gameOver) outcome = 'game over on day ' + run.days + ' (rep ' + run.reputation + ')';
    else outcome = 'stopped at day ' + run.days + ' (rep ' + run.reputation + ')';
    const unlock = run.unlockDay === null ? 'no unlock' : 'first unlock day ' + run.unlockDay;
    console.log('  seed ' + SEEDS[i] + ': ' + outcome
      + ' · ' + unlock + ' · final $' + Math.round(run.money) + ' · ' + run.cupsSold + ' cups');
  });

  const reached = runs.filter((run) => run.reachedMax);
  const deaths = runs.filter((run) => run.gameOver).length;
  if (reached.length > 0) {
    const days = reached.map((run) => run.days);
    console.log('  → 1000 rep in ' + mean(days).toFixed(1) + ' days on average ('
      + Math.min(...days) + '–' + Math.max(...days) + ' over ' + reached.length + '/' + SEEDS.length + ' seeds)'
      + (deaths > 0 ? ' · deaths: ' + deaths : ''));
  } else {
    console.log('  → 1000 rep never reached within ' + MAX_DAYS + ' days'
      + (deaths > 0 ? ' · deaths: ' + deaths : ''));
  }
  console.log('  money curve (seed ' + SEEDS[0] + '): ' + moneyCurve(runs[0]));
}

console.log('Fizz Liquids Empire — balance simulation (issue #10)');
console.log('seeds ' + SEEDS.join(', ') + ' · ' + driver.ticksPerDay + ' ticks per in-game day · horizon '
  + MAX_DAYS + ' days · reputationGainPerDollar = ' + driver.baselineGain);

const results = [];
for (const strategy of STRATEGIES) {
  const runs = simulate(strategy, driver.baselineGain);
  results.push({ strategy, runs });
  printStrategy(strategy, runs);
}

// Summary across strategies.
console.log('\n--- summary');
for (const { strategy, runs } of results) {
  const reached = runs.filter((run) => run.reachedMax);
  const unlocks = runs.filter((run) => run.unlockDay !== null).map((run) => run.unlockDay);
  console.log('  ' + strategy.id.padEnd(14)
    + ' 1000 rep: ' + (reached.length > 0
      ? 'day ' + mean(reached.map((run) => run.days)).toFixed(1) + ' (' + reached.length + '/' + SEEDS.length + ')'
      : 'not reached')
    + ' · first unlock: ' + (unlocks.length > 0 ? 'day ' + mean(unlocks).toFixed(1) : '—'));
}

// The retune knob (issue #10): how much a sale dollar adds to reputation.
console.log('\n--- what-if: reputation gain factor');
const finished = results.filter(({ runs }) => runs.every((run) => run.reachedMax));
const pool = finished.length > 0 ? finished : results;
const best = pool.slice().sort((a, b) =>
  mean(a.runs.map((run) => run.days)) - mean(b.runs.map((run) => run.days)))[0];
console.log('  fastest strategy: ' + best.strategy.id);

for (const factor of GAIN_FACTORS) {
  const runs = simulate(best.strategy, factor);
  const reached = runs.filter((run) => run.reachedMax);
  const label = '  gain ×' + factor + (factor === driver.baselineGain ? ' (current)' : '');
  if (reached.length > 0) {
    console.log(label + ' → 1000 rep on day ' + mean(reached.map((run) => run.days)).toFixed(1)
      + ' on average (' + reached.length + '/' + SEEDS.length + ' runs reached it)');
  } else {
    console.log(label + ' → not reached within ' + MAX_DAYS + ' days');
  }
}
