// Shared test host: boots the real game files inside a Node vm context with
// a stubbed DOM — a fake browser without a browser. Used by tests/smoke.js
// (one fresh game per test file; Math.random pinned to 0, so every open tick
// is deterministically one sale) and by tests/sim.js (one game, replayed
// with seeded randomness). Rendering visuals are NOT covered — the DOM is a
// stub; layout is verified by playing the game in the browser.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load order is the same contract as index.html: each file shares the global
// scope, so config.js must come first and game.js last.
const GAME_FILES = ['config.js', 'state.js', 'tooltips.js', 'game.js'];

// The minimum a DOM element needs for the game code to run without a browser.
function makeEl() {
  const el = {
    textContent: '',
    value: '',
    innerHTML: '',
    disabled: false,
    style: {},
    offsetWidth: 0,
    offsetHeight: 0,
    _classes: new Set(),
    children: [],
  };
  el.classList = {
    add: (c) => el._classes.add(c),
    remove: (c) => el._classes.delete(c),
    toggle: (c, force) => { if (force) el._classes.add(c); else el._classes.delete(c); },
    contains: (c) => el._classes.has(c),
  };
  el.prepend = (child) => {
    el.children.unshift(child);
    child.remove = () => {
      const i = el.children.indexOf(child);
      if (i >= 0) el.children.splice(i, 1);
    };
  };
  el.replaceChildren = () => { el.children = []; };
  el.addEventListener = () => {};
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, bottom: 0 });
  return el;
}

// Boot a fresh game in its own sandbox and return it — the sandbox doubles
// as the test's window (game globals like tick() are reachable from tests).
// options.random overrides the simulation's randomness; the default pins it
// to 0 — every open tick produces one sale, which is what the smoke tests
// assert exact tick counts on. setInterval is captured, never scheduled:
// nothing advances unless a test calls tick() itself.
function bootGame(options = {}) {
  const elsById = {};
  const sandbox = {
    console,
    process,
    document: {
      getElementById: (id) => elsById[id] || (elsById[id] = makeEl()),
      createElement: () => makeEl(),
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: makeEl(),
    },
    window: { innerWidth: 800, innerHeight: 600 },
    setInterval: (fn) => { sandbox.__tick = fn; return 1; },
  };
  vm.createContext(sandbox);

  for (const gameFile of GAME_FILES) {
    const src = fs.readFileSync(path.join(__dirname, '..', gameFile), 'utf8');
    vm.runInContext(src, sandbox);
  }

  sandbox.__random = options.random || (() => 0);
  vm.runInContext('Math.random = __random;', sandbox);
  return sandbox;
}

module.exports = { bootGame };
