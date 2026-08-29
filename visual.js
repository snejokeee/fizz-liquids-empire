// visual.js — presentation-only polish for Fizz Liquids Empire.
// It only toggles CSS classes on DOM elements; it never reads or writes game
// state, so the simulation logic in game.js stays untouched and the smoke
// test (which loads game.js in a vm) is unaffected.
'use strict';

(function () {
  // Re-trigger a CSS animation whenever an element's text changes. game.js
  // calls render() after every tick/action, so this fires on each update.
  function watchText(el, onChange) {
    if (!el) return;
    let last = el.textContent;
    const observer = new MutationObserver(() => {
      const now = el.textContent;
      if (now === last) return;
      const previous = last;
      last = now;
      onChange(el, now, previous);
    });
    observer.observe(el, { childList: true, characterData: true, subtree: true });
  }

  // Restart a one-shot animation. Removing and re-adding the class in the
  // same frame would be a no-op, so force a reflow in between.
  function replayAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  // Clock pulse: the in-game clock is the heartbeat of the sim.
  watchText(document.getElementById('clock'), (el) => {
    replayAnimation(el, 'flash');
  });

  // Money flashes green on income, red on spending.
  const money = document.getElementById('money');
  const moneyStat = money && money.closest('.stat-money');
  watchText(money, (el, now, previous) => {
    if (!moneyStat) return;
    const direction = Number(now) > Number(previous) ? 'gain' : 'loss';
    moneyStat.classList.remove('gain', 'loss');
    void moneyStat.offsetWidth;
    moneyStat.classList.add(direction);
  });
})();
