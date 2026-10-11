import { useEffect, useRef, useState } from "react";
import { connectSpotify, completeSpotify, disconnectSpotify, getSpotifyLibrary, getSpotifyStatus } from "../api";

export default function SpotifyMusic({ fullScreen, onSelect, onDisconnect }) {
  const dialog = useRef(null);
  const popup = useRef(null);
  const flow = useRef(null);
  const poll = useRef(null);
  const requestVersion = useRef(0);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState("playlists");
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);

  async function loadLibrary(type, offset = 0) {
    const version = ++requestVersion.current;
    setBusy(true); setError(null);
    try {
      const result = await getSpotifyLibrary(type, offset);
      if (version !== requestVersion.current) return;
      setItems(previous => offset ? [...previous, ...result.items] : result.items);
      setNext(result.next_offset);
    } catch (err) {
      if (version !== requestVersion.current) return;
      setError(err.message);
      if (err.status === 409) setStatus(previous => ({ ...previous, connected: false }));
    } finally { if (version === requestVersion.current) setBusy(false); }
  }
  useEffect(() => {
    async function receive(event) {
      const pending = flow.current;
      if (!pending || event.source !== popup.current || event.origin !== pending.origin || event.data?.type !== "mindpace:spotify" || event.data.state !== pending.state) return;
      flow.current = null;
      setConnecting(false);
      clearInterval(poll.current);
      event.source.postMessage({ type: "mindpace:spotify-received" }, event.origin);
      if (event.data.error || typeof event.data.code !== "string") {
        setError("Spotify connection was cancelled. You can try again whenever you like."); setBusy(false); return;
      }
      try {
        await completeSpotify(pending.state, event.data.code);
        setStatus({ configured: true, connected: true });
        setKind("playlists");
        await loadLibrary("playlists");
      } catch (err) { setError(err.message); setBusy(false); }
    }
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      clearInterval(poll.current);
      // The current popup, not the one at mount, must close when leaving the page.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      popup.current?.close();
      flow.current = null;
      // Invalidate any library request still in flight when this instance unmounts.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      requestVersion.current++;
    };
  }, []);
  useEffect(() => { if (fullScreen) dialog.current?.close(); }, [fullScreen]);

  async function open() {
    dialog.current.showModal();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await getSpotifyStatus();
      setStatus(result);
      if (result.connected) await loadLibrary(kind);
      else setBusy(false);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  async function connect() {
    if (busy) return;
    const child = window.open("about:blank", "mindpace-spotify", "popup,width=520,height=720");
    if (!child) { setError("Allow pop-ups for MindPace, then try connecting again."); return; }
    popup.current = child;
    child.document.title = "Connect Spotify";
    child.document.body.textContent = "Opening Spotify securely…";
    setBusy(true); setError(null);
    try {
      const result = await connectSpotify();
      if (child.closed) { setBusy(false); return; }
      flow.current = { state: result.state, origin: new URL(result.redirect_uri).origin };
      setConnecting(true);
      child.location.href = result.authorize_url;
      const deadline = Date.now() + 600000;
      poll.current = setInterval(() => {
        if (child.closed || Date.now() > deadline) {
          clearInterval(poll.current); flow.current = null; child.close();
          setConnecting(false);
          setBusy(false); setError("Spotify connection was not completed. Please try again.");
        }
      }, 500);
    } catch (err) { child.close(); setConnecting(false); setError(err.message); setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setError(null);
    try {
      await disconnectSpotify();
      setStatus({ configured: true, connected: false }); setItems([]); setNext(null); onDisconnect();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  function choose(item) { onSelect(item); dialog.current.close(); }
  return <>
    <button type="button" className="room-tool room-icon room-spotify" onClick={open} aria-label="Spotify music" title="Connect Spotify and choose your music" hidden={fullScreen}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M6.5 9c4-1.2 8-.8 11 1M7.5 12.5c3-1 6-.6 9 1M8 16c2.7-.7 5-.4 7.5.8" /></svg>
    </button>
    <dialog ref={dialog} className="room-music-dialog" aria-labelledby="spotify-dialog-title">
      <div className="room-music-heading"><h2 id="spotify-dialog-title">Your Spotify music</h2><button type="button" className="room-tool room-icon" aria-label="Close Spotify music" onClick={() => dialog.current.close()}>×</button></div>
      {error && <p role="alert">{error}</p>}
      {!status && !busy && <button onClick={open}>Retry connection status</button>}
      {busy && <p role="status">{connecting ? "Finish signing in in the Spotify window…" : "Loading Spotify…"}</p>}
      {status?.configured === false && <p>Spotify connection is not available yet. Please contact the app owner.</p>}
      {status?.configured && !status.connected && <><p>Sign in with your own Spotify account to choose your playlists and saved songs.</p><button disabled={busy} onClick={connect}>Connect Spotify</button></>}
      {status?.connected && <>
        <div className="room-music-tabs"><button disabled={busy} aria-pressed={kind === "playlists"} onClick={() => { setKind("playlists"); setItems([]); void loadLibrary("playlists"); }}>My playlists</button><button disabled={busy} aria-pressed={kind === "tracks"} onClick={() => { setKind("tracks"); setItems([]); void loadLibrary("tracks"); }}>Saved songs</button></div>
        {!busy && !error && !items.length && <p>No {kind === "tracks" ? "saved songs" : "playlists"} found in your Spotify account.</p>}
        <ul className="room-music-list">{items.map(item => <li key={`${item.type}-${item.id}`}><button disabled={busy} onClick={() => choose(item)}><strong>{item.name}</strong>{item.subtitle && <small>{item.subtitle}</small>}</button></li>)}</ul>
        {error && <button disabled={busy} onClick={() => loadLibrary(kind)}>Retry library</button>}
        {next !== null && <button disabled={busy} onClick={() => loadLibrary(kind, next)}>Load more</button>}
        <button className="room-end" disabled={busy} onClick={disconnect}>Disconnect Spotify</button>
      </>}
      <p className="room-music-note">Music plays through Spotify. Some tracks may offer previews only; you can open your selection in Spotify for its available playback options.</p>
    </dialog>
  </>;
}
