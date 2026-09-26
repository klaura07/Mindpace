import MotionButton from "./MotionButton";
import DoodleScene from "./DoodleScene";

const scenes = {
  Dashboard: ["dashboard", "Little steps. Growing confidence.", "a little progress, every day"],
  Upload: ["upload", "Good things begin with a page.", "bring your notes, we'll take it from here"],
  Review: ["review", "Let's give it another little try.", "learning takes a little revisiting"],
  Activities: ["activities", "Room for a little daydream.", "rest belongs in your routine, too"],
};

export default function PlatformPage({ title, eyebrow, description, children, className = "" }) {
  const [scene, welcome, note] = scenes[title] || scenes.Dashboard;
  return (
    <div className={`platform-page doodle-page ${className}`} data-page={scene}>
      <header className="doodle-page-header">
        <div><p className="doodle-eyebrow">{eyebrow}</p><h1>{title}<span aria-hidden="true">✳</span></h1></div>
        <MotionButton />
      </header>
      <div className="doodle-intro">
        <div className="doodle-intro-copy"><p className="doodle-chapter">YOUR {scene === "dashboard" ? "LITTLE OVERVIEW" : scene === "upload" ? "PAPER COLLECTION" : scene === "review" ? "SECOND LOOK" : "QUIET CORNER"}</p><h2>{welcome}</h2><p>{description}</p><p className="doodle-handwritten">{note} <span aria-hidden="true">↗</span></p></div>
        <DoodleScene scene={scene} />
      </div>
      <div className="doodle-page-content">{children}</div>
      <footer className="doodle-footer"><span aria-hidden="true">✧</span> Less rush. More room to learn. <span aria-hidden="true">✧</span></footer>
    </div>
  );
}
