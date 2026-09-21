export function createActiveClock(initialElapsed = 0, now = () => performance.now()) {
  let elapsed = initialElapsed;
  let started = null;
  return {
    read: () => Math.round(elapsed + (started === null ? 0 : now() - started)),
    setRunning(running) {
      const current = now();
      if (started !== null) elapsed += current - started;
      started = running ? current : null;
    },
  };
}
