const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// A small circular progress ring around the level number — replaces a
// plain-text "Level X" pill with something that visually communicates
// progress toward the next level.
export default function LevelRing({ level, progress }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = CIRCUMFERENCE * (1 - clamped);

  return (
    <div className="level-ring" role="img" aria-label={`Level ${level}`}>
      <svg viewBox="0 0 44 44">
        <circle className="track" cx="22" cy="22" r={RADIUS} />
        <circle
          className="progress"
          cx="22"
          cy="22"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="level-num">{level}</span>
    </div>
  );
}
