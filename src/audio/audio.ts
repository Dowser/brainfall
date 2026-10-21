export type Sfx =
  | 'move'
  | 'rotate'
  | 'land'
  | 'lock'
  | 'harddrop'
  | 'hold'
  | 'quiz'
  | 'correct'
  | 'wrong'
  | 'clear'
  | 'tetris'
  | 'burn'
  | 'levelup'
  | 'gameover'
  | 'tick'
  | 'select';

function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'G#2' → frequency in Hz. */
export function noteFreq(name: string) {
  const m = /^([A-G])(#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return midiToFreq(NOTE_INDEX[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12);
}

// Korobeiniki (Russian folk song, public domain) – A section, in eighth-note steps.
const MELODY: [string | null, number][] = [
  ['E5', 2], ['B4', 1], ['C5', 1], ['D5', 2], ['C5', 1], ['B4', 1],
  ['A4', 2], ['A4', 1], ['C5', 1], ['E5', 2], ['D5', 1], ['C5', 1],
  ['B4', 3], ['C5', 1], ['D5', 2], ['E5', 2],
  ['C5', 2], ['A4', 2], ['A4', 2], [null, 2],
  [null, 1], ['D5', 2], ['F5', 1], ['A5', 2], ['G5', 1], ['F5', 1],
  ['E5', 3], ['C5', 1], ['E5', 2], ['D5', 1], ['C5', 1],
  ['B4', 2], ['B4', 1], ['C5', 1], ['D5', 2], ['E5', 2],
  ['C5', 2], ['A4', 2], ['A4', 2], [null, 2],
];
const BASS_ROOTS = ['E2', 'A2', 'G#2', 'A2', 'D2', 'C2', 'E2', 'A2'];
const STEPS = 64;

/** Melody expanded to one slot per eighth step: [freq, lengthInSteps] or null. */
const MELODY_STEPS: ([number, number] | null)[] = (() => {
  const out: ([number, number] | null)[] = new Array(STEPS).fill(null);
  let i = 0;
  for (const [note, len] of MELODY) {
    if (note) out[i] = [noteFreq(note), len];
    i += len;
  }
  return out;
})();

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;

  musicOn = true;
  sfxOn = true;
  musicVolume = 0.5;
  sfxVolume = 0.7;

  private playing = false;
  private step = 0;
  private nextTime = 0;
  private bpm = 144;
  private timer = 0;
  private ducked = false;

  /** Browsers only allow audio after a user gesture, so this is called from the first key/click. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(comp);
      this.sfxBus.connect(comp);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const music = this.musicOn ? this.musicVolume * 0.55 * (this.ducked ? 0.35 : 1) : 0;
    this.musicBus.gain.setTargetAtTime(music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfxOn ? this.sfxVolume : 0, t, 0.02);
  }

  /** Lower the music while a question is on screen. */
  duck(on: boolean) {
    this.ducked = on;
    this.applyVolumes();
  }

  setLevel(level: number) {
    this.bpm = Math.min(210, 144 + (level - 1) * 6);
  }

  // ── music ────────────────────────────────────────────────

  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.playing = false;
    clearInterval(this.timer);
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.bpm / 2;
      this.step = (this.step + 1) % STEPS;
    }
  }

  private playStep(step: number, t: number) {
    const stepLen = 60 / this.bpm / 2;
    const mel = MELODY_STEPS[step];
    if (mel) this.voice(this.musicBus, 'square', mel[0], t, mel[1] * stepLen * 0.92, 0.13, 2400);

    const root = noteFreq(BASS_ROOTS[Math.floor(step / 8)]);
    this.voice(this.musicBus, 'triangle', step % 2 ? root * 2 : root, t, stepLen * 0.85, 0.32, 1200);

    const beat = step % 8;
    if (beat === 0 || beat === 4) this.kick(t);
    if (beat === 2 || beat === 6) this.noiseHit(this.musicBus, t, 0.12, 0.16, 1800, 'bandpass');
    if (step % 2) this.noiseHit(this.musicBus, t, 0.03, 0.05, 7000, 'highpass');
  }

  // ── primitives ───────────────────────────────────────────

  private voice(
    bus: AudioNode,
    type: OscillatorType,
    freq: number,
    t: number,
    dur: number,
    vol: number,
    cutoff = 8000,
    slideTo?: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f).connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseHit(bus: AudioNode, t: number, dur: number, vol: number, freq: number, type: BiquadFilterType, sweepTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    this.voice(this.musicBus, 'sine', 150, t, 0.16, 0.5, 8000, 45);
  }

  // ── sound effects ────────────────────────────────────────

  play(name: Sfx) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const b = this.sfxBus;
    const arp = (notes: string[], gap: number, dur: number, vol: number, type: OscillatorType = 'square') =>
      notes.forEach((n, i) => this.voice(b, type, noteFreq(n), t + i * gap, dur, vol, 5000));

    switch (name) {
      case 'move':
        this.voice(b, 'square', 280, t, 0.03, 0.05, 2000);
        break;
      case 'rotate':
        this.voice(b, 'triangle', 520, t, 0.05, 0.12, 6000, 780);
        break;
      case 'hold':
        this.voice(b, 'triangle', 660, t, 0.08, 0.12, 6000, 330);
        break;
      case 'land':
        this.noiseHit(b, t, 0.05, 0.12, 900, 'lowpass');
        break;
      case 'lock':
        this.voice(b, 'sine', 180, t, 0.08, 0.25, 3000, 90);
        break;
      case 'harddrop':
        this.voice(b, 'sine', 220, t, 0.14, 0.45, 3000, 50);
        this.noiseHit(b, t, 0.12, 0.25, 1400, 'lowpass');
        break;
      case 'quiz':
        arp(['E6', 'B6'], 0.07, 0.12, 0.14, 'triangle');
        break;
      case 'tick':
        this.voice(b, 'square', 1500, t, 0.025, 0.05, 6000);
        break;
      case 'select':
        this.voice(b, 'triangle', 880, t, 0.06, 0.12, 6000);
        break;
      case 'correct':
        arp(['C6', 'E6', 'G6', 'C7'], 0.045, 0.16, 0.13);
        break;
      case 'wrong':
        this.voice(b, 'sawtooth', 220, t, 0.32, 0.18, 1200, 90);
        this.voice(b, 'sawtooth', 233, t, 0.32, 0.14, 1200, 95);
        break;
      case 'clear':
        this.noiseHit(b, t, 0.3, 0.18, 600, 'bandpass', 6000);
        break;
      case 'tetris':
        arp(['C5', 'G5', 'C6', 'E6', 'G6', 'C7'], 0.05, 0.25, 0.12);
        this.noiseHit(b, t, 0.5, 0.2, 400, 'bandpass', 8000);
        break;
      case 'burn':
        this.noiseHit(b, t, 0.7, 0.35, 300, 'lowpass', 5000);
        this.voice(b, 'sawtooth', 110, t, 0.6, 0.15, 2500, 440);
        break;
      case 'levelup':
        arp(['G5', 'C6', 'E6', 'G6', 'E6', 'G6'], 0.07, 0.14, 0.11);
        break;
      case 'gameover':
        arp(['E5', 'C5', 'A4', 'E4', 'C4'], 0.16, 0.3, 0.13, 'triangle');
        break;
    }
  }
}
