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
