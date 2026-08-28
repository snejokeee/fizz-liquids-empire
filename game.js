'use strict';

// ---------------------------------------------------------------------------
// CONFIG — every tunable number of the game lives here (DESIGN.md §13).
// Change a value once and the whole game follows; nothing else needs editing.
// ---------------------------------------------------------------------------
const CONFIG = {
  starterMoney: 50,
  starterStock: 10,
  starterQuality: 50,
  starterAttractiveness: 10,
  defaultPrice: 5,
  tickIntervalMs: 1000, // one simulation tick per second

  // In-game clock (issue #1): the game starts at a fixed date/time and
  // advances clockMinutesPerTick per tick (1 tick = 1 real second).
  clockStart: { year: 1990, month: 8, day: 1, hour: 8, minute: 0 },
  clockMinutesPerTick: 1,

  // Opening hours (issue #2): the stall is open from openHour (08:00) up to
  // closeHour (23:00). No customers arrive while closed. The clock starts at
  // 08:00 so a new game opens immediately.
  openHour: 8,
  closeHour: 23,

  ingredientCost: 2, // $ per cup
  restockBatchSize: 10, // cups per restock button press

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

  // Upgrade definitions: key → { name, stat it raises, cost curve, effect per level }
  upgrades: {
    quality: { name: 'Better Recipe', stat: 'quality', baseCost: 30, growth: 1.6, effect: 10 },
    stall: { name: 'Nicer Stall', stat: 'attractiveness', baseCost: 25, growth: 1.6, effect: 10 },
  },

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
  price: CONFIG.defaultPrice,
  quality: CONFIG.starterQuality,
  attractiveness: CONFIG.starterAttractiveness,
  reputation: 0,
  cupsSold: 0,
  totalEarned: 0,
  dayCupsSold: 0, // today's sales, reset when the stall opens (issue #2)
  dayEarned: 0, // today's revenue, reset when the stall opens (issue #2)
  upgrades: { quality: 0, stall: 0 },
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
  reputation: document.getElementById('reputation'),
  clock: document.getElementById('clock'),
  statusBadge: document.getElementById('status-badge'),
  timeline: document.getElementById('timeline'),
  pause: document.getElementById('pause'),
  price: document.getElementById('price'),
  buyChance: document.getElementById('buy-chance'),
  priceSlider: document.getElementById('price-slider'),
  restock: document.getElementById('restock'),
  quality: document.getElementById('quality'),
  attractiveness: document.getElementById('attractiveness'),
  upgradeQuality: document.getElementById('upgrade-quality'),
  upgradeStall: document.getElementById('upgrade-stall'),
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

function restockCost() {
  return CONFIG.restockBatchSize * CONFIG.ingredientCost;
}

function upgradeCost(key) {
  const def = CONFIG.upgrades[key];
  return Math.round(def.baseCost * Math.pow(def.growth, state.upgrades[key]));
}

function buyChance() {
  const score = CONFIG.buyChanceBase
    + (state.quality - state.price * CONFIG.buyChancePriceWeight) / CONFIG.buyChanceDenominator
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
    quality: state.quality / CONFIG.buyChanceDenominator,
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
  const effect = state.quality / CONFIG.buyChanceDenominator;
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Quality</div>
    <div class="tooltip-stats">
      <div><span>Current</span><span>${state.quality}</span></div>
      <div><span>Buy chance bonus</span><span>+${fmtPct(effect)}</span></div>
      <div><span>Raised by</span><span>${CONFIG.upgrades.quality.name} (+${CONFIG.upgrades.quality.effect})</span></div>
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
      <div><span>Raised by</span><span>${CONFIG.upgrades.stall.name} (+${CONFIG.upgrades.stall.effect})</span></div>
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

function tooltipUpgradeHTML(key) {
  const def = CONFIG.upgrades[key];
  const level = state.upgrades[key];
  let invested = 0;
  for (let i = 0; i < level; i += 1) {
    invested += Math.round(def.baseCost * Math.pow(def.growth, i));
  }
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> ${def.name}</div>
    <div class="tooltip-stats">
      <div><span>Level</span><span>${level}</span></div>
      <div><span>Bonus</span><span>+${level * def.effect} ${def.stat}</span></div>
      <div><span>Invested so far</span><span>$${invested}</span></div>
      <div><span>Next level</span><span>$${upgradeCost(key)}</span></div>
    </div>`;
}

// Which content builder each tooltip element (by id) uses.
const TOOLTIP_CONTENT = {
  'tooltip-reputation': tooltipReputationHTML,
  'tooltip-quality': tooltipQualityHTML,
  'tooltip-attractiveness': tooltipAttractivenessHTML,
  'tooltip-buy-chance': tooltipBuyChanceHTML,
  'tooltip-upgrade-quality': () => tooltipUpgradeHTML('quality'),
  'tooltip-upgrade-stall': () => tooltipUpgradeHTML('stall'),
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
  els.stock.textContent = state.stock;
  els.reputation.textContent = state.reputation;
  els.clock.textContent = formatClock();
  const open = isOpen();
  els.statusBadge.textContent = open ? 'OPEN' : 'CLOSED';
  els.statusBadge.classList.toggle('open', open);
  els.statusBadge.classList.toggle('closed', !open);
  els.timeline.classList.toggle('paused', state.paused);
  els.pause.textContent = state.paused ? 'Play' : 'Pause';
  els.pause.disabled = state.gameOver;
  els.price.textContent = state.price;
  els.priceSlider.value = state.price;
  els.buyChance.textContent = `${Math.round(buyChance() * 100)}%`;
  els.quality.textContent = state.quality;
  els.attractiveness.textContent = state.attractiveness;
  els.companyTitle.textContent = companyTitle();
  els.finalCups.textContent = state.cupsSold;

  // Phase gating (issue #3): restock is a day action, upgrades are night actions.
  const affordable = (cost) => state.money >= cost && !state.gameOver;
  els.restock.disabled = !open || !affordable(restockCost());
  els.restock.textContent = `Restock ${CONFIG.restockBatchSize} cups — $${restockCost()}${open ? '' : ' (only while open)'}`;
  els.upgradeQuality.disabled = open || !affordable(upgradeCost('quality'));
  els.upgradeQuality.textContent = `${CONFIG.upgrades.quality.name} (+${CONFIG.upgrades.quality.effect} quality) — $${upgradeCost('quality')}${open ? ' (only while closed)' : ''}`;
  els.upgradeStall.disabled = open || !affordable(upgradeCost('stall'));
  els.upgradeStall.textContent = `${CONFIG.upgrades.stall.name} (+${CONFIG.upgrades.stall.effect} attractiveness) — $${upgradeCost('stall')}${open ? ' (only while closed)' : ''}`;
}

// ---------------------------------------------------------------------------
// ACTIONS — the only way to change state: mutate state, then render().
// ---------------------------------------------------------------------------
function setPrice(price) {
  state.price = price;
  render();
}

function restock() {
  if (!isOpen()) {
    addLog('Restock is only available while the stall is open.');
    return;
  }
  const cost = restockCost();
  if (state.money < cost) {
    addLog(`Not enough money to restock ($${cost}).`);
    return;
  }
  state.money -= cost;
  state.stock += CONFIG.restockBatchSize;
  addLog(`Restocked ${CONFIG.restockBatchSize} cups for $${cost}.`);
  render();
}

function upgrade(key) {
  const def = CONFIG.upgrades[key];
  if (isOpen()) {
    addLog(`${def.name} is only available while the stall is closed.`);
    return;
  }
  const cost = upgradeCost(key);
  if (state.money < cost) {
    addLog(`Not enough money for ${def.name} ($${cost}).`);
    return;
  }
  state.money -= cost;
  state.upgrades[key] += 1;
  state[def.stat] += def.effect;
  addLog(`${def.name}! ${def.stat} is now ${state[def.stat]}.`);
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
    price: CONFIG.defaultPrice,
    quality: CONFIG.starterQuality,
    attractiveness: CONFIG.starterAttractiveness,
    reputation: 0,
    cupsSold: 0,
    totalEarned: 0,
    dayCupsSold: 0,
    dayEarned: 0,
    upgrades: { quality: 0, stall: 0 },
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
function tick() {
  if (state.gameOver || state.paused) return;
  const wasOpen = isOpen();
  state.ticks += 1;
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
// GAME OVER — you lose when you have nothing to sell and cannot afford to
// restock (DESIGN.md §9). The overlay asks the player to restart.
// ---------------------------------------------------------------------------
function checkGameOver() {
  if (state.stock === 0 && state.money < restockCost()) {
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
  els.restock.addEventListener('click', restock);
  els.upgradeQuality.addEventListener('click', () => upgrade('quality'));
  els.upgradeStall.addEventListener('click', () => upgrade('stall'));
  els.pause.addEventListener('click', togglePause);
  els.restart.addEventListener('click', restart);
  wireTooltips();
  setInterval(tick, CONFIG.tickIntervalMs);
  render();
}

init();
