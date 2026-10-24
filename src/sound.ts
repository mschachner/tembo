// Short synthesized cues; no sample files.
let ctx: AudioContext | null = null;
let enabled = true;
let volume = 0.5;

export function configureSound(on: boolean, vol: number): void {
  enabled = on;
  volume = vol;
}

function tone(freq: number, ms: number, type: OscillatorType, at = 0, gain = 1): void {
  if (!enabled || volume <= 0) return;
  ctx ??= new AudioContext();
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.25 * volume * gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.02);
}

export const sounds = {
  accept: () => tone(880, 70, "sine"),
  reject: () => tone(160, 110, "triangle", 0, 0.8),
  complete: () => { tone(523, 90, "sine"); tone(659, 90, "sine", 0.09); tone(784, 160, "sine", 0.18); },
  // An item found for the first time ever: the accept tone with a bright second note.
  firstFind: () => { tone(880, 60, "sine"); tone(1320, 110, "sine", 0.06, 0.7); },
  // A quiz cleared for the first time: a longer rising figure.
  firstClear: () => { tone(523, 100, "sine"); tone(659, 100, "sine", 0.1); tone(784, 100, "sine", 0.2); tone(1047, 260, "sine", 0.3); tone(1319, 420, "sine", 0.42, 0.6); },
  giveUp: () => { tone(392, 120, "sine"); tone(311, 200, "sine", 0.12, 0.8); },
};
