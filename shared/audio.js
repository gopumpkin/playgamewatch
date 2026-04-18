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
     * Call this synchronously inside every user-gesture handler.
     * Creates the AudioContext, plays a silent buffer (iOS unlock trick),
     * and calls ctx.resume() — all within the same gesture event so iOS
     * recognises it as a trusted interaction.
     */
    resume() {
      const c = getOrCreateContext();
      if (!c) return;

      // ctx.resume() must be called first — iOS requires it before any audio
      // node activity can unlock the context.
      if (c.state === "suspended") {
        c.resume().catch(() => {});
      }

      // Silent 1-sample buffer: the canonical iOS WebAudio unlock trick.
      // Playing any sound (even silence) within a user gesture marks the
      // context as "user-activated" on WebKit.
      try {
        const buf = c.createBuffer(1, 1, c.sampleRate);
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(c.destination);
        src.start(0);
      } catch (_) {
        // best effort
      }
    },

    playCue(name) {
      const cue = CUES[name];
      // ctx must exist (i.e., resume() must have been called from a gesture).
      if (!cue || !ctx || !masterGain) return;

      // KEY: do NOT gate on ctx.state === "running".
      // ctx.resume() resolves asynchronously, so state may still read
      // "suspended" for a few ms after the gesture. Web Audio will queue
      // scheduled sounds while suspended and play them once the context
      // actually starts running. This is standard spec behaviour and works
      // on both iOS Safari and Chrome/Android.
      try {
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
      } catch (_) {
        // Ignore — context may be in a transitional state
      }
    },
  };
}
