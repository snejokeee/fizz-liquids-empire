// Reputation tests: the v0.0.6 reputation rework — the 0..1000 scale, buy
// chance reaching 100% only at max reputation + best recipe, word-of-mouth
// traffic, price-scaled reputation growth and the daily recap reporting it.
// Run by tests/smoke.js — it boots a fresh game for this file.
'use strict';

// ---- buy chance: 100% only at max reputation + best recipe (v0.0.6) ----
restart();
assert(buyChance() === 0.5, 'start: 50% buy chance (quality 50, $5, reputation 0)');

state.recipeLevel = 5;
state.servedLevel = 5;
state.lemons = 10; // Empire Signature needs 3 lemons/cup — keep it servable
state.price = 10;
state.reputation = CONFIG.reputationMax;
assert(buyChance() === 1, 'max reputation + best recipe + max price: 100% buy chance');
state.price = 9;
assert(buyChance() === 1, 'max reputation + best recipe: price $9 is also 100%');
state.price = 1;
assert(buyChance() === 1, 'max reputation + best recipe: any lower price is also 100%');

state.price = 10;
state.reputation = 900;
assert(buyChance() < 1 && buyChance() > 0.9, 'best recipe but not max reputation: below 100%');
state.reputation = CONFIG.reputationMax;
state.servedLevel = 4; // Golden Citrus Punch (quality 80)
assert(buyChance() < 1 && buyChance() > 0.9, 'max reputation but not the best recipe: below 100%');
state.servedLevel = 5;
state.reputation = 0;
assert(buyChance() < 1, 'no reputation: far from 100% even at the best recipe');

// ---- word of mouth: reputation draws more customers (v0.0.6) ----
restart();
assert(customerArrivalChance() === 0.25, 'arrival chance starts at 0.25/s');
state.reputation = CONFIG.reputationMax;
assert(customerArrivalChance() === 0.3, 'max reputation raises arrival chance to 0.3/s');

// ---- reputation grows by the sale price, capped at 1000 ----
restart();
state.stock = 10;
state.price = 5;
customerVisits();
assert(state.reputation === 5 && state.dayReputation === 5, 'a $5 sale adds 5 reputation');
state.price = 10;
customerVisits();
assert(state.reputation === 15, 'a $10 sale adds 10 reputation');
state.reputation = 995;
customerVisits();
assert(state.reputation === CONFIG.reputationMax, 'reputation caps at 1000');

// ---- daily recap reports the day's reputation gain ----
restart();
state.dayReputation = 42;
state.dayEarned = 42;
state.stock = 100000; // no sold-outs in the deterministic day
for (let i = 0; i < 11; i += 1) tick(); // 06:00 → 07:50: still closed
tick(); // 08:00: opening resets the day counters, then the first sale starts them fresh
assert(state.dayReputation === 5 && state.dayEarned === 5,
  'opening resets the day reputation, the first sale starts it fresh');
for (let i = 0; i < 89; i += 1) tick(); // 08:10 → 22:50: the rest of the open day
tick(); // 23:00: closes and recaps
assert(state.dayCupsSold === 90 && state.dayReputation === 450,
  'a full deterministic day gains 450 reputation (90 sales × $5)');
assert(logTexts()[0] === 'Today: 90 cups sold, $450 earned. Reputation +450 → 450.',
  'closing recap reports the reputation gain');
