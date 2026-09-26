import { useRoomMotion } from "../context/RoomMotionContext";

export default function MotionButton({ className = "doodle-motion-button" }) {
  const { still, toggleMotion } = useRoomMotion();
  return <button type="button" className={className} onClick={toggleMotion}
    aria-pressed={!still} aria-label={still ? "Resume room motion" : "Pause room motion"}
    title={still ? "Animate the doodles" : "Pause all doodle animations"}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 8q4-4 8 0t10 0M3 15q4-4 8 0t10 0" /></svg>
    <span>{still ? "Motion off" : "Motion on"}</span>
  </button>;
}
