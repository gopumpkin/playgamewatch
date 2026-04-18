const CUES = {
  bounce: { frequency: 540, duration: 0.08, type: "square" },
  save: { frequency: 760, duration: 0.12, type: "square" },
  miss: { frequency: 180, duration: 0.18, type: "sawtooth" },
  reset: { frequency: 640, duration: 0.14, type: "triangle" },
  start: { frequency: 420, duration: 0.12, type: "square" },
  gameover: { frequency: 130, duration: 0.32, type: "sawtooth" },
};

export function createAudioEngine() {
  let ctx = null;
  let masterGain = null;
  let unlocked = false;

  function getOrCreateContext() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.28;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  return {
    /**
     * Call this synchronously inside every user-gesture handler (touchstart, click).
     * It creates the AudioContext, plays a silent buffer (iOS unlock trick),
     * and calls resume() — all synchronously so iOS recognises the gesture.
     */
    resume() {
      const c = getOrCreateContext();
      if (!c) return;

      // Play a 1-sample silent buffer — this is the iOS WebAudio unlock trick.
      // Must happen synchronously inside a user gesture.
      if (!unlocked) {
        try {
          const buf = c.createBuffer(1, 1, c.sampleRate);
          const src = c.createBufferSource();
          src.buffer = buf;
          src.connect(c.destination);
          src.start(0);
          unlocked = true;
        } catch (_) {
          // ignore — best effort
        }
      }

      if (c.state === "suspended") {
        // Call resume() synchronously — do NOT await here so that iOS
        // processes it within the same user-gesture event.
        c.resume().catch(() => {});
      }
    },

    playCue(name) {
      const cue = CUES[name];
      if (!cue || !ctx || !masterGain) return;

      // Do NOT call ctx.resume() here — we are inside the game loop, not a
      // user gesture, so iOS would ignore it. If the context is still
      // suspended the sound is silently skipped.
      if (ctx.state !== "running") return;

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = cue.type;
      oscillator.frequency.value = cue.frequency;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + cue.duration);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start();
      oscillator.stop(ctx.currentTime + cue.duration);
    },
  };
}
