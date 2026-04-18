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

  // Pre-rendered AudioBuffers — generated offline, no gesture needed.
  // Keyed by cue name; populated by prerenderAll() on module init.
  const cueBuffers = {};
  let buffersReady = false;

  async function prerenderAll() {
    const sampleRate = 44100;
    for (const [name, cue] of Object.entries(CUES)) {
      try {
        const tail = 0.05;
        const length = Math.ceil(sampleRate * (cue.duration + tail));
        const offline = new OfflineAudioContext(1, length, sampleRate);
        const osc = offline.createOscillator();
        const gain = offline.createGain();
        osc.type = cue.type;
        osc.frequency.value = cue.frequency;
        gain.gain.setValueAtTime(0.001, 0);
        gain.gain.exponentialRampToValueAtTime(1, 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, cue.duration);
        osc.connect(gain);
        gain.connect(offline.destination);
        osc.start(0);
        osc.stop(cue.duration + tail);
        cueBuffers[name] = await offline.startRendering();
      } catch (_) {
        // OfflineAudioContext not available — fall back to oscillator
      }
    }
    buffersReady = Object.keys(cueBuffers).length > 0;
  }

  // Kick off pre-rendering immediately (no gesture required for OfflineAudioContext)
  prerenderAll();

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
     * Call synchronously inside every user-gesture handler.
     * Creates the AudioContext (iOS requires this path), resumes it,
     * and plays a silent buffer — the canonical iOS WebAudio unlock trick.
     *
     * On iOS the mute/ringer switch will still silence ALL audio — that is
     * an iOS platform restriction with no web workaround.
     */
    resume() {
      const c = getOrCreateContext();
      if (!c) return;

      // Resume regardless of current state — handles "suspended" and "interrupted"
      c.resume().catch(() => {});

      // Play a silent buffer to mark the context as user-activated on WebKit
      try {
        const buf = c.createBuffer(1, 1, c.sampleRate);
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(c.destination);
        src.start(0);
      } catch (_) {}
    },

    playCue(name) {
      if (!ctx || !masterGain) return;

      // Prefer pre-rendered AudioBuffer (more reliable on iOS than real-time oscillator)
      if (buffersReady && cueBuffers[name]) {
        try {
          const src = ctx.createBufferSource();
          src.buffer = cueBuffers[name];
          const gain = ctx.createGain();
          gain.gain.value = 1;
          src.connect(gain);
          gain.connect(masterGain);
          src.start();
        } catch (_) {}
        return;
      }

      // Oscillator fallback (for browsers without OfflineAudioContext)
      const cue = CUES[name];
      if (!cue) return;
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
      } catch (_) {}
    },
  };
}
