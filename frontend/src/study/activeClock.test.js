import test from 'node:test';
import assert from 'node:assert/strict';
import { createActiveClock } from './activeClock.js';

test('only active answering contributes, excluding pauses, hidden tabs and feedback', () => {
  let now = 0;
  const clock = createActiveClock(0, () => now);
  clock.setRunning(true);
  now = 12000;
  clock.setRunning(false);
  now = 120000;
  assert.equal(clock.read(), 12000);
  clock.setRunning(true);
  now = 125000;
  assert.equal(clock.read(), 17000);
  clock.setRunning(false);
  now = 900000;
  assert.equal(clock.read(), 17000);
});

test('restored timing carries prior active time without counting time away', () => {
  let now = 100000;
  const clock = createActiveClock(17000, () => now);
  assert.equal(clock.read(), 17000);
  clock.setRunning(true);
  now += 3000;
  clock.setRunning(true);
  now += 1000;
  assert.equal(clock.read(), 21000);
});
