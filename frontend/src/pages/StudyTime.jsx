import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useStudy } from "../context/StudyContext";
import { listDocuments } from "../api";
import StudyRoomScene from "../study/StudyRoomScene";
import useRainAudio from "../study/useRainAudio";
import SpotifyMusic from "../components/SpotifyMusic";
import { newTimer, pauseTimer } from "../study/timer";
import "./StudyRoom.css";

export default function StudyTime() {
  const { user } = useAuth();
  const { focus, setFocus } = useStudy();
  const [params] = useSearchParams();
  const documentId = params.get("document");
  const topic = documentId ? null : params.get("topic");
  const requestedSource = documentId ? `document=${encodeURIComponent(documentId)}` : topic ? `topic=${encodeURIComponent(topic)}` : "";
  const source = requestedSource || focus.source;
  const selectedDocument = new URLSearchParams(source).get("document");
  const selectedTopic = new URLSearchParams(source).get("topic");
  const [material, setMaterial] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [fullScreenError, setFullScreenError] = useState(null);
  const [music, setMusic] = useState(null);
  const room = useRef(null);
  const rain = useRainAudio();
  const { timer } = focus;
  useEffect(() => {
    let cancelled = false;
    if (!selectedDocument) return;
    listDocuments(user.user_id).then(docs => {
      if (cancelled) return;
      const document = docs.find(doc => String(doc.document_id) === selectedDocument);
      if (!document) throw new Error("This document could not be found. You can still use the focus timer.");
      setMaterial(document);
      setFocus(state => ({ ...state, source, title: document.filename }));
    }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [user.user_id, selectedDocument, source, setFocus, attempt]);
  useEffect(() => {
    if (selectedTopic) setFocus(state => ({ ...state, source, title: selectedTopic }));
  }, [selectedTopic, source, setFocus]);
  useEffect(() => {
    const sync = () => setFullScreen(document.fullscreenElement === room.current);
    const escape = event => {
      if (event.key === "Escape" && document.fullscreenElement === room.current) {
        document.exitFullscreen().catch(() => setFullScreenError("Use the exit full screen icon to return."));
      }
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("fullscreenchange", sync); document.removeEventListener("keydown", escape); };
  }, []);
  useEffect(() => {
    if (!fullScreen) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = previous; };
  }, [fullScreen]);
  async function toggleFullScreen() {
    setFullScreenError(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await room.current.requestFullscreen();
    } catch { setFullScreenError("Full screen is unavailable in this browser."); }
  }
  function toggleTimer() {
    setFocus(state => ({ ...state, timer: state.timer.deadline === null
      ? { ...state.timer, deadline: Date.now() + state.timer.remaining }
      : pauseTimer(state.timer, Date.now()) }));
  }
  const seconds = Math.ceil(timer.remaining / 1000);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const title = selectedTopic || (String(material?.document_id) === selectedDocument ? material.filename : selectedDocument ? "Your document" : focus.title);
  return <div ref={room} className="study-room room-motion-on">
    <header className="room-header"><h1>Study time</h1><div className="room-tools">
      <SpotifyMusic fullScreen={fullScreen} onSelect={setMusic} onDisconnect={() => setMusic(null)} />
      <button className="room-tool room-audio" onClick={rain.toggle} disabled={rain.busy} aria-pressed={rain.playing}>{rain.playing ? "Stop rain sound" : "Play rain sound"}</button>
      {document.fullscreenEnabled && <button className="room-tool room-icon" onClick={toggleFullScreen} aria-label={fullScreen ? "Exit full screen" : "Full screen"} title={fullScreen ? "Exit full screen (Esc)" : "Full screen"}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={fullScreen ? "M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5" : "M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"} />
        </svg>
      </button>}
    </div></header>
    {fullScreen && <p className="room-fullscreen-hint" role="status">Press <kbd>Esc</kbd> to exit full screen.</p>}
    {rain.playing && <div className="room-volume"><label htmlFor="rain-volume">Rain volume</label><input id="rain-volume" type="range" min="0" max="1" step="0.05" value={rain.volume} onChange={event => rain.changeVolume(Number(event.target.value))} /></div>}
    {rain.error && <p role="alert" className="room-error">{rain.error}</p>}
    {fullScreenError && <p role="alert" className="room-error">{fullScreenError}</p>}
    {error && !fullScreen && <p role="alert" className="room-error">{error} <button onClick={() => { setError(null); setAttempt(value => value + 1); }}>Retry material</button></p>}
    <div className="room-scene" aria-label="Your illustrated study room"><StudyRoomScene />
      <div className="room-wall-timer">
        <p className="room-handwritten">{timer.phase === "break" ? "Take a breath. Your work can wait." : "I'll keep you company. Learn at your pace."}</p>
        <div className="room-phase">{timer.phase === "break" ? "A MOMENT TO REST" : "TIME FOR YOUR OWN LEARNING"}</div>
        <span className="room-clock" role="timer" aria-label={`${timer.phase} time remaining ${clock}`}>{clock}</span>
        <div className="room-rounds"><small>{timer.rounds} focus blocks complete</small></div>
        <div className="room-timer-actions">
          <button className="room-primary" onClick={toggleTimer}>{timer.deadline !== null ? "Pause" : timer.phase === "break" ? "Start break" : timer.remaining < 25 * 60 * 1000 ? "Resume focus" : "Start focus"}</button>
          <button className="room-end" onClick={() => setFocus(state => ({ ...state, timer: newTimer() }))}>Reset timer</button>
        </div>
      </div>
    </div>
    <div className="room-workspace"><section className="room-paper">
      <p className="room-eyebrow">ON YOUR DESK</p><h2>{title || "Your own study"}</h2>
      <p>Read, take notes, or follow your own learning resources. Your companion is here to help you make space for it.</p>
      <p>25 minutes of focus, 5 minutes of rest, and a 15-minute break after every fourth focus block. Each new phase starts when you choose.</p>
      {selectedDocument && String(material?.document_id) === selectedDocument && <details className="study-source"><summary>Read your material</summary><div>{material.extracted_text}</div></details>}
      <div className="practice-navigation"><Link to="/upload">Change material</Link><Link to="/activities">Take a quiet break</Link></div>
    </section>
    {music && <section className="room-paper room-selected-music" aria-label="Selected Spotify music">
      <h2>{music.name}</h2>
      <iframe key={`${music.type}-${music.id}`} title="Your selected Spotify music" src={`https://open.spotify.com/embed/${music.type}/${music.id}`} width="100%" height="352" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
      <div className="practice-navigation"><button onClick={() => setMusic(null)}>Stop music</button><a href={`https://open.spotify.com/${music.type}/${music.id}`} target="_blank" rel="noopener noreferrer">Open in Spotify</a></div>
    </section>}
    </div>
    <footer className="room-footer">Less rush. More room to learn.</footer>
  </div>;
}
