'use strict';

// ---------------------------------------------------------------------------
// config.js — game data only: CONFIG (every tunable number, DESIGN.md §13)
// and TITLES (company-title milestones, DESIGN.md §8). Zero dependencies;
// every other file reads these globals. Tune the game without touching logic.
// ---------------------------------------------------------------------------
const CONFIG = {
  starterMoney: 40,
  starterStock: 10,
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

  // Customer arrival chance per tick (DESIGN.md §6): base plus a word-of-mouth
  // bonus from reputation (v0.0.6) — the more the brand is known, the more
  // people show up. Replaces the old constant attractiveness traffic term.
  customerArrivalBase: 0.25,
  customerArrivalPerReputation: 0.00005,

  // Buy chance formula (DESIGN.md §6):
  //   clamp(min, max, 0.5 + (quality − price × priceWeight) / denominator
  //         + reputation / reputationBonus)
  // Reputation is 0..1000 (v0.0.6), so at max it adds ~55.6 percentage
  // points: the price penalty of $10 (5 points) is covered and the top
  // recipe reaches the 100% cap — 100% happens only at max reputation +
  // best recipe, at any price.
  buyChanceBase: 0.5,
  buyChancePriceWeight: 10,
  buyChanceDenominator: 200,
  reputationBonusDenominator: 1800,
  buyChanceMin: 0.1,
  buyChanceMax: 1.0,

  // Reputation (0..1000) grows by the sale price per sale (v0.0.6): pricier
  // sales build the brand more. Drives buy chance and word-of-mouth traffic.
  reputationMax: 1000,

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
