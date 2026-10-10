'use strict';

// ---------------------------------------------------------------------------
// tooltips.js — the hover-help UI feature: content builders that read
// CONFIG/state, plus positioning and show/hide helpers. One self-contained
// feature that only reads state, never mutates it.
// Depends on: config.js, state.js.
// ---------------------------------------------------------------------------
function fmtPct(value) {
  return `${Math.round(value * 100)}%`;
}

function fmtSignedPct(value) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.round(Math.abs(value) * 100)}%`;
}

// The sell chance formula (DESIGN.md §6), split into its four parts so the
// tooltip can show where the final percentage comes from.
function sellChanceBreakdown() {
  return {
    base: CONFIG.buyChanceBase,
    quality: effectiveRecipe().quality / CONFIG.buyChanceDenominator,
    price: -(state.price * CONFIG.buyChancePriceWeight) / CONFIG.buyChanceDenominator,
    reputation: state.reputation / CONFIG.reputationBonusDenominator,
    total: buyChance(), // already clamped to [min, max]
  };
}

function tooltipReputationHTML() {
  const sellEffect = state.reputation / CONFIG.reputationBonusDenominator;
  const wordOfMouth = state.reputation * CONFIG.customerArrivalPerReputation;
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Reputation</div>
    <div class="tooltip-stats">
      <div><span>Current</span><span>${Math.floor(state.reputation)} / ${CONFIG.reputationMax}</span></div>
      <div><span>Sell chance bonus</span><span>+${fmtPct(sellEffect)}</span></div>
      <div><span>Word of mouth</span><span>+${fmtPct(wordOfMouth)}/tick</span></div>
      <div><span>Per sale</span><span>+${state.price * CONFIG.reputationGainPerDollar} (price × ${CONFIG.reputationGainPerDollar})</span></div>
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
      <div><span>Sell chance bonus</span><span>+${fmtPct(effect)}</span></div>
      <div><span>From recipe</span><span>${recipe.name}</span></div>
      <div><span>Next recipe adds</span><span>${nextGain}</span></div>
    </div>`;
}

function tooltipSellChanceHTML() {
  const b = sellChanceBreakdown();
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Sell chance</div>
    <div class="tooltip-stats">
      <div><span>Base</span><span>+${fmtPct(b.base)}</span></div>
      <div><span>Quality</span><span>${fmtSignedPct(b.quality)}</span></div>
      <div><span>Price</span><span>${fmtSignedPct(b.price)}</span></div>
      <div><span>Reputation</span><span>${fmtSignedPct(b.reputation)}</span></div>
      <div><span>Total</span><span>${fmtPct(b.total)}</span></div>
    </div>`;
}

function tooltipLemonsHTML() {
  const recipe = currentRecipe();
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
      <div><span>Each level adds</span><span>+10 quality / +5% sell chance</span></div>
    </div>`;
}

// Arrival chance breakdown (issue #11): base traffic plus the reputation
// word-of-mouth bonus. The "per open day" line turns the per-tick chance into
// the number the player actually feels (DESIGN.md §6).
function tooltipArrivalHTML() {
  const base = CONFIG.customerArrivalBase;
  const wordOfMouth = state.reputation * CONFIG.customerArrivalPerReputation;
  const total = customerArrivalChance();
  const openTicksPerDay = ((CONFIG.closeHour - CONFIG.openHour) * 60) / CONFIG.clockMinutesPerTick;
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Arrival chance</div>
    <div class="tooltip-stats">
      <div><span>Base</span><span>${fmtPct(base)}/tick</span></div>
      <div><span>Word of mouth</span><span>+${fmtPct(wordOfMouth)}/tick</span></div>
      <div><span>Total</span><span>${fmtPct(total)}/tick</span></div>
      <div><span>Customers / open day</span><span>~${Math.round(total * openTicksPerDay)}</span></div>
    </div>`;
}

// "Pause at closing" help (issue #12): what the opt-in AFK guard does.
function tooltipPauseAtClosingHTML() {
  return `
    <div class="tooltip-header"><span class="tooltip-icon">●</span> Pause at closing</div>
    <div class="tooltip-stats">
      <div><span>When on</span><span>time stops at 23:00</span></div>
      <div><span>When off</span><span>the night keeps running</span></div>
      <div><span>To resume</span><span>press Play</span></div>
      <div><span>Good for</span><span>leaving the tab open</span></div>
    </div>`;
}

// Which content builder each tooltip element (by id) uses.
const TOOLTIP_CONTENT = {
  'tooltip-reputation': tooltipReputationHTML,
  'tooltip-quality': tooltipQualityHTML,
  'tooltip-sell-chance': tooltipSellChanceHTML,
  'tooltip-arrival': tooltipArrivalHTML,
  'tooltip-lemons': tooltipLemonsHTML,
  'tooltip-recipe': tooltipRecipeHTML,
  'tooltip-pause-at-closing': tooltipPauseAtClosingHTML,
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
