// Synthesized sound only: no audio files. Every effect is built from
// oscillators and filtered noise through one WebAudio context, and the music is
// a small procedural loop (bass line, hats, a simple lead) scheduled ahead of
// time. The context is created on the first user gesture, so browsers that
// block autoplay never hear anything before the player acts. M toggles mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let muted = false;
  let musicTimer = null;
  let nextNote = 0;
  let step = 0;

  // A bright, sun-soaked loop in C major pentatonic: bass walks, hats tick,
  // the lead answers every two bars. 120 bpm, eighth-note steps.
  const BPM = 120;
  const STEP_SEC = 60 / BPM / 2;
  const BASS = [130.81, 130.81, 196, 164.81, 130.81, 130.81, 220, 196];
  const LEAD = [523.25, 0, 587.33, 659.25, 0, 783.99, 0, 659.25, 523.25, 0, 587.33, 0, 659.25, 0, 587.33, 0];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function scheduleMusic() {
    if (!ctx || muted) return;
    while (nextNote < ctx.currentTime + 0.25) {
      const when = Math.max(nextNote, ctx.currentTime);
      const bar = Math.floor(step / 8) % 4;
      const bass = BASS[step % 8];
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = bass;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + STEP_SEC * 0.9);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start(when);
      osc.stop(when + STEP_SEC);
      if (step % 2 === 1) {
        const hat = ctx.createBufferSource();
        hat.buffer = noiseBuffer(0.05);
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(0.12, when);
        hg.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
        hat.connect(hg);
        hg.connect(musicGain);
        hat.start(when);
      }
      const lead = LEAD[step % 16];
      if (lead > 0 && bar % 2 === 1) {
        const lo = ctx.createOscillator();
        lo.type = 'sine';
        lo.frequency.value = lead;
        const lg = ctx.createGain();
        lg.gain.setValueAtTime(0.22, when);
        lg.gain.exponentialRampToValueAtTime(0.001, when + STEP_SEC * 1.8);
        lo.connect(lg);
        lg.connect(musicGain);
        lo.start(when);
        lo.stop(when + STEP_SEC * 2);
      }
      void t;
      nextNote += STEP_SEC;
      step += 1;
    }
  }

  return {
    /** Call from any user gesture; safe to call repeatedly. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') void ctx.resume();
      if (!musicTimer) {
        nextNote = ctx.currentTime + 0.1;
        musicTimer = window.setInterval(scheduleMusic, 90);
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    punch() {
      if (ensure()) noise(0.12, 0.5, 300);
    },
    gunshot() {
      if (ensure()) {
        noise(0.16, 0.7, 2400);
        tone(160, 0.1, 'square', 0.25, 0, 60);
      }
    },
    crash() {
      if (ensure()) noise(0.25, 0.6, 500);
    },
    honk() {
      if (ensure()) {
        tone(370, 0.18, 'square', 0.12);
        tone(466, 0.18, 'square', 0.1);
      }
    },
    chime() {
      if (ensure()) {
        tone(880, 0.12, 'sine', 0.25);
        tone(1318, 0.2, 'sine', 0.22, 0.09);
      }
    },
    jingle() {
      if (ensure()) {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, i * 0.11));
      }
    },
    fail() {
      if (ensure()) {
        tone(220, 0.3, 'sawtooth', 0.2, 0, 110);
        tone(165, 0.4, 'sawtooth', 0.18, 0.2, 82);
      }
    },
    /** Continuous layers: engine hum follows speed, siren wails while wanted. */
    update(speed01, wanted) {
      if (!ctx || muted) return;
      engineGain.gain.setTargetAtTime(0.02 + speed01 * 0.06, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 140, ctx.currentTime, 0.1);
      if (wanted > 0) {
        sirenGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.2);
        sirenTimer = (sirenTimer ?? 0) + 1;
        sirenOsc.frequency.setTargetAtTime(sirenTimer % 90 < 45 ? 720 : 980, ctx.currentTime, 0.05);
      } else {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      }
    },
  };
}
