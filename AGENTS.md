# AGENTS.md — Fizz Liquids Empire

## Project

**Name:** Fizz Liquids Empire  
**Type:** Browser-based beverage business simulation game  
**Theme:** Build a drink company empire inspired by soda/beverage corporations.

## Main Purpose

This project is a learning project.

The goal is to learn frontend development and basic game development by building a small business simulation game step by step.

The game is the vehicle for learning:

- HTML structure
- CSS layout and styling
- JavaScript basics
- DOM manipulation
- state management
- event handling
- game ticks / simulation loops
- incremental feature design

## Game Goal

The player grows a beverage company from a small drink prototype into a larger beverage empire.

The game may eventually include:

- recipes
- ingredients
- production
- sales
- customers
- marketing
- reputation
- research and development
- business scaling

The long-term fantasy is not just selling drinks, but building a beverage brand.

## Current Development Stage (v0.0.5)

**Version 0.0.5 — the Modern Beverage Tycoon UI overhaul** (dark glass theme,
micro-interactions, responsive layout) on top of the v0.0.4 feature set:
day/night cycle, night supplies, and recipe progression.
Design decisions live in `DESIGN.md` (the source of truth for numbers and roadmap).

What exists:

- vanilla HTML/CSS/JS — no frameworks, no build tools
- six game files: `index.html`, `style.css`, `config.js`, `state.js`,
  `tooltips.js`, `game.js` — plain `<script>` tags in dependency order
- smoke tests for the game logic: `tests/smoke.js` (runner) + per-feature
  `tests/*.test.js` files — run with `node tests/smoke.js`
- real-time simulation (1 tick/s), customers, sales, event log
- player actions: price slider, serving recipe choice, recipe unlock (night)
- day/night cycle: opens 08:00–23:00, game starts at 06:00 (pre-opening night shopping), OPEN/CLOSED badge, daily recap, fast-forward to the next day boundary
- night supplies (lemons): buy lemons while closed, auto-restock consumes money + lemons (production chain seed)
- auto-restock: the stall produces cups by itself while stock is below capacity
  — costs $1 + lemons per cup, takes 3 ticks per cup, runs day/night and during
  fast-forward; no manual restock clicks
- recipe progression: 5 tiers (water + lemon → …), each tier raises quality and
  with it the buy chance — the single upgrade path; priced so the first unlock is
  a multi-day goal ("from zero to hero"); higher tiers cost more lemons per cup,
  and the stall falls back to the best recipe it can still make when the crate
  runs low
- stall upgrade cut: attractiveness is a constant for now, freeing the stall for
  future capacity + production upgrades
- reputation, company-title milestones, game over + restart
- Modern Beverage Tycoon UI (v0.0.5): dark glass dashboard themed with CSS
  custom properties (:root design tokens), sticky header with a digital clock
  and sun/moon day-night indicator, stat tiles with mono numbers, per-panel
  beverage accent stripes; deliberately static styling — no animations,
  transitions or backdrop-filter, so the per-tick render stays cheap (game.js
  only touches the DOM when a displayed value actually changes); the paused
  state stripes the timeline and dims the board; responsive down to mobile
  (2-col ≤1024px, 1-col ≤768px, 44px touch targets)

The learning focus is still fundamentals, not tooling — new tools are added
only when they help learning or solve a real project need.

## Future Evolution

This project is not permanently limited to vanilla JavaScript.

Later, as knowledge grows, the project may evolve to include:

- more game features (recipes, ingredients, marketing, production)
- TypeScript
- modules
- small libraries
- save/load systems
- build tools
- more advanced architecture

New tools should be added when they help learning or solve a real project need.

## Development Rules

When working on this project:

- keep changes small and understandable
- prefer simple code over clever code
- keep the game runnable in the browser
- keep the smoke test green: run `node tests/smoke.js` after changing game logic
- avoid premature abstraction
- avoid adding tools too early
- NEVER build long multi-line text (issue bodies, commit messages, docs)
  inside a shell command — e.g. `--body "$(cat <<'EOF' ... EOF)"` — the
  nested quoting (double quotes + $() + heredoc) breaks on text full of
  quotes, backticks and $ (like `'use strict';`) and fails with confusing
  "unexpected EOF while looking for matching `'`" errors. Write the text to
  a temp file with write_file and pass a file flag instead
  (`gh issue create --body-file /tmp/body.md`). Keep heredocs only for
  short, simple input with the delimiter quoted (`<<'EOF'`).
- explain why a solution works
- focus on one small feature at a time
- make sure the UI reflects the game state clearly
- ALWAYS wait for the user's manual review and approval before suggesting a
  commit or push — never propose committing or pushing changes unasked

## Working with Issues

- Feature work and bugs are tracked as GitHub issues on the remote repo `snejokeee/fizz-liquids-empire`.
- ALWAYS use the `gh` CLI to interact with issues:
  - `gh issue list` — find open issues
  - `gh issue view <number>` — read the full issue details before implementing
  - `gh issue close <number>` / `gh issue comment <number> --body "..."` — update status
- Before implementing an issue, read it with `gh issue view` so the code matches the actual requirements.
- ALWAYS leave a comment on an issue when closing it — summarize what was
  implemented and how it was verified, so the closed issue documents the work
  (e.g. `gh issue close <number> --comment "..."` or `gh issue comment` before
  closing).

## Architecture

The architecture in use is:

```text
state → render → actions
```

Meaning:

- game state holds the truth (state.js, STATE section)
- render updates the UI based on state (RENDER section)
- actions change the state (ACTIONS section)
- all tunable numbers live in one CONFIG object (config.js, CONFIG section)

The codebase is split into plain `<script>` files that share the global
scope, loaded in dependency order (config.js → state.js → tooltips.js →
game.js) — no build tools, the game opens by double-clicking index.html:

- `config.js` — CONFIG + TITLES: pure data, no dependencies
- `state.js` — state + the pure rules (clock, recipes, buy chance); no DOM
- `tooltips.js` — the hover-help UI feature; reads state, never mutates it
- `game.js` — the rest: els, setText/addLog, RENDER, ACTIONS, TICK,
  GAME OVER, INIT

game.js is organized into fixed sections: els → HELPERS → RENDER → ACTIONS →
TICK → GAME OVER → INIT. Every new feature lands in one of these sections.

Styling is deliberately static: no animations, transitions or
backdrop-filter, so the per-tick render is a cheap instant repaint. render()
writes the DOM only when a displayed value changes (the setText helper), so
unchanged stats don't dirty the layout. Visual polish is verified visually
in the browser, not by the smoke test (which stubs the DOM).

This pattern may evolve later.

## Agent Guidance

When helping with this project:

- suggest the smallest useful version of a feature
- explain the learning value
- avoid over-engineering
- do not introduce frameworks or libraries unless clearly necessary
- if a new tool is suggested, explain what problem it solves
- keep the beginner learning curve in mind
- keep presentation (style.css) separate from game logic (game.js): style
  only consumes the classes and ids game.js exposes from state