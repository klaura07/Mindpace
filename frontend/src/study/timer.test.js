import test from 'node:test';
import assert from 'node:assert/strict';
import { newTimer, tickTimer, pauseTimer, FOCUS_MS, SHORT_BREAK_MS, LONG_BREAK_MS } from './timer.js';

test('focus deadline survives delayed background ticks and waits to start break', () => {
  const timer = { ...newTimer(), deadline: 1000 + FOCUS_MS };
  const expired = tickTimer(timer, 1000 + FOCUS_MS + 600000);
  assert.equal(expired.phase, 'break');
  assert.equal(expired.remaining, SHORT_BREAK_MS);
  assert.equal(expired.deadline, null);
  assert.equal(expired.rounds, 1);
});

test('pause and resume keep remaining time', () => {
  const paused = pauseTimer({ ...newTimer(), deadline: FOCUS_MS }, 60000);
  assert.equal(paused.remaining, FOCUS_MS - 60000);
  assert.equal(tickTimer(paused, 900000).remaining, paused.remaining);
  assert.equal(tickTimer({ ...paused, deadline: 900000 + paused.remaining }, 930000).remaining, paused.remaining - 30000);
});

test('fourth focus block gives a long break, then focus waits for the learner', () => {
  const rest = tickTimer({ ...newTimer(), rounds: 3, deadline: 100 }, 100);
  assert.equal(rest.remaining, LONG_BREAK_MS);
  const focus = tickTimer({ ...rest, deadline: 100 + LONG_BREAK_MS }, 100 + LONG_BREAK_MS);
  assert.equal(focus.phase, 'focus');
  assert.equal(focus.remaining, FOCUS_MS);
  assert.equal(focus.deadline, null);
});
