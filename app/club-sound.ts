/** Only a single live, confirmed move is audible. Snapshots and catch-up are silent. */
export class StoneSoundGate {
  private key = '';
  private turn = -1;
  accept(key: string, turn: number, visible: boolean) {
    const play = this.key === key && turn === this.turn + 1 && visible;
    if (this.key !== key || turn > this.turn) { this.key = key; this.turn = turn; }
    return play;
  }
}

/** A short stone-on-wood tap, synthesized locally; no downloaded audio or network delay. */
export function playStone(context: AudioContext) {
  if (context.state !== 'running') return;
  const time = context.currentTime;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .085), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 314159;
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = seed / 4294967296 * 2 - 1;
    data[i] = (.24 * noise * Math.exp(-t * 185) + .32 * Math.sin(2 * Math.PI * 1640 * t) * Math.exp(-t * 82) + .14 * Math.sin(2 * Math.PI * 820 * t) * Math.exp(-t * 65)) * Math.min(1, t * 2500);
  }
  const source = context.createBufferSource(), gain = context.createGain();
  source.buffer = buffer; gain.gain.value = .55;
  source.connect(gain).connect(context.destination);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  source.start(time); source.stop(time + .09);
}
