# Fizz Liquids Empire — Design Document

Version: 0.0.3
Date: 2026-08-28
Status: implemented and playable in the browser; numbers are a first balance
pass, tuned by playtesting.

---

## 1. Vision

You are a lone drink inventor. You start with a small stash of a single prototype
drink ("Fizzy Lemonade"), a sidewalk stall, and a little cash. By selling drinks,
setting smart prices, and reinvesting your profit into quality and a nicer stall,
you grow from a nobody with a cooler into a recognizable local beverage brand.

The MVP proves the **smallest complete loop**: money comes in from sales, sales
depend on how good and how visible your stall is, and money goes back out into
making it better.

## 2. MVP Goal

**In scope (must work end-to-end):**

- One drink, one stall, one city block of foot traffic.
- Real-time simulation tick (1 tick = 1 second).
- Customers arrive, decide to buy or walk away, pay you.
- Player actions: set price, restock, buy two upgrade types, buy supplies at night.
- Production chain seed: restock converts night-bought supplies (lemons) into cups.
- Growth feel: numbers go up, company title milestones.
- Lose condition: bankruptcy → game over → restart.

**Explicitly out of scope (later iterations):**

- Recipes / multiple drinks / ingredient variety (lemons are the only supply for now)
- Production lines, storage, employees
- Marketing campaigns, events, weather
- Save/load, sound, animations
- Multiple locations or "empire" buildings

Rule from AGENTS.md: *one small feature at a time, smallest useful version.*
Everything below is chosen to be buildable and tunable with plain HTML/CSS/JS.

## 3. Core Game Loop

```
tick (1s)
  └─ maybe a customer arrives          (based on attractiveness)
       └─ customer decides to buy      (based on quality vs. price)
            ├─ buys  → money += price, stock -= 1, reputation += 1
            └─ leaves → nothing (logged)
player actions (phase-gated by day/night)
  ├─ set price (any time)
  ├─ restock ingredients (day only)    — costs money + lemons from the crate
  └─ night only: buy supplies (lemons) and upgrades (quality, stall)
```

This maps directly onto the project architecture: `state → render → actions`.

## 4. Game State (starter values)

```js
state = {
  money:         50,   // starter balance ($)
  stock:         10,   // cups ready to sell (free prototype batch)
  lemons:        0,    // supply crate — bought at night, consumed by restock
  price:         5,    // $ per cup (player can change 1..10)
  quality:       50,   // 0..100, how good the drink is
  attractiveness: 10,  // 0..100, how many people notice the stall
  reputation:     0,   // 0..100, earned per sale, soft bonus to buying
  cupsSold:       0,   // lifetime counter (milestones)
  totalEarned:    0,   // lifetime $ earned (milestones)
  dayCupsSold:    0,   // today's sales (daily recap at closing)
  dayEarned:      0,   // today's revenue (daily recap at closing)
  upgrades: { quality: 0, stall: 0 }, // current upgrade levels
  ticks:         0,   // the simulation clock (1 tick = 1 second)
  paused:        false, // true while the simulation is paused
  gameOver:      false
}
```

## 5. The Economy (first balance pass)

| Item | Value |
|---|---|
| Starter balance | $50 |
| Starting stock | 10 cups (free prototype batch) |
| Lemon price | $1 each (bought at night, 10 per click = $10) |
| Production cost | $1 per cup (the money part of restock) |
| Restock | 10 cups = $10 + 10 lemons (1 lemon per cup) → $20 total per batch |
| Default price | $5 (player range $1–$10) |
| Gross margin at default | $3 per cup |
| Clock speed | 10 in-game minutes per tick (1 tick = 1 real second) |
| Quality upgrade | +10 quality per level, base $30, ×1.6 per level |
| Stall upgrade | +10 attractiveness per level, base $25, ×1.6 per level |

Expected pacing at start (~$10 profit/min): first night of lemon shopping after
the first day, first upgrade after ~3 min. Tunable later.

All numbers live in one `CONFIG` object in the code (see section 11) so balance
changes are a single edit — that is also the *why* of the design.

## 6. Customer Traffic & Sales

**Arrival** — every tick, a customer appears with probability:

```
customerChance = 0.1 + attractiveness * 0.002   // per second
```

At start (attractiveness 10): ~0.12/s → about 7 customers per minute.
Fully upgraded (100): ~0.3/s → about 18 per minute.

**Opening hours (day/night cycle)** — the stall is open from 08:00 to 23:00
in-game time (1 tick = 10 minutes). While closed, no customers arrive (hard
gate, zero traffic at night). The header shows an OPEN/CLOSED badge; boundary
events are logged ("The stall opens for the day!" / "Closing time — the stall
is now closed.") and at closing the day is recapped ("Today: X cups sold, $Y
earned."). The clock starts at 08:00 so a new game opens immediately. A
fast-forward button in the header skips dead time in one click: while open it
waits until closing (23:00), while closed it waits until the next morning
(08:00). Numbers live in CONFIG: `openHour = 8`,
`closeHour = 23`, `clockStart.hour = 8`, `clockMinutesPerTick = 10`.

**Phase-gated actions** — the clock also gates what the player can do: restock
works only while the stall is open (day), upgrades only while it is closed
(night). Disabled buttons say why in their label ("only while open" / "only
while closed"), and clicking a gated action logs the reason.

**Night shopping (production chain seed)** — the closed phase also sells
supplies. Lemons cost $1 each (10 per click) and are shown in a Supplies
panel. Restock is a day action that converts lemons into cups: one restock of
10 cups costs $10 plus 10 lemons, so the night routine is *sell by day, buy
lemons by night, restock the next morning*. If the crate is short, restock is
blocked and the log explains the shortage. The game-over rule accounts for the
full chain: with no stock you must be able to afford both the restock money
and the missing lemons (DESIGN.md §9).

**Buy decision** — a customer buys with probability:

```
buyChance = clamp(0.1, 0.9, 0.5 + (quality − price × 10) / 200 + reputation / 1000)
```

Example at base values (quality 50, price $5): 0.5 → half of customers buy.
Raise the price to $8: chance drops to ~0.35. Improve quality to 80: back to ~0.65.
This creates the core tension: *price high to earn more per cup, but too high and
people walk away.*

**Sold out** — if stock is 0 when a customer wants to buy, they leave and the log
shows "Sold out!". This teaches inventory pressure without extra systems.

**Event log** — the UI shows the last few events ("A customer bought a cup for $5",
"A customer walked away", "Sold out!") so the player can *see* the simulation.

## 7. Upgrades — What You Buy

| Upgrade | Effect | Cost | Growth per level |
|---|---|---|---|
| Better Recipe | quality +10 | $30 | ×1.6 |
| Nicer Stall | attractiveness +10 | $25 | ×1.6 |

- Purchases are instant, single clicks, repeatable.
- Cost formula: `cost(level) = base × growth^level`.
- Both are shown as buttons with their current price; disabled when unaffordable.
- This is the whole "what do I buy" content of the MVP — two levers, clear effects.

## 8. Growth & Milestones

Growth in the MVP is numeric but visible:

- **Reputation** (0–100) grows with each sale and nudges buy chance up.
- **Lifetime stats** (`cupsSold`, `totalEarned`) feed **company titles** —
  pure flavor feedback so progress feels like an "empire" forming:

| cupsSold | Title |
|---|---|
| 0 | Sidewalk Stall |
| 20 | Neighborhood Favorite |
| 50 | Local Brand |
| 100 | City Soda Star |

Titles are display-only. No new mechanics — just reward for the grind.

## 9. Win / Lose

- **Lose (game over):** `stock === 0` **and** the player cannot produce a new
  batch — restock money **plus** the cost of the lemons they would still need
  to buy. (Implemented rule; stricter than "money === 0" — it also ends the
  game when you have a little cash but no way to earn, preventing a soft-lock.
  Lemons already in the crate count toward the check.) A "Game Over" overlay
  appears with a Restart button.
- **Win:** none. It's an open-ended grower. Milestones are the goals.
- Purchases always require affordability — no debt, so money never goes negative.

## 10. UI Sketch (single page, matches the implemented layout)

```
┌──────────────────────────────────────────────┐
│  FIZZ LIQUIDS EMPIRE        [Sidewalk Stall]  │  ← header title updates with milestones
│  [OPEN] 08:00 01/08/1990  [Pause] [Wait…]     │  ← timeline: badge, clock, skip controls
├──────────────┬──────────────┬────────────────┤
│  Stall       │  Upgrades    │  Event Log     │
│  Money: $50  │  Quality: 50 │  > A customer  │
│  Stock: 10   │  Attract.: 10│    bought $5   │
│  Reputation:0│  [Better     │  > walked away │
│  Price: ===o-│   Recipe     │                │
│    $5        │   +10 q —$30]│                │
│  Buy chance: │  [Nicer      │                │
│  50%         │   Stall      │                │
│  [Restock    │   +10 a —$25]│                │
│   10 — $10 + │              │                │
│   10 lemons] │              │                │
├──────────────┼──────────────┴────────────────┤
│  Supplies    │  Lemons: 0 ? │                │
│  [Buy 10     │              │                │
│   lemons —$10│              │                │
│   (night)]   │              │                │
├──────────────┴──────────────┴────────────────┤
│  game over → overlay with Restart button     │
└──────────────────────────────────────────────┘
```

## 11. File Structure & Architecture

```
index.html   — page skeleton, UI panels
style.css    — layout + styling
game.js      — the whole game: state, config, actions, tick loop, render
```

game.js is organized into fixed sections, top to bottom:

```
CONFIG → TITLES → STATE → els → HELPERS → RENDER → ACTIONS → TICK → GAME OVER → INIT
```

Every new feature lands in one of these sections — the section names are the
map of the codebase.

Follows AGENTS.md: **state holds the truth, render draws it, actions change it.**
`CONFIG` holds every tunable number from sections 5–6.

## 12. Implementation Status

The game is playable in the browser. Implemented so far:

- Core MVP — static page, state → render, tick loop (1/s), customers & sales,
  player actions (price, restock, upgrades), game over + restart
- Day/night opening hours (08:00–23:00) — OPEN/CLOSED badge, daily recap at closing
- Phase-gated actions — restock by day, upgrades at night
- Night supplies (lemons) — night shopping, restock consumes money + lemons,
  game over accounts for the production chain (issue #5)
- Fast-forward to the next day boundary — day → closing / night → morning
- Smoke tests (`tests/smoke.js`)
- Balance pass — ongoing, tune CONFIG by playtesting

Each feature landed as one small, self-contained step that left the game
runnable in the browser.

## 13. Tuning Rules

- Every number in sections 5–6 lives in `CONFIG` — never hardcode in logic.
- Change one number at a time, then playtest.
- Target pacing: first upgrade reachable within ~3 minutes; game over should be
  possible only through neglect (raising price to $10 forever, never restocking).

## 14. Stretch Goals (later, not MVP)

Recipes & ingredients → production chain → marketing & events → multiple
locations → save/load → sound & animations. Each one is its own small feature
and its own learning step.

The production chain is now **seeded**: lemons are the first supply with night
shopping, and restock converts them into cups. Still ahead on this track:
the other supplies (ice, water), recipe variants (more lemons = better
quality at a higher cost), and anything beyond a single ingredient per cup.
