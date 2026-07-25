// Lightweight retro sound helper using Web Audio API.
// No external audio files - synth beeps generated on the fly.

let ctx = null;
let enabled = true;

try {
  const stored = localStorage.getItem("rmc_sound");
  if (stored === "off") enabled = false;
} catch (e) {
  // ignore
}

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function beep(freq = 440, duration = 0.12, type = "square", volume = 0.06) {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + duration);
}

function sequence(notes) {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio) return;
  let t = audio.currentTime;
  notes.forEach(({ freq, dur = 0.11, type = "square", vol = 0.06 }) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur);
    t += dur * 0.95;
  });
}

export const sfx = {
  click: () => beep(660, 0.05, "square", 0.05),
  hover: () => beep(880, 0.03, "sine", 0.03),
  flip: () => beep(520, 0.08, "triangle", 0.05),
  match: () => sequence([{ freq: 660 }, { freq: 880 }, { freq: 1100 }]),
  win: () =>
    sequence([
      { freq: 523.25 },
      { freq: 659.25 },
      { freq: 783.99 },
      { freq: 1046.5, dur: 0.22 },
    ]),
  lose: () =>
    sequence([
      { freq: 392 },
      { freq: 329.63 },
      { freq: 261.63, dur: 0.25, type: "sawtooth" },
    ]),
  dice: () =>
    sequence([
      { freq: 400, type: "sawtooth", dur: 0.05 },
      { freq: 300, type: "sawtooth", dur: 0.05 },
      { freq: 500, type: "sawtooth", dur: 0.05 },
    ]),
  drop: () => beep(220, 0.15, "triangle", 0.06),
  card: () => beep(300, 0.06, "square", 0.04),
};

export function setSoundEnabled(v) {
  enabled = !!v;
  try {
    localStorage.setItem("rmc_sound", v ? "on" : "off");
  } catch (e) {
    // ignore
  }
}

export function isSoundEnabled() {
  return enabled;
}
