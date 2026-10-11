import { useEffect, useRef, useState } from "react";

// User-supplied recording, served locally and started only by a click.
export default function useRainAudio() {
  const audio = useRef(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(.25);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const player = audio.current;
      audio.current = null;
      if (player) {
        player.onplaying = player.onpause = player.onerror = null;
        player.pause();
        player.removeAttribute("src");
        player.load();
      }
    };
  }, []);
  async function toggle() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      let player = audio.current;
      if (!player) {
        player = new Audio(`${import.meta.env.BASE_URL}audio/rain.mp3`);
        player.loop = true;
        player.volume = volume;
        player.preload = "none";
        player.onplaying = () => { if (mounted.current) setPlaying(true); };
        player.onpause = () => { if (mounted.current) setPlaying(false); };
        player.onerror = () => {
          if (mounted.current) { setPlaying(false); setError("Could not load the rain recording. Please try again."); }
        };
        audio.current = player;
      }
      if (player.paused) {
        if (player.error) player.load();
        await player.play();
      } else player.pause();
    } catch {
      if (mounted.current) { setPlaying(false); setError("Could not play the rain recording. Please try again."); }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function changeVolume(value) {
    setVolume(value);
    if (audio.current) audio.current.volume = value;
  }
  return { playing, volume, error, busy, toggle, changeVolume };
}
