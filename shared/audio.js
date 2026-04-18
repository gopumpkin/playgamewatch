const CUES = {
  bounce: { frequency: 540, duration: 0.08, type: "square" },
  save: { frequency: 760, duration: 0.12, type: "square" },
  miss: { frequency: 180, duration: 0.18, type: "sawtooth" },
  reset: { frequency: 640, duration: 0.14, type: "triangle" },
  start: { frequency: 420, duration: 0.12, type: "square" },
  gameover: { frequency: 130, duration: 0.32, type: "sawtooth" },
};

export function createAudioEngine() {
  let context = null;
  let masterGain = null;

  const ensureContext = () => {
    if (context) {
      return context;
    }

    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    context = new AudioContextCtor();
    masterGain = context.createGain();
    masterGain.gain.value = 0.045;
    masterGain.connect(context.destination);
    return context;
  };

  return {
    async resume() {
      const ctx = ensureContext();
      if (!ctx) {
        return;
      }
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
    },
    async playCue(name) {
      const cue = CUES[name];
      const ctx = ensureContext();
      if (!cue || !ctx || !masterGain) {
        return;
      }

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

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
