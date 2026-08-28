# Fizz Liquids Empire — Design Document

Version: 0.0.1 (MVP — playable)
Date: 2026-08-25
Status: implemented — roadmap steps 1–6, 8 and 9 are done; numbers are a first
balance pass and will be tuned after playtesting (step 7).

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
- Player actions: set price, restock, buy two upgrade types.
- Growth feel: numbers go up, company title milestones.
- Lose condition: bankruptcy → game over → restart.

**Explicitly out of scope (later iterations):**

- Recipes / multiple drinks / ingredients variety
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
player actions (any time)
  ├─ set price
  ├─ restock ingredients
  └─ buy upgrades (quality, stall)
```

This maps directly onto the project architecture: `state → render → actions`.

## 4. Game State (starter values)

```js
state = {
  money:         50,   // starter balance ($)
  stock:         10,   // cups ready to sell (free prototype batch)
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
  gameOver:      false
}
```

## 5. The Economy (first balance pass)

| Item | Value |
|---|---|
| Starter balance | $50 |
| Starting stock | 10 cups (free prototype batch) |
| Ingredient cost | $2 per cup → restock 10 cups = $20 |
| Default price | $5 (player range $1–$10) |
| Gross margin at default | $3 per cup |
| Quality upgrade | +10 quality per level, base $30, ×1.6 per level |
| Stall upgrade | +10 attractiveness per level, base $25, ×1.6 per level |

Expected pacing at start (~$10 profit/min): first restock after ~2 min, first
upgrade after ~3 min. Tunable later.

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
in-game time (1 tick = 1 minute). While closed, no customers arrive (hard gate,
zero traffic at night). The header shows an OPEN/CLOSED badge; boundary events
are logged ("The stall opens for the day!" / "Closing time — the stall is now
closed.") and at closing the day is recapped ("Today: X cups sold, $Y earned.").
The clock starts at 08:00 so a new game opens immediately. Numbers live in
CONFIG: `openHour = 8`, `closeHour = 23`, `clockStart.hour = 8`.

**Phase-gated actions** — the clock also gates what the player can do: restock
works only while the stall is open (day), upgrades only while it is closed
(night). Disabled buttons say why in their label ("only while open" / "only
while closed"), and clicking a gated action logs the reason.

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

- **Lose (game over):** `stock === 0` **and** `money < restock cost`. You have
  nothing to sell and cannot afford to restock. (Implemented rule; stricter than
  "money === 0" — it also ends the game when you have a little cash but no way
  to earn, preventing a soft-lock.) A "Game Over" overlay appears with a Restart
  button.
- **Win:** none. It's an open-ended grower. Milestones are the goals.
- Purchases always require affordability — no debt, so money never goes negative.

## 10. UI Sketch (single page, matches the implemented layout)

```
┌──────────────────────────────────────────────┐
│  FIZZ LIQUIDS EMPIRE        [Sidewalk Stall]  │  ← header title updates with milestones
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
│   10 — $20]  │              │                │
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

## 12. Implementation Roadmap (small steps)

Status: steps 1–6, 8 and 9 implemented — the MVP plus the day/night cycle is
playable in the browser. Step 7 (balance pass) is an ongoing tuning task as
the game is playtested.

1. ✅ **Static page** — `index.html` + `style.css` + `game.js`, render a hardcoded
   state (money, stock, price) so the layout exists. *(learning: HTML/CSS)*
2. ✅ **State → render** — define `state` and a `render()` that redraws the numbers;
   add temporary debug buttons (+$10, +1 stock) to prove it. *(learning: state
   management, DOM updates)*
3. ✅ **Tick loop** — `setInterval(1s)`; log each tick on screen. *(learning: game
   ticks / simulation loops)*
4. ✅ **Customers & sales** — arrival probability, buy decision, money/stock/reputation
   changes, event log. *(learning: randomness, simulation)*
5. ✅ **Player actions** — price slider, restock, two upgrades with costs. *(learning:
   event handling, affordability checks)*
6. ✅ **Game over + restart** — bankruptcy check, overlay, reset. *(learning: win/lose
   flow)*
7. **Balance pass** — play it, tune CONFIG numbers. *(learning: game balance)*
8. ✅ **Opening hours (day/night cycle)** — CONFIG.openHour/closeHour, hard-gated
   arrivals at night, OPEN/CLOSED badge in the header, boundary log lines and a
   daily recap at closing. *(learning: derived state, time-based rules)*
9. ✅ **Phase-gated actions** — restock enabled only while open, upgrades only
   while closed; disabled buttons state the phase in their label and blocked
   clicks are explained in the log. *(learning: time-based action rules)*

Each step leaves the game runnable in the browser.

## 13. Tuning Rules

- Every number in sections 5–6 lives in `CONFIG` — never hardcode in logic.
- Change one number at a time, then playtest.
- Target pacing: first upgrade reachable within ~3 minutes; game over should be
  possible only through neglect (raising price to $10 forever, never restocking).

## 14. Stretch Goals (later, not MVP)

Recipes & ingredients → production chain → marketing & events → multiple
locations → save/load → sound & animations. Each one is its own small feature
and its own learning step.
