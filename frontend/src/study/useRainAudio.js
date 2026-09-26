import { useEffect, useRef, useState } from "react";

// Locally generated ambience: no download, microphone, or autoplay.
export default function useRainAudio() {
  const audio = useRef(null);
  const pending = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(.25);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => () => {
    if (audio.current) {
      audio.current.onstatechange = null;
      audio.current.close().catch(() => {});
      audio.current = null;
    }
  }, []);

  async function toggle() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      let context = audio.current;
      if (context?.state === "closed") context = audio.current = null;
      if (!context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error("Rain sound is not supported in this browser.");
        context = new AudioContext();
        audio.current = context;
        const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1100;
        const gain = context.createGain();
        gain.gain.value = volume * .35;
        source.connect(filter).connect(gain).connect(context.destination);
        context.rainGain = gain;
        source.start();
        context.onstatechange = () => { if (audio.current === context) setPlaying(context.state === "running"); };
        await context.resume();
      } else if (context.state === "running") await context.suspend();
      else await context.resume();
      if (audio.current === context) setPlaying(context.state === "running");
    } catch (err) {
      // Discard a partly initialized graph so the next click really retries audio.
      const failed = audio.current;
      audio.current = null;
      if (failed) {
        failed.onstatechange = null;
        if (failed.state !== "closed") await failed.close().catch(() => {});
      }
      setPlaying(false);
      setError(err.message || "Could not start rain sound.");
    }
    finally { pending.current = false; setBusy(false); }
  }
  function changeVolume(value) {
    setVolume(value);
    const context = audio.current;
    if (context?.rainGain) context.rainGain.gain.setTargetAtTime(value * .35, context.currentTime, .1);
  }
  return { playing, volume, error, busy, toggle, changeVolume };
}
