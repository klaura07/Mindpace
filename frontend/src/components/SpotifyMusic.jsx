import { useEffect, useRef, useState } from "react";
import { connectSpotify, completeSpotify, disconnectSpotify, getSpotifyLibrary, getSpotifyStatus, getSpotifyPlayback, controlSpotify, searchSpotify } from "../api";

export default function SpotifyMusic() {
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
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("track");
  const searchRef = useRef({ query: "", type: "track" });
  const [player, setPlayer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [controlling, setControlling] = useState(false);
  const [playbackError, setPlaybackError] = useState(null);
  const commandPending = useRef(false);
  const playbackVersion = useRef(0);

  async function loadLibrary(type, offset = 0) {
    const version = ++requestVersion.current;
    setBusy(true); setError(null);
    try {
      const result = type === "search"
        ? await searchSpotify(searchRef.current.query, searchRef.current.type, offset)
        : await getSpotifyLibrary(type, offset);
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
  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    let timeout;
    async function refresh() {
      const version = playbackVersion.current;
      try {
        if (!commandPending.current && !document.hidden) {
          const result = await getSpotifyPlayback();
          if (!cancelled && version === playbackVersion.current) setPlayer(result);
        }
      } catch (err) {
        if (!cancelled && version === playbackVersion.current) {
          setPlaybackError(err.message);
          if (err.status === 409) setStatus(previous => ({ ...previous, connected: false }));
        }
      } finally { if (!cancelled) timeout = setTimeout(refresh, 10000); }
    }
    void refresh();
    return () => { cancelled = true; clearTimeout(timeout); playbackVersion.current++; };
  }, [status?.connected]);

  async function command(action, item) {
    if (commandPending.current) return;
    commandPending.current = true;
    const version = ++playbackVersion.current;
    setControlling(true); setPlaybackError(null);
    try {
      await controlSpotify({ action, ...(item ? { uri: `spotify:${item.type}:${item.id}` } : {}),
        ...(action === "shuffle" ? { shuffle: !player?.shuffle } : {}) });
      if (version !== playbackVersion.current) return;
      if (item) { setSelected(item); dialog.current.close(); }
      // Spotify accepts commands asynchronously. Read the real state after a short delay.
      await new Promise(resolve => setTimeout(resolve, 700));
      const result = await getSpotifyPlayback();
      if (version === playbackVersion.current) setPlayer(result);
    } catch (err) {
      if (version === playbackVersion.current) {
        setPlaybackError(err.message);
        if (err.status === 409) setStatus(previous => ({ ...previous, connected: false }));
      }
    } finally { commandPending.current = false; setControlling(false); }
  }

  async function open() {
    dialog.current.showModal();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await getSpotifyStatus();
      setStatus(result);
      if (result.connected && (kind !== "search" || searchRef.current.query)) await loadLibrary(kind);
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
      requestVersion.current++; playbackVersion.current++;
      setStatus({ configured: true, connected: false }); setItems([]); setNext(null);
      setPlayer(null); setSelected(null); setPlaybackError(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  function choose(item) { void command("play", item); }
  const disabled = !status?.connected || controlling || player?.restricted;
  const disallows = player?.disallows || {};
  return <>
    <div className="room-music-dock" aria-label="Spotify player">
    <button type="button" className="room-music-browse" onClick={open} aria-label="Spotify music" aria-haspopup="dialog" title="Browse playlists and search songs">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M6.5 9c4-1.2 8-.8 11 1M7.5 12.5c3-1 6-.6 9 1M8 16c2.7-.7 5-.4 7.5.8" /></svg>
      <span><strong>{player?.track?.name || selected?.name || "Spotify music"}</strong><small>{status?.connected ? (player?.track?.subtitle || "Playlists & song search") : "Connect · playlists · search"}</small></span>
    </button>
    <div className="room-music-controls">
      <button className="room-tool room-icon" disabled={disabled || disallows.skipping_prev} onClick={() => command("previous")} aria-label="Previous song" title="Previous song">⏮</button>
      <button className="room-tool room-icon" disabled={disabled || (player?.playing ? disallows.pausing : disallows.resuming)} onClick={() => command(player?.playing ? "pause" : "play")} aria-label={player?.playing ? "Pause Spotify" : "Play Spotify"} title={player?.playing ? "Pause Spotify" : "Play Spotify"}>{player?.playing ? "Ⅱ" : "▶"}</button>
      <button className="room-tool room-icon" disabled={disabled || disallows.skipping_next} onClick={() => command("next")} aria-label="Next song" title="Next song">⏭</button>
      <button className="room-tool room-icon" disabled={disabled || !player?.active || disallows.toggling_shuffle} onClick={() => command("shuffle")} aria-label="Shuffle" aria-pressed={!!player?.shuffle} title={player?.shuffle ? "Turn shuffle off" : "Turn shuffle on"}>⤨</button>
    </div>
    {playbackError && <p className="room-playback-message" role="alert">{playbackError} <button onClick={open}>Music options</button></p>}
    {status?.connected && !player?.active && !playbackError && <p className="room-playback-message">Start a song in <a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer">Spotify</a>, then control it here. Premium required.</p>}
    </div>
    <dialog ref={dialog} className="room-music-dialog" aria-labelledby="spotify-dialog-title" onCancel={event => event.stopPropagation()}>
      <div className="room-music-heading"><h2 id="spotify-dialog-title">Your Spotify music</h2><button type="button" className="room-tool room-icon" aria-label="Close Spotify music" onClick={() => dialog.current.close()}>×</button></div>
      {error && <p role="alert">{error}</p>}
      {playbackError && <p role="alert">{playbackError}</p>}
      {!status && !busy && <button onClick={open}>Retry connection status</button>}
      {busy && <p role="status">{connecting ? "Finish signing in in the Spotify window…" : "Loading Spotify…"}</p>}
      {status?.configured === false && <p>Spotify connection is not available yet. Please contact the app owner.</p>}
      {status?.configured && !status.connected && <><p>Sign in with your own Spotify account to choose your playlists and saved songs.</p><button disabled={busy} onClick={connect}>Connect Spotify</button></>}
      {status?.connected && <>
        <div className="room-music-tabs"><button disabled={busy} aria-pressed={kind === "playlists"} onClick={() => { setKind("playlists"); setItems([]); void loadLibrary("playlists"); }}>My playlists</button><button disabled={busy} aria-pressed={kind === "tracks"} onClick={() => { setKind("tracks"); setItems([]); void loadLibrary("tracks"); }}>Saved songs</button><button disabled={busy} aria-pressed={kind === "search"} onClick={() => { setKind("search"); setItems([]); setNext(null); setError(null); if (searchRef.current.query) void loadLibrary("search"); }}>Search</button></div>
        {kind === "search" && <form className="room-music-search" onSubmit={event => { event.preventDefault(); if (!query.trim()) return; searchRef.current = { query: query.trim(), type: searchType }; setItems([]); setNext(null); void loadLibrary("search"); }}>
          <label htmlFor="spotify-search">Song, artist, or playlist</label>
          <input id="spotify-search" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} placeholder="Find your study soundtrack" />
          <div><select aria-label="Search Spotify for" value={searchType} onChange={event => setSearchType(event.target.value)}><option value="track">Songs</option><option value="playlist">Playlists</option></select><button disabled={busy || !query.trim()}>Search Spotify</button></div>
        </form>}
        {!busy && !error && !items.length && <p>{kind === "search" ? (searchRef.current.query ? "No results. Try another song, artist, or playlist." : "Search Spotify for songs and playlists.") : `No ${kind === "tracks" ? "saved songs" : "playlists"} found in your Spotify account.`}</p>}
        <ul className="room-music-list">{items.map(item => <li key={`${item.type}-${item.id}`}><button disabled={busy || controlling} onClick={() => choose(item)}><strong>{item.name}</strong>{item.subtitle && <small>{item.subtitle}</small>}</button></li>)}</ul>
        {error && <button disabled={busy} onClick={() => loadLibrary(kind)}>Retry library</button>}
        {next !== null && <button disabled={busy} onClick={() => loadLibrary(kind, next)}>Load more</button>}
        <button className="room-end" disabled={busy || controlling} onClick={disconnect}>Disconnect Spotify</button>
      </>}
      <p className="room-music-note">Controls require Spotify Premium and an active Spotify player. <a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer">Open Spotify</a> and start a song, then choose music here. Audio plays on your active Spotify device. Disconnecting or leaving this room leaves that device playing.</p>
      {status?.connected && <button disabled={busy || controlling} onClick={connect}>Reconnect Spotify</button>}
    </dialog>
  </>;
}
