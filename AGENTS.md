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

## Current Development Stage (v0.0.1)

**Version 0.0.1 — playable MVP with a single drink (Fizzy Lemonade).**
Design decisions live in `DESIGN.md` (the source of truth for numbers and roadmap).

What exists:

- vanilla HTML/CSS/JS — no frameworks, no build tools
- three files: `index.html`, `style.css`, `game.js`
- real-time simulation: 1 tick per second
- customers arrive and decide to buy based on drink quality vs. price
- player actions: price slider, restock, two upgrades (Better Recipe, Nicer Stall)
- reputation, company-title milestones, game over + restart

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
- tests
- build tools
- more advanced architecture

New tools should be added when they help learning or solve a real project need.

## Development Rules

When working on this project:

- keep changes small and understandable
- prefer simple code over clever code
- keep the game runnable in the browser
- avoid premature abstraction
- avoid adding tools too early
- explain why a solution works
- focus on one small feature at a time
- make sure the UI reflects the game state clearly

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

- game state holds the truth (game.js, STATE section)
- render updates the UI based on state (RENDER section)
- actions change the state (ACTIONS section)
- all tunable numbers live in one CONFIG object (CONFIG section)

game.js is organized into fixed sections: CONFIG → TITLES → STATE → els →
HELPERS → RENDER → ACTIONS → TICK → GAME OVER → INIT. Every new feature
lands in one of these sections.

This pattern may evolve later.

## Agent Guidance

When helping with this project:

- suggest the smallest useful version of a feature
- explain the learning value
- avoid over-engineering
- do not introduce frameworks or libraries unless clearly necessary
- if a new tool is suggested, explain what problem it solves
- keep the beginner learning curve in mind