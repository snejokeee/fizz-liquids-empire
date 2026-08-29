'use strict';

// ---------------------------------------------------------------------------
// state.js — the single source of truth (state) plus the pure rules that
// derive from it: clock, opening hours, recipes, production, buy chance.
// No DOM here — this is exactly the code tests/smoke.js asserts on.
// Depends on: config.js.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// STATE — the single source of truth.
// render() only reads state; the UI never holds game data on its own.
// ---------------------------------------------------------------------------
const state = {
  money: CONFIG.starterMoney,
  stock: CONFIG.starterStock,
  lemons: 0, // supply crate: bought at night, consumed by production (issue #5)
  price: CONFIG.defaultPrice,
  reputation: 0, // 0..1000: grows by sale price; buy chance + word-of-mouth traffic (v0.0.6)
  cupsSold: 0,
  totalEarned: 0,
  dayCupsSold: 0, // today's sales, reset when the stall opens (issue #2)
  dayEarned: 0, // today's revenue, reset when the stall opens (issue #2)
  dayReputation: 0, // today's reputation gained, reset on opening (v0.0.6)
  recipeLevel: 1, // highest unlocked recipe tier (1..5); unlocks are night actions
  servedLevel: 1, // recipe the stall serves (1..recipeLevel); chosen in the UI
  restockProgress: 0, // ticks worked toward the next auto-produced cup
  ticks: 0, // the simulation clock, incremented by tick()
  paused: false, // when true, tick() skips the simulation (issue #1)
  gameOver: false,
};

// ---------------------------------------------------------------------------
// HELPERS — small pure functions; no side effects, no DOM.
// ---------------------------------------------------------------------------
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lemonBatchCost() {
  return CONFIG.lemonBatchSize * CONFIG.lemonPrice;
}

// The recipe the player selected in the serving dropdown.
function servedRecipe() {
  return CONFIG.recipes[state.servedLevel - 1];
}

// What the stall actually serves: the selected recipe, or — when the crate
// lacks the lemons it needs — the highest unlocked recipe at or below it
// that is still producible (fallback). The base recipe is the floor.
function effectiveRecipe() {
  for (let level = state.servedLevel; level >= 1; level -= 1) {
    if (state.lemons >= CONFIG.recipes[level - 1].lemonsPerCup) {
      return CONFIG.recipes[level - 1];
    }
  }
  return CONFIG.recipes[0];
}

function isFallingBack() {
  return effectiveRecipe() !== servedRecipe();
}

// One-line state of the auto-restock line in the Supplies panel.
function productionStatusText() {
  if (state.stock >= CONFIG.stockCapacity) return 'Stock full';
  if (state.money < CONFIG.productionCost) return 'Not enough money to produce';
  if (state.lemons < effectiveRecipe().lemonsPerCup) return 'Waiting for lemons';
  return `Restocking… ${state.restockProgress}/${CONFIG.productionTicksPerCup}`;
}

// True when the player can produce even one cup: the production money plus a
// lemon if the crate is empty (they could buy one at night). The game-over
// bar is one cup — below it there is no way to earn (issue #5).
function canProduceCup() {
  const needsLemon = state.lemons < 1;
  return state.money >= CONFIG.productionCost + (needsLemon ? CONFIG.lemonPrice : 0);
}

function currentRecipe() {
  return CONFIG.recipes[state.recipeLevel - 1];
}

// The next tier to unlock; undefined once every recipe is mastered.
function nextRecipe() {
  return CONFIG.recipes[state.recipeLevel];
}

function recipeUnlockCost() {
  const next = nextRecipe();
  return next ? next.cost : 0;
}

function recipeMastered() {
  return state.recipeLevel >= CONFIG.recipes.length;
}

// Word of mouth (v0.0.6): customers arrive on a base chance plus a bonus from
// reputation — the more the brand is known, the more people show up. Replaces
// the old attractiveness traffic term; feeds maybeCustomerArrives() in game.js.
function customerArrivalChance() {
  return CONFIG.customerArrivalBase + state.reputation * CONFIG.customerArrivalPerReputation;
}

function buyChance() {
  const score = CONFIG.buyChanceBase
    + (effectiveRecipe().quality - state.price * CONFIG.buyChancePriceWeight) / CONFIG.buyChanceDenominator
    + state.reputation / CONFIG.reputationBonusDenominator;
  return clamp(score, CONFIG.buyChanceMin, CONFIG.buyChanceMax);
}

function companyTitle() {
  let title = TITLES[0].title;
  for (const milestone of TITLES) {
    if (state.cupsSold >= milestone.sales) {
      title = milestone.title;
    }
  }
  return title;
}

// The in-game Date derived from the tick counter and CONFIG.clockStart.
// One source of truth for the clock; the Date constructor handles
// hour/day/month/year carry-over automatically.
function simDate() {
  const start = CONFIG.clockStart;
  return new Date(
    start.year,
    start.month - 1, // Date months are 0-indexed
    start.day,
    start.hour,
    start.minute + state.ticks * CONFIG.clockMinutesPerTick
  );
}

// In-game clock display (issue #1): 24H DD/MM/YYYY timestamp of simDate().
function formatClock() {
  const date = simDate();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// Current in-game hour (0–23) of simDate(); drives the opening-hours check.
function currentHour() {
  return simDate().getHours();
}

// Opening hours (issue #2): open from CONFIG.openHour up to (not including)
// CONFIG.closeHour — so 08:00–22:59 is open and the stall closes at 23:00.
function isOpen() {
  return currentHour() >= CONFIG.openHour && currentHour() < CONFIG.closeHour;
}
