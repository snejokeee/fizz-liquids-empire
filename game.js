'use strict';

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
  productionExplain: document.getElementById('production-explain'),
  buyLemons: document.getElementById('buy-lemons'),
  quality: document.getElementById('quality'),
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
// Only write the DOM when the displayed text actually changed. render() runs
// every tick, and skipping no-op writes keeps the browser from re-laying-out
// elements whose value did not move.
function setText(el, value) {
  const text = String(value);
  if (el.textContent !== text) el.textContent = text;
}

function addLog(message) {
  const entry = document.createElement('li');
  entry.textContent = message;
  els.logList.prepend(entry); // newest on top
  while (els.logList.children.length > CONFIG.maxLogEntries) {
    els.logList.children[els.logList.children.length - 1].remove();
  }
}

// ---------------------------------------------------------------------------
// RENDER — draws the current state into the UI. Called after every change,
// so the page always mirrors state.
// ---------------------------------------------------------------------------
function render() {
  setText(els.money, state.money);
  setText(els.stock, `${state.stock} / ${CONFIG.stockCapacity}`);
  setText(els.lemons, state.lemons);
  setText(els.reputation, `${state.reputation} / ${CONFIG.reputationMax}`);
  setText(els.clock, formatClock());
  const open = isOpen();
  // The badge reflects the simulation phase: OPEN/CLOSED from the clock, or
  // PAUSED when the player has stopped time — CLOSED is only about night hours.
  // The timeline classes (.open/.paused) drive the CSS day/night icons and
  // the glow/stripes; <body>.paused drives the board-wide dim while frozen.
  setText(els.statusBadge, state.paused ? 'PAUSED' : open ? 'OPEN' : 'CLOSED');
  els.statusBadge.classList.toggle('open', !state.paused && open);
  els.statusBadge.classList.toggle('closed', !state.paused && !open);
  els.statusBadge.classList.toggle('paused', state.paused);
  els.timeline.classList.toggle('paused', state.paused);
  els.timeline.classList.toggle('open', !state.paused && open);
  document.body.classList.toggle('paused', state.paused);
  setText(els.pause, state.paused ? 'Play' : 'Pause');
  els.pause.disabled = state.gameOver;
  els.skipTime.classList.toggle('hidden', state.gameOver);
  setText(els.skipTime, open ? 'Wait until closing' : 'Wait until morning');
  setText(els.price, state.price);
  els.priceSlider.value = state.price;
  setText(els.buyChance, `${Math.round(buyChance() * 100)}%`);
  const effective = effectiveRecipe();
  setText(els.quality, effective.quality);
  setText(els.drinkName, effective.name);
  setText(els.recipeName, effective.name);
  setText(els.recipeIngredients, effective.ingredients);
  setText(els.companyTitle, companyTitle());
  setText(els.finalCups, state.cupsSold);

  // Phase gating (issue #3): recipe unlocks and supply shopping are night
  // actions; the serving choice and auto-restock work any time.
  const affordable = (cost) => state.money >= cost && !state.gameOver;
  els.buyLemons.disabled = open || !affordable(lemonBatchCost());
  setText(els.buyLemons, `Buy ${CONFIG.lemonBatchSize} lemons — $${lemonBatchCost()}${open ? ' (only while closed)' : ''}`);
  const mastered = recipeMastered();
  const next = nextRecipe();
  els.upgradeRecipe.disabled = mastered || open || !affordable(recipeUnlockCost());
  setText(els.upgradeRecipe, mastered
    ? 'All recipes mastered'
    : `Unlock ${next.name} — $${recipeUnlockCost()}${open ? ' (only while closed)' : ''}`);

  // Serving selector: one option per unlocked recipe, current served level
  // selected. Options only change when a new recipe unlocks, so rebuild the
  // list only then — render() runs every tick, and re-parsing identical HTML
  // would churn the DOM for no reason.
  const options = CONFIG.recipes
    .slice(0, state.recipeLevel)
    .map((recipe, i) => `<option value="${i + 1}">${recipe.name}</option>`)
    .join('');
  if (els.recipeSelect.innerHTML !== options) {
    els.recipeSelect.innerHTML = options;
  }
  els.recipeSelect.value = String(state.servedLevel);
  els.recipeSelect.disabled = state.gameOver;
  if (isFallingBack()) {
    setText(els.servingNote, `Out of lemons for ${servedRecipe().name} — serving ${effective.name}.`);
  } else {
    setText(els.servingNote, `${servedRecipe().name} — ${servedRecipe().lemonsPerCup} lemon${servedRecipe().lemonsPerCup === 1 ? '' : 's'} + $1 per cup`);
  }
  setText(els.productionStatus, productionStatusText());
  setText(els.productionExplain, `While stock is below ${CONFIG.stockCapacity} cups, the stall brews 1 cup every ${CONFIG.productionTicksPerCup} ticks — $${CONFIG.productionCost} + ${effective.lemonsPerCup} lemon${effective.lemonsPerCup === 1 ? '' : 's'} (${effective.name}) per cup.`);
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
    reputation: 0,
    cupsSold: 0,
    totalEarned: 0,
    dayCupsSold: 0,
    dayEarned: 0,
    dayReputation: 0,
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
    state.dayReputation = 0;
    addLog('The stall opens for the day!');
  } else if (!isOpen() && wasOpen) {
    // Closing time: recap the day that just ended.
    addLog('Closing time — the stall is now closed.');
    addLog(`Today: ${state.dayCupsSold} cups sold, $${state.dayEarned} earned. Reputation +${state.dayReputation} → ${state.reputation}.`);
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
  if (Math.random() < customerArrivalChance()) {
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
    // Reputation grows by the sale price (v0.0.6): pricier sales build the
    // brand more. Feeds buy chance and word-of-mouth traffic.
    const repGain = state.price;
    state.reputation = Math.min(state.reputation + repGain, CONFIG.reputationMax);
    state.dayReputation += repGain;
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
