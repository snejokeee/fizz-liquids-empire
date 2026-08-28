'use strict';

// ---------------------------------------------------------------------------
// CONFIG — every tunable number of the game lives here (DESIGN.md §13).
// Change a value once and the whole game follows; nothing else needs editing.
// ---------------------------------------------------------------------------
const CONFIG = {
  starterMoney: 40,
  starterStock: 10,
  starterAttractiveness: 10,
  defaultPrice: 5,
  tickIntervalMs: 1000, // one simulation tick per second

  // In-game clock (issue #1): the game starts at a fixed date/time and
  // advances clockMinutesPerTick per tick (1 tick = 1 real second).
  clockStart: { year: 1990, month: 8, day: 1, hour: 6, minute: 0 },
  clockMinutesPerTick: 10, // 10 in-game minutes per real second (game speed)

  // Opening hours (issue #2): the stall is open from openHour (08:00) up to
  // closeHour (23:00). No customers arrive while closed. The clock starts at
  // 06:00 — two hours before opening — so a new game begins in the night
  // phase: time to buy supplies before the first customer arrives.
  openHour: 8,
  closeHour: 23,

  // Supplies (issue #5): lemons are bought at night and consumed by
  // production. productionCost is the money part per cup; future stall
  // upgrades will reduce both it and productionTicksPerCup.
  lemonPrice: 1, // $ per lemon
  lemonBatchSize: 10, // lemons per buy click
  productionCost: 1, // $ per cup, the money part of auto-restock
  productionTicksPerCup: 3, // ticks to produce one cup (future stall upgrades reduce this)

  // The stall holds at most stockCapacity cups; auto-restock refills it while
  // supplies allow. Future stall upgrades will raise the capacity.
  stockCapacity: 10,

  // Customer arrival chance per tick (DESIGN.md §6):
  //   base + attractiveness × perAttractiveness
  customerArrivalBase: 0.1,
  customerArrivalPerAttractiveness: 0.002,

  // Buy chance formula (DESIGN.md §6):
  //   clamp(min, max, 0.5 + (quality − price × priceWeight) / denominator
  //         + reputation / reputationBonus)
  buyChanceBase: 0.5,
  buyChancePriceWeight: 10,
  buyChanceDenominator: 200,
  reputationBonusDenominator: 1000,
  buyChanceMin: 0.1,
  buyChanceMax: 0.9,

  reputationPerSale: 1,
  reputationMax: 100,

  // Recipe progression (the upgrade path): 5 tiers, each with a name, its
  // ingredient list (flavor for now — lemons stay the only purchasable supply),
  // the drink quality it sets, and its unlock cost. Quality drives buy chance
  // (see buyChance), so every tier also raises the buy chance. Costs are
  // deliberately steep (issue #5): a normal first day (~$80–90) cannot afford
  // the first unlock on night 1 — the first recipe is a multi-day goal.
  // lemonsPerCup: how many lemons one cup of this recipe needs. Higher tiers
  // cost more to produce (balanced by their higher quality → buy chance);
  // running low on lemons makes the stall fall back to a cheaper recipe.
  recipes: [
    { name: 'Fizzy Lemonade', ingredients: 'water + lemon', quality: 50, cost: 0, lemonsPerCup: 1 },
    { name: 'Iced Lemon Fizz', ingredients: 'water + lemon + ice', quality: 60, cost: 250, lemonsPerCup: 1 },
    { name: 'Citrus Sparkle', ingredients: 'water + lemon + ice + lime', quality: 70, cost: 600, lemonsPerCup: 2 },
    { name: 'Golden Citrus Punch', ingredients: 'water + lemon + lime + orange', quality: 80, cost: 1300, lemonsPerCup: 2 },
    { name: 'Empire Signature', ingredients: 'citrus blend + secret syrup', quality: 90, cost: 2500, lemonsPerCup: 3 },
  ],

  maxLogEntries: 20,
};

// Company titles shown in the header, based on lifetime cups sold (DESIGN.md §8).
const TITLES = [
  { sales: 0, title: 'Sidewalk Stall' },
  { sales: 20, title: 'Neighborhood Favorite' },
  { sales: 50, title: 'Local Brand' },
  { sales: 100, title: 'City Soda Star' },
];

// ---------------------------------------------------------------------------
// STATE — the single source of truth.
// render() only reads state; the UI never holds game data on its own.
// ---------------------------------------------------------------------------
const state = {
  money: CONFIG.starterMoney,
  stock: CONFIG.starterStock,
  lemons: 0, // supply crate: bought at night, consumed by production (issue #5)
  price: CONFIG.defaultPrice,
  attractiveness: CONFIG.starterAttractiveness, // fixed for now — the stall upgrade was cut
  reputation: 0,
  cupsSold: 0,
  totalEarned: 0,
  dayCupsSold: 0, // today's sales, reset when the stall opens (issue #2)
  dayEarned: 0, // today's revenue, reset when the stall opens (issue #2)
  recipeLevel: 1, // highest unlocked recipe tier (1..5); unlocks are night actions
  servedLevel: 1, // recipe the stall serves (1..recipeLevel); chosen in the UI
  restockProgress: 0, // ticks worked toward the next auto-produced cup
  ticks: 0, // the simulation clock, incremented by tick()
  paused: false, // when true, tick() skips the simulation (issue #1)
  gameOver: false,
};

// ---------------------------------------------------------------------------
// DOM references — collected once at startup so render() never re-queries
// the page. Future elements get added here.
// ---------------------------------------------------------------------------
const els = {
  money: document.getElementById('money'),
  stock: document.getElementById('stock'),
  lemons: document.getElementById('lemons'),
  reputation: document.getElementById('reputation'),
  clock: document.getElementById('clock'),
  statusBadge: document.getElementById('status-badge'),
  timeline: document.getElementById('timeline'),
  pause: document.getElementById('pause'),
  skipTime: document.getElementById('skip-time'),
  price: document.getElementById('price'),
  buyChance: document.getElementById('buy-chance'),
  priceSlider: document.getElementById('price-slider'),
  recipeSelect: document.getElementById('recipe-select'),
  servingNote: document.getElementById('serving-note'),
  productionStatus: document.getElementById('production-status'),
  buyLemons: document.getElementById('buy-lemons'),
  quality: document.getElementById('quality'),
  attractiveness: document.getElementById('attractiveness'),
  drinkName: document.getElementById('drink-name'),
  recipeName: document.getElementById('recipe-name'),
  recipeIngredients: document.getElementById('recipe-ingredients'),
  upgradeRecipe: document.getElementById('upgrade-recipe'),
  companyTitle: document.getElementById('company-title'),
  logList: document.getElementById('log-list'),
  gameOverOverlay: document.getElementById('game-over'),
  finalCups: document.getElementById('final-cups'),
  restart: document.getElementById('restart'),
};

// ---------------------------------------------------------------------------
// HELPERS — small pure functions; no side effects, no DOM.
// ---------------------------------------------------------------------------
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addLog(message) {
  const entry = document.createElement('li');
  entry.textContent = message;
  els.logList.prepend(entry); // newest on top
  while (els.logList.children.length > CONFIG.maxLogEntries) {
    els.logList.children[els.logList.children.length - 1].remove();
  }
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

// One-line state of the auto-restock line in the Stall panel.
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

// ---------------------------------------------------------------------------
// TOOLTIPS — hover help for stats, buy chance and upgrades.
// Content is built from CONFIG/state on hover, so it always matches the
// numbers the player sees; nothing here is hardcoded.
// ---------------------------------------------------------------------------
function fmtPct(value) {
  return `${Math.round(value * 100)}%`;
}

function fmtSignedPct(value) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.round(Math.abs(value) * 100)}%`;
}

// The buy chance formula (DESIGN.md §6), split into its four parts so the
// tooltip can show where the final percentage comes from.
function buyChanceBreakdown() {
  return {
    base: CONFIG.buyChanceBase,
    quality: effectiveRecipe().quality / CONFIG.buyChanceDenominator,
    price: -(state.price * CONFIG.buyChancePriceWeight) / CONFIG.buyChanceDenominator,
    reputation: state.reputation / CONFIG.reputationBonusDenominator,
    total: buyChance(), // already clamped to [min, max]
  };
}

function tooltipReputationHTML() {
  const effect = state.reputation / CONFIG.reputationBonusDenominator;
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Reputation</div>
    <div class="tooltip-stats">
      <div><span>Current</span><span>${state.reputation} / ${CONFIG.reputationMax}</span></div>
      <div><span>Buy chance bonus</span><span>+${fmtPct(effect)}</span></div>
      <div><span>Per sale</span><span>+${CONFIG.reputationPerSale}</span></div>
    </div>`;
}

function tooltipQualityHTML() {
  const recipe = effectiveRecipe();
  const effect = recipe.quality / CONFIG.buyChanceDenominator;
  const next = nextRecipe();
  const nextGain = next ? `+${next.quality - currentRecipe().quality} quality` : '—';
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Quality</div>
    <div class="tooltip-stats">
      <div><span>Current</span><span>${recipe.quality}</span></div>
      <div><span>Buy chance bonus</span><span>+${fmtPct(effect)}</span></div>
      <div><span>From recipe</span><span>${recipe.name}</span></div>
      <div><span>Next recipe adds</span><span>${nextGain}</span></div>
    </div>`;
}

function tooltipAttractivenessHTML() {
  const arrival = CONFIG.customerArrivalBase
    + state.attractiveness * CONFIG.customerArrivalPerAttractiveness;
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Attractiveness</div>
    <div class="tooltip-stats">
      <div><span>Current</span><span>${state.attractiveness}</span></div>
      <div><span>Arrival chance/tick</span><span>${fmtPct(arrival)}</span></div>
      <div><span>Base chance</span><span>${fmtPct(CONFIG.customerArrivalBase)}</span></div>
      <div><span>Fixed for now</span><span>stall upgrades come later</span></div>
    </div>`;
}

function tooltipBuyChanceHTML() {
  const b = buyChanceBreakdown();
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Buy chance</div>
    <div class="tooltip-stats">
      <div><span>Base</span><span>+${fmtPct(b.base)}</span></div>
      <div><span>Quality</span><span>${fmtSignedPct(b.quality)}</span></div>
      <div><span>Price</span><span>${fmtSignedPct(b.price)}</span></div>
      <div><span>Reputation</span><span>${fmtSignedPct(b.reputation)}</span></div>
      <div><span>Total</span><span>${fmtPct(b.total)}</span></div>
    </div>`;
}

function tooltipLemonsHTML() {
  const recipe = servedRecipe();
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Lemons</div>
    <div class="tooltip-stats">
      <div><span>Price</span><span>$${CONFIG.lemonPrice} each</span></div>
      <div><span>${recipe.name} needs</span><span>${recipe.lemonsPerCup} per cup</span></div>
      <div><span>Bought</span><span>only while closed</span></div>
    </div>`;
}

// The recipe ladder (DESIGN.md §7): every tier with its quality and unlock
// cost, so the player can see the whole progression at a glance.
function tooltipRecipeHTML() {
  const rows = CONFIG.recipes.map((recipe, i) => {
    const unlocked = i < state.recipeLevel;
    const cost = i === 0 ? 'starter' : `$${recipe.cost}`;
    return `<div><span>${unlocked ? '✓ ' : ''}${recipe.name}</span><span>${recipe.quality} q · ${recipe.lemonsPerCup} lemon/cup · ${cost}</span></div>`;
  }).join('');
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Recipe progression</div>
    <div class="tooltip-stats">
      ${rows}
      <div><span>Each level adds</span><span>+10 quality / +5% buy chance</span></div>
    </div>`;
}

function tooltipServingHTML() {
  const recipe = servedRecipe();
  const fallback = isFallingBack() ? effectiveRecipe() : null;
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Serving</div>
    <div class="tooltip-stats">
      <div><span>Selected</span><span>${recipe.name}</span></div>
      <div><span>Needs</span><span>${recipe.lemonsPerCup} lemon${recipe.lemonsPerCup === 1 ? '' : 's'} + $1 per cup</span></div>
      <div><span>Fallback</span><span>${fallback ? `${fallback.name} (low on lemons)` : '—'}</span></div>
    </div>`;
}

// Which content builder each tooltip element (by id) uses.
const TOOLTIP_CONTENT = {
  'tooltip-reputation': tooltipReputationHTML,
  'tooltip-quality': tooltipQualityHTML,
  'tooltip-attractiveness': tooltipAttractivenessHTML,
  'tooltip-buy-chance': tooltipBuyChanceHTML,
  'tooltip-lemons': tooltipLemonsHTML,
  'tooltip-recipe': tooltipRecipeHTML,
  'tooltip-serving': tooltipServingHTML,
};

function positionTooltipAt(tooltip, x, y) {
  const margin = 12;
  let left = x + margin;
  let top = y + margin;
  if (left + tooltip.offsetWidth > window.innerWidth) {
    left = x - margin - tooltip.offsetWidth;
  }
  if (top + tooltip.offsetHeight > window.innerHeight) {
    top = y - margin - tooltip.offsetHeight;
  }
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function showTooltip(tooltip, x, y) {
  positionTooltipAt(tooltip, x, y);
  tooltip.classList.add('visible');
}

function hideTooltip(tooltip) {
  tooltip.classList.remove('visible');
}

function hideAllTooltips() {
  document.querySelectorAll('.tooltip.visible').forEach(hideTooltip);
}

// ---------------------------------------------------------------------------
// RENDER — draws the current state into the UI. Called after every change,
// so the page always mirrors state.
// ---------------------------------------------------------------------------
function render() {
  els.money.textContent = state.money;
  els.stock.textContent = `${state.stock} / ${CONFIG.stockCapacity}`;
  els.lemons.textContent = state.lemons;
  els.reputation.textContent = state.reputation;
  els.clock.textContent = formatClock();
  const open = isOpen();
  // The badge reflects the simulation phase: OPEN/CLOSED from the clock, or
  // PAUSED when the player has stopped time — CLOSED is only about night hours.
  els.statusBadge.textContent = state.paused ? 'PAUSED' : open ? 'OPEN' : 'CLOSED';
  els.statusBadge.classList.toggle('open', !state.paused && open);
  els.statusBadge.classList.toggle('closed', !state.paused && !open);
  els.statusBadge.classList.toggle('paused', state.paused);
  els.timeline.classList.toggle('paused', state.paused);
  els.pause.textContent = state.paused ? 'Play' : 'Pause';
  els.pause.disabled = state.gameOver;
  els.skipTime.classList.toggle('hidden', state.gameOver);
  els.skipTime.textContent = open ? 'Wait until closing' : 'Wait until morning';
  els.price.textContent = state.price;
  els.priceSlider.value = state.price;
  els.buyChance.textContent = `${Math.round(buyChance() * 100)}%`;
  const effective = effectiveRecipe();
  els.quality.textContent = effective.quality;
  els.attractiveness.textContent = state.attractiveness;
  els.drinkName.textContent = effective.name;
  els.recipeName.textContent = effective.name;
  els.recipeIngredients.textContent = effective.ingredients;
  els.companyTitle.textContent = companyTitle();
  els.finalCups.textContent = state.cupsSold;

  // Phase gating (issue #3): recipe unlocks and supply shopping are night
  // actions; the serving choice and auto-restock work any time.
  const affordable = (cost) => state.money >= cost && !state.gameOver;
  els.buyLemons.disabled = open || !affordable(lemonBatchCost());
  els.buyLemons.textContent = `Buy ${CONFIG.lemonBatchSize} lemons — $${lemonBatchCost()}${open ? ' (only while closed)' : ''}`;
  const mastered = recipeMastered();
  const next = nextRecipe();
  els.upgradeRecipe.disabled = mastered || open || !affordable(recipeUnlockCost());
  els.upgradeRecipe.textContent = mastered
    ? 'All recipes mastered'
    : `Unlock ${next.name} — $${recipeUnlockCost()}${open ? ' (only while closed)' : ''}`;

  // Serving selector: one option per unlocked recipe, current served level selected.
  const options = CONFIG.recipes
    .slice(0, state.recipeLevel)
    .map((recipe, i) => `<option value="${i + 1}">${recipe.name}</option>`)
    .join('');
  els.recipeSelect.innerHTML = options;
  els.recipeSelect.value = String(state.servedLevel);
  els.recipeSelect.disabled = state.gameOver;
  if (isFallingBack()) {
    els.servingNote.textContent = `Out of lemons for ${servedRecipe().name} — serving ${effective.name}.`;
  } else {
    els.servingNote.textContent = `${servedRecipe().name} — ${servedRecipe().lemonsPerCup} lemon${servedRecipe().lemonsPerCup === 1 ? '' : 's'} + $1 per cup`;
  }
  els.productionStatus.textContent = productionStatusText();
}

// ---------------------------------------------------------------------------
// ACTIONS — the only way to change state: mutate state, then render().
// ---------------------------------------------------------------------------
function setPrice(price) {
  state.price = price;
  render();
}

// Which recipe the stall serves, chosen in the dropdown (1..recipeLevel).
function setServedRecipe(level) {
  state.servedLevel = Math.max(1, Math.min(state.recipeLevel, level));
  render();
}

// Night shopping (issue #5): while the stall is closed the player buys
// supplies for the next day. The day loop is unchanged: sell while
// auto-restock keeps the cups coming.
function buyLemons() {
  if (isOpen()) {
    addLog('Supplies are only available while the stall is closed.');
    return;
  }
  const cost = lemonBatchCost();
  if (state.money < cost) {
    addLog(`Not enough money for lemons ($${cost}).`);
    return;
  }
  state.money -= cost;
  state.lemons += CONFIG.lemonBatchSize;
  addLog(`Bought ${CONFIG.lemonBatchSize} lemons for $${cost}.`);
  render();
}

// Recipe unlock (the upgrade path): night-gated like the old upgrades. Each
// tier sets a new quality, which raises the buy chance (DESIGN.md §7).
function upgradeRecipe() {
  if (recipeMastered()) {
    addLog('You already mastered every recipe.');
    return;
  }
  if (isOpen()) {
    addLog('Recipe upgrades are only available while the stall is closed.');
    return;
  }
  const next = nextRecipe();
  if (state.money < next.cost) {
    addLog(`Not enough money for ${next.name} ($${next.cost}).`);
    return;
  }
  state.money -= next.cost;
  state.recipeLevel += 1;
  state.servedLevel = state.recipeLevel; // serve the new best recipe by default
  addLog(`Recipe unlocked: ${currentRecipe().name}! Quality is now ${currentRecipe().quality}.`);
  render();
}

// "Fast-forward to the next day boundary" (issue #6): skip dead time in one
// click. While open it waits until closing (23:00), while closed it waits
// until the next opening (08:00). A pure time skip — no customers, no income
// during the jump. Works while paused (it is an action, not a tick).
function skipToBoundary() {
  if (state.gameOver) return;
  const now = simDate();
  const wasOpen = isOpen();
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    wasOpen ? CONFIG.closeHour : CONFIG.openHour,
    0
  );
  if (!wasOpen && target <= now) {
    target.setDate(target.getDate() + 1); // night: the next opening may be tomorrow
  }
  const skippedTicks = Math.round((target - now) / 60000 / CONFIG.clockMinutesPerTick);
  state.ticks += skippedTicks;
  for (let i = 0; i < skippedTicks; i += 1) {
    autoRestockStep(); // time passes: supplies keep flowing into cups
  }
  handleDayBoundary(wasOpen);
  render();
}

function togglePause() {
  if (state.gameOver) return;
  state.paused = !state.paused;
  render();
}

function restart() {
  Object.assign(state, {
    money: CONFIG.starterMoney,
    stock: CONFIG.starterStock,
    lemons: 0,
    price: CONFIG.defaultPrice,
    attractiveness: CONFIG.starterAttractiveness,
    reputation: 0,
    cupsSold: 0,
    totalEarned: 0,
    dayCupsSold: 0,
    dayEarned: 0,
    recipeLevel: 1,
    servedLevel: 1,
    restockProgress: 0,
    ticks: 0,
    paused: false,
    gameOver: false,
  });
  els.logList.replaceChildren();
  els.gameOverOverlay.classList.add('hidden');
  render();
}

// ---------------------------------------------------------------------------
// TICK — the simulation loop. Runs once per second (CONFIG.tickIntervalMs).
// Each tick: customers may arrive, then the game-over condition is checked.
// ---------------------------------------------------------------------------
// Logs day/night boundary events (issue #2) and resets the day counters on
// opening. Called after the clock advances, whether by tick() or by the
// fast-forward action (issue #6).
function handleDayBoundary(wasOpen) {
  if (isOpen() && !wasOpen) {
    // The stall opens for a new day: start fresh day counters.
    state.dayCupsSold = 0;
    state.dayEarned = 0;
    addLog('The stall opens for the day!');
  } else if (!isOpen() && wasOpen) {
    // Closing time: recap the day that just ended.
    addLog('Closing time — the stall is now closed.');
    addLog(`Today: ${state.dayCupsSold} cups sold, $${state.dayEarned} earned.`);
  }
}

// Auto-restock: while the stall holds fewer cups than capacity and the crate
// + wallet allow, one cup is produced every productionTicksPerCup ticks, at
// productionCost plus the effective recipe's lemons per cup. Runs every tick
// (day and night) and during fast-forward — deterministic, no randomness —
// so buying lemons at night preps the stall for the morning. Future stall
// upgrades will make it faster and cheaper.
function autoRestockStep() {
  if (state.stock >= CONFIG.stockCapacity) {
    state.restockProgress = 0;
    return;
  }
  const recipe = effectiveRecipe();
  if (state.lemons < recipe.lemonsPerCup || state.money < CONFIG.productionCost) {
    return; // wait for supplies — progress is kept
  }
  state.restockProgress += 1;
  if (state.restockProgress >= CONFIG.productionTicksPerCup) {
    state.restockProgress = 0;
    state.money -= CONFIG.productionCost;
    state.lemons -= recipe.lemonsPerCup;
    state.stock += 1;
  }
}

function tick() {
  if (state.gameOver || state.paused) return;
  const wasOpen = isOpen();
  state.ticks += 1;
  handleDayBoundary(wasOpen);
  autoRestockStep();
  maybeCustomerArrives();
  checkGameOver();
  render();
}

function maybeCustomerArrives() {
  if (!isOpen()) return; // hard gate: no customers while the stall is closed (issue #2)
  const chance = CONFIG.customerArrivalBase
    + state.attractiveness * CONFIG.customerArrivalPerAttractiveness;
  if (Math.random() < chance) {
    customerVisits();
  }
}

function customerVisits() {
  if (state.stock === 0) {
    addLog('Sold out — a customer walked away.');
    return;
  }
  if (Math.random() < buyChance()) {
    state.money += state.price;
    state.stock -= 1;
    state.reputation = Math.min(
      state.reputation + CONFIG.reputationPerSale,
      CONFIG.reputationMax
    );
    state.cupsSold += 1;
    state.totalEarned += state.price;
    state.dayCupsSold += 1;
    state.dayEarned += state.price;
    addLog(`A customer bought a cup for $${state.price}.`);
  } else {
    addLog('A customer looked at the price and walked away.');
  }
}

// ---------------------------------------------------------------------------
// GAME OVER — you lose when you have nothing to sell and cannot produce even
// one cup: production money plus a lemon if the crate is empty (DESIGN.md §9,
// issue #5). The overlay asks the player to restart.
// ---------------------------------------------------------------------------
function checkGameOver() {
  if (state.stock === 0 && !canProduceCup()) {
    state.gameOver = true;
    els.gameOverOverlay.classList.remove('hidden');
  }
}

// ---------------------------------------------------------------------------
// INIT — wire up the page and draw the first frame.
// The script tag sits at the end of <body>, so the DOM already exists here.
// ---------------------------------------------------------------------------
// Tooltip events: any element with data-tooltip (help icons) shows its
// tooltip on hover and follows the cursor; taps toggle on touch devices.
function wireTooltips() {
  document.querySelectorAll('[data-tooltip]').forEach((icon) => {
    const tooltip = document.getElementById(icon.dataset.tooltip);
    const buildContent = TOOLTIP_CONTENT[icon.dataset.tooltip];
    if (!tooltip || !buildContent) return;

    icon.addEventListener('mouseenter', (event) => {
      tooltip.innerHTML = buildContent();
      showTooltip(tooltip, event.clientX, event.clientY);
    });
    icon.addEventListener('mousemove', (event) => {
      positionTooltipAt(tooltip, event.clientX, event.clientY);
    });
    icon.addEventListener('mouseleave', () => hideTooltip(tooltip));

    icon.addEventListener('touchstart', (event) => {
      event.preventDefault();
      const rect = icon.getBoundingClientRect();
      if (tooltip.classList.contains('visible')) {
        hideTooltip(tooltip);
      } else {
        hideAllTooltips();
        tooltip.innerHTML = buildContent();
        showTooltip(tooltip, rect.left + rect.width / 2, rect.bottom);
      }
    });
    icon.addEventListener('touchend', (event) => {
      event.preventDefault();
      hideTooltip(tooltip);
    });
  });

  // Tapping anywhere else closes any open tooltip (icon taps are handled
  // above, so ignore events that start on a help icon).
  document.addEventListener('touchstart', (event) => {
    if (!event.target.closest('[data-tooltip]')) {
      hideAllTooltips();
    }
  });
}

function init() {
  els.priceSlider.addEventListener('input', (event) => setPrice(Number(event.target.value)));
  els.recipeSelect.addEventListener('change', (event) => setServedRecipe(Number(event.target.value)));
  els.buyLemons.addEventListener('click', buyLemons);
  els.upgradeRecipe.addEventListener('click', upgradeRecipe);
  els.pause.addEventListener('click', togglePause);
  els.skipTime.addEventListener('click', skipToBoundary);
  els.restart.addEventListener('click', restart);
  wireTooltips();
  setInterval(tick, CONFIG.tickIntervalMs);
  render();
}

init();
