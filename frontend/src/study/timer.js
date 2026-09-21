export const FOCUS_MS = 25 * 60 * 1000;
export const SHORT_BREAK_MS = 5 * 60 * 1000;
export const LONG_BREAK_MS = 15 * 60 * 1000;

export function newTimer() {
  return { phase: "focus", remaining: FOCUS_MS, deadline: null, rounds: 0 };
}

export function tickTimer(timer, now) {
  if (timer.deadline === null) return timer;
  const remaining = Math.max(0, timer.deadline - now);
  if (remaining > 0) return { ...timer, remaining };
  if (timer.phase === "focus") {
    const rounds = timer.rounds + 1;
    return { phase: "break", rounds, deadline: null,
      remaining: rounds % 4 === 0 ? LONG_BREAK_MS : SHORT_BREAK_MS };
  }
  return { ...timer, phase: "focus", deadline: null, remaining: FOCUS_MS };
}

export function pauseTimer(timer, now) {
  return { ...tickTimer(timer, now), deadline: null };
}
