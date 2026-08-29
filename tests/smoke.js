// Smoke test runner. Run with: node tests/smoke.js
//
// The game files are plain browser scripts (no modules), so tests run them
// inside a fake browser: a Node vm context with a stubbed DOM. This runner
// is the shared part — it boots one fresh game per test file and runs every
// tests/*.test.js in it. Each test file calls the game's globals directly
// (state, tick(), render(), …) and checks expected values with assert().
//
// Math.random is pinned to 0, so every open tick deterministically produces
// one sale — the tests assert exact tick counts, not probabilities.
//
// Rendering visuals are NOT covered (the DOM is stubbed); layout is verified
// by playing the game in the browser.
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

// Boot a fresh game in its own sandbox and run one test file against it.
// Returns true when any assertion failed.
function runTestFile(file) {
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
  vm.runInContext('Math.random = () => 0;', sandbox);

  // Test helpers shared by every test file.
  vm.runInContext(`
    let failed = false;
    function assert(cond, msg) {
      if (cond) { console.log('ok: ' + msg); }
      else { console.error('FAIL: ' + msg); failed = true; }
    }
    const logTexts = () => els.logList.children.map((c) => c.textContent);
  `, sandbox);

  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  return vm.runInContext('failed', sandbox);
}

// Every *.test.js in this folder is one feature suite; each gets its own
// fresh game, so test files can never interfere with each other.
let anyFailed = false;
const testFiles = fs.readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .sort();
for (const file of testFiles) {
  const failed = runTestFile(path.join(__dirname, file));
  console.log(failed ? 'FAILED: ' + file : 'passed: ' + file);
  if (failed) anyFailed = true;
}
if (anyFailed) process.exitCode = 1;
else console.log('all tests passed');
