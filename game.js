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
  upgrades: { quality: 0, stall: 0 },
  ticks: 0, // the simulation clock, incremented by tick()
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
  ticks: document.getElementById('ticks'),
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

// ---------------------------------------------------------------------------
// RENDER — draws the current state into the UI. Called after every change,
// so the page always mirrors state.
// ---------------------------------------------------------------------------
function render() {
  els.money.textContent = state.money;
  els.stock.textContent = state.stock;
  els.reputation.textContent = state.reputation;
  els.ticks.textContent = state.ticks;
  els.price.textContent = state.price;
  els.priceSlider.value = state.price;
  els.buyChance.textContent = `${Math.round(buyChance() * 100)}%`;
  els.quality.textContent = state.quality;
  els.attractiveness.textContent = state.attractiveness;
  els.companyTitle.textContent = companyTitle();
  els.finalCups.textContent = state.cupsSold;

  const affordable = (cost) => state.money >= cost && !state.gameOver;
  els.restock.disabled = !affordable(restockCost());
  els.restock.textContent = `Restock ${CONFIG.restockBatchSize} cups — $${restockCost()}`;
  els.upgradeQuality.disabled = !affordable(upgradeCost('quality'));
  els.upgradeQuality.textContent = `${CONFIG.upgrades.quality.name} (+${CONFIG.upgrades.quality.effect} quality) — $${upgradeCost('quality')}`;
  els.upgradeStall.disabled = !affordable(upgradeCost('stall'));
  els.upgradeStall.textContent = `${CONFIG.upgrades.stall.name} (+${CONFIG.upgrades.stall.effect} attractiveness) — $${upgradeCost('stall')}`;
}

// ---------------------------------------------------------------------------
// ACTIONS — the only way to change state: mutate state, then render().
// ---------------------------------------------------------------------------
function setPrice(price) {
  state.price = price;
  render();
}

function restock() {
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
    upgrades: { quality: 0, stall: 0 },
    ticks: 0,
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
  if (state.gameOver) return;
  state.ticks += 1;
  maybeCustomerArrives();
  checkGameOver();
  render();
}

function maybeCustomerArrives() {
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
function init() {
  els.priceSlider.addEventListener('input', (event) => setPrice(Number(event.target.value)));
  els.restock.addEventListener('click', restock);
  els.upgradeQuality.addEventListener('click', () => upgrade('quality'));
  els.upgradeStall.addEventListener('click', () => upgrade('stall'));
  els.restart.addEventListener('click', restart);
  setInterval(tick, CONFIG.tickIntervalMs);
  render();
}

init();
