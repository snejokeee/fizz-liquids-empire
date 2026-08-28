# Fizz Liquids Empire — Design Document

Version: 0.0.4
Date: 2026-08-28
Status: implemented and playable in the browser; numbers are a first balance
pass, tuned by playtesting.

---

## 1. Vision

You are a lone drink inventor. You start with a small stash of a single prototype
drink ("Fizzy Lemonade"), a sidewalk stall, and a little cash. By selling drinks,
setting smart prices, and reinvesting your profit into better recipes,
you grow from a nobody with a cooler into a recognizable local beverage brand.

The MVP proves the **smallest complete loop**: money comes in from sales, sales
depend on how good and how visible your stall is, and money goes back out into
making it better.

## 2. MVP Goal

**In scope (must work end-to-end):**

- One drink, one stall, one city block of foot traffic.
- Real-time simulation tick (1 tick = 1 second).
- Customers arrive, decide to buy or walk away, pay you.
- Player actions: set price, choose the serving recipe, unlock the next recipe, buy supplies at night.
- Recipe progression: 5 tiers (water + lemon → …), each tier raises quality and
  with it the buy chance — the single upgrade path of the game.
- Auto-restock: the stall produces cups from supplies by itself (costs money and
  time, capped at the stock capacity) — no manual restock clicks.
- Production chain seed: auto-restock converts night-bought supplies (lemons) into cups.
- Growth feel: numbers go up, company title milestones.
- Lose condition: bankruptcy → game over → restart.

**Explicitly out of scope (later iterations):**

- More supplies / ingredient variety beyond lemons (water and ice in recipe
  names are flavor for now; lemons are the only purchasable supply)
- Production lines, storage, employees
- Marketing campaigns, events, weather
- Save/load, sound, animations
- Multiple locations or "empire" buildings

Rule from AGENTS.md: *one small feature at a time, smallest useful version.*
Everything below is chosen to be buildable and tunable with plain HTML/CSS/JS.

## 3. Core Game Loop

```
tick (1s)
  ├─ auto-restock: 1 cup per 3 ticks while stock < capacity and supplies allow
  └─ maybe a customer arrives          (based on attractiveness)
       └─ customer decides to buy      (based on quality vs. price)
            ├─ buys  → money += price, stock -= 1, reputation += 1
            └─ leaves → nothing (logged)
player actions (phase-gated by day/night)
  ├─ set price (any time)
  ├─ choose the serving recipe (any time)
  └─ night only: buy supplies (lemons) and unlock the next recipe
```

This maps directly onto the project architecture: `state → render → actions`.

## 4. Game State (starter values)

```js
state = {
  money:         40,   // starter balance ($)
  stock:         10,   // cups ready to sell — capped at stockCapacity
  lemons:        0,    // supply crate — bought at night, consumed by production
  price:         5,    // $ per cup (player can change 1..10)
  attractiveness: 10,  // 0..100, how many people notice the stall (fixed for now)
  reputation:     0,   // 0..100, earned per sale, soft bonus to buying
  cupsSold:       0,   // lifetime counter (milestones)
  totalEarned:    0,   // lifetime $ earned (milestones)
  dayCupsSold:    0,   // today's sales (daily recap at closing)
  dayEarned:      0,   // today's revenue (daily recap at closing)
  recipeLevel:    1,   // highest unlocked recipe tier (1..5); unlocks are night actions
  servedLevel:    1,   // recipe the stall serves (1..recipeLevel) — chosen in the UI
  restockProgress: 0,  // ticks worked toward the next auto-produced cup
  ticks:         0,   // the simulation clock (1 tick = 1 second)
  paused:        false, // true while the simulation is paused
  gameOver:      false
}
```

Quality is **not stored** — it is derived from the served recipe
(`effectiveRecipe()`), so the buy chance always matches what is actually in
the cups.

## 5. The Economy (first balance pass)

| Item | Value |
|---|---|
| Starter balance | $40 |
| Starting stock | 10 cups (free prototype batch) — the capacity cap |
| Stock capacity | 10 cups (auto-restock refills up to here; stall upgrades will raise it) |
| Lemon price | $1 each (bought at night, 10 per click = $10) |
| Production cost | $1 per cup (the money part of auto-restock) |
| Production speed | 1 cup per 3 ticks (stall upgrades will speed it up) |
| Cup cost by recipe | Fizzy Lemonade $2 · Iced Lemon Fizz $2 · Citrus Sparkle $3 · Golden Citrus Punch $3 · Empire Signature $4 ($1 + lemons) |
| Default price | $5 (player range $1–$10) |
| Gross margin at default | $3 per cup (Fizzy Lemonade) |
| Clock speed | 10 in-game minutes per tick (1 tick = 1 real second) |
| Recipe unlocks | Iced Lemon Fizz $250 · Citrus Sparkle $600 · Golden Citrus Punch $1,300 · Empire Signature $2,500 |
| Attractiveness | fixed at 10 for now (the stall upgrade was cut; capacity upgrades come later) |

Expected pacing at start: the game opens at 06:00 in the closed phase, so the
first act is night shopping; the first recipe unlock ($250) is a multi-day
savings goal ("from zero to hero") — a normal first day (~$80–90) cannot
afford it on night 1. A perfect restock day (~$150–300) can, which is the
documented edge case. Tunable later.

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
gate, zero traffic at night). The header shows an OPEN/CLOSED badge — CLOSED
means night hours only; while the simulation is paused the badge shows PAUSED —
boundary events are logged ("The stall opens for the day!" / "Closing time — the
stall is now closed.") and at closing the day is recapped ("Today: X cups sold,
$Y earned."). The clock starts at **06:00** — two hours before opening — so a new
game begins in the closed phase with time to buy supplies before the first
customer arrives. A fast-forward button in the header skips dead time in one
click: while open it waits until closing (23:00), while closed it waits until
the next morning (08:00). Numbers live in CONFIG: `openHour = 8`,
`closeHour = 23`, `clockStart.hour = 6`, `clockMinutesPerTick = 10`.

**Phase-gated actions** — the clock gates what the player can do: recipe
unlocks and supply shopping only while the stall is closed (night); the
serving choice, price and auto-restock work any time. Disabled buttons say
why in their label ("only while open" / "only while closed"), and clicking a
gated action logs the reason.

**Night shopping (production chain seed)** — the closed phase also sells
supplies. Lemons cost $1 each (10 per click) and are shown in a Supplies
panel. Auto-restock converts lemons into cups at any hour: while stock is
below capacity, one cup is produced every 3 ticks at $1 plus the served
recipe's lemons per cup, so the night routine is *sell by day, buy lemons by
night, cups ready by morning*. If the crate is short, production pauses and
the stall status says "Waiting for lemons". The game-over rule accounts for
the chain: with no stock you must be able to produce even one cup (DESIGN.md §9).

**From zero to hero** — recipe unlock prices are deliberately steep relative
to the starter budget: a normal first day (selling the free starter batch)
leaves the player short of the first unlock ($250 vs. ~$80–90 on night 1), so
nothing can be unlocked on the first night in normal play. The first recipe is
a multi-day goal, which makes growth feel earned and keeps the early game
about learning to sell and restock.

**Buy decision** — a customer buys with probability:

```
buyChance = clamp(0.1, 0.9, 0.5 + (quality − price × 10) / 200 + reputation / 1000)
```

Example at base values (quality 50, price $5): 0.5 → half of customers buy.
Raise the price to $8: chance drops to ~0.35. Improve quality to 80: back to ~0.65.
This creates the core tension: *price high to earn more per cup, but too high and
people walk away.* Unlocking a new recipe raises quality by 10 (50 → 60 → … → 90),
which is +5 percentage points of buy chance per tier at the same price — the
recipe ladder is the game's quality/buy-chance lever. Quality is the *served*
recipe's quality: if the crate runs low on lemons and the stall falls back to a
cheaper recipe, buy chance drops with it.

**Sold out** — if stock is 0 when a customer wants to buy, they leave and the log
shows "Sold out!". This teaches inventory pressure without extra systems.

**Event log** — the UI shows the last few events ("A customer bought a cup for $5",
"A customer walked away", "Sold out!") so the player can *see* the simulation.

## 7. Recipes — The Upgrade Path

The single upgrade lever of the MVP is the recipe ladder — five named tiers,
each a milestone with its own ingredient list and quality:

| Level | Recipe | Ingredients | Quality | Lemons/cup | Unlock cost |
|---|---|---|---|---|---|
| 1 | Fizzy Lemonade | water + lemon | 50 | 1 | starter |
| 2 | Iced Lemon Fizz | water + lemon + ice | 60 | 1 | $250 |
| 3 | Citrus Sparkle | water + lemon + ice + lime | 70 | 2 | $600 |
| 4 | Golden Citrus Punch | water + lemon + lime + orange | 80 | 2 | $1,300 |
| 5 | Empire Signature | citrus blend + secret syrup | 90 | 3 | $2,500 |

- Each unlock sets a new quality (+10 per tier → +5 percentage points of buy
  chance at the same price), so quality is *derived from* the recipe level.
- Higher tiers cost more lemons per cup — running low on lemons makes the
  stall *fall back* to the best recipe it can still make (the serving note
  says so), and quality follows what is actually in the cups.
- Unlocks are instant single clicks, night-gated, one button ("Unlock <next
  recipe> — $<cost>"); disabled while unaffordable or once mastered.
- Ingredients beyond lemons are flavor for now (DESIGN.md §14).

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

- **Lose (game over):** `stock === 0` **and** the player cannot produce even
  one cup — the production money ($1) **plus** a lemon if the crate is empty
  (they could buy one at night). (Implemented rule; stricter than "money === 0"
  — it also ends the game when you have a little cash but no way to earn,
  preventing a soft-lock. With auto-restock the survival bar is one cup, so
  game over is rare — a player with a couple of dollars and any lemons can
  restart the chain.) A "Game Over" overlay appears with a Restart button.
- **Win:** none. It's an open-ended grower. Milestones are the goals.
- Purchases always require affordability — no debt, so money never goes negative.

## 10. UI Sketch (single page, matches the implemented layout)

```
┌──────────────────────────────────────────────┐
│  FIZZ LIQUIDS EMPIRE        [Sidewalk Stall]  │  ← header title updates with milestones
│  [CLOSED] 06:00 01/08/1990 [Pause] [Wait…]    │  ← timeline: badge, clock, skip controls
├──────────────┬──────────────┬────────────────┤
│  Stall —     │  Recipe      │  Event Log     │
│  Fizzy       │  Current:    │  > A customer  │
│  Lemonade    │  Fizzy       │    bought $5   │
│  Money: $40  │  Lemonade    │  > walked away │
│  Stock:      │  (water +    │                │
│  10 / 10     │   lemon)     │                │
│  Reputation:0│  Quality: 50 │                │
│  Price: ===o-│  Attract.: 10│                │
│    $5        │  [Unlock     │                │
│  Buy chance: │   Iced Lemon │                │
│  50%         │   Fizz —$250]│               │
│  Serving:    │              │                │
│  [Fizzy      │              │                │
│  Lemonade ▾] │              │                │
│  Restocking… │              │                │
│  2/3         │              │                │
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
  player actions (price, serving choice, recipe unlocks), game over + restart
- Day/night opening hours (08:00–23:00) — OPEN/CLOSED badge, daily recap at closing
- Phase-gated actions — recipe unlocks + supplies at night; serving choice and
  price any time
- Night supplies (lemons) — night shopping, auto-restock consumes money +
  lemons, game over accounts for the production chain (issue #5)
- Auto-restock — the stall produces 1 cup per 3 ticks while stock < capacity
  (10) and supplies allow; costs $1 + lemons per cup, runs day/night and
  during fast-forward; future stall upgrades will speed it up and cut the cost
- Serving selector + fallback — choose which unlocked recipe to serve; when
  the crate lacks the lemons a recipe needs, the stall serves the best recipe
  it can still make (tiered lemon costs: 1/1/2/2/3 per cup)
- Game starts at 06:00 in the closed phase — pre-opening night shopping;
  recipe prices tuned so the first unlock is a multi-day goal (no unlocking
  on the first night in normal play)
- Recipe progression (5 tiers) — replaces the repeatable quality upgrade;
  each tier raises quality and with it the buy chance
- Stall upgrade cut — attractiveness is a constant for now (future stall
  upgrades will expand cup capacity instead)
- Fast-forward to the next day boundary — day → closing / night → morning
- Smoke tests (`tests/smoke.js`)
- Balance pass — ongoing, tune CONFIG by playtesting

Each feature landed as one small, self-contained step that left the game
runnable in the browser.

## 13. Tuning Rules

- Every number in sections 5–6 lives in `CONFIG` — never hardcode in logic.
- Change one number at a time, then playtest.
- Target pacing: first recipe unlock reachable within ~3 minutes of
  fast-forward play; game over should be
  possible only through neglect (raising price to $10 forever, never restocking).

## 14. Stretch Goals (later, not MVP)

Recipes & ingredients → production chain → marketing & events → multiple
locations → save/load → sound & animations. Each one is its own small feature
and its own learning step.

The production chain is now **seeded**: lemons are the first supply with night
shopping, and auto-restock converts them into cups. The recipe ladder is in
place (5 tiers) with tiered lemon costs (1/1/2/2/3 per cup) and a serving
fallback when the crate runs low. Still ahead on this track: the other
supplies (ice, water), stall upgrades (faster/cheaper production, larger
capacity), and anything beyond a single ingredient per cup.
