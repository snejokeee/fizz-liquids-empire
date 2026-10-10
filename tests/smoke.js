// Smoke test runner. Run with: node tests/smoke.js
//
// The game files are plain browser scripts (no modules), so tests run them
// inside a fake browser: tests/game-host.js boots a vm context with a stubbed
// DOM. This runner boots one fresh game per test file and runs every
// tests/*.test.js in it. Each test file calls the game's globals directly
// (state, tick(), render(), …) and checks expected values with assert().
//
// Math.random is pinned to 0 (game-host.js default), so every open tick
// deterministically produces one sale — the tests assert exact tick counts,
// not probabilities. Balance simulations live in tests/sim.js instead: they
// want seeded randomness, not a pinned 0, and print results instead of
// asserting.
//
// Rendering visuals are NOT covered (the DOM is stubbed); layout is verified
// by playing the game in the browser.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { bootGame } = require('./game-host');

// Boot a fresh game and run one test file against it.
// Returns true when any assertion failed.
function runTestFile(file) {
  const sandbox = bootGame();

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
