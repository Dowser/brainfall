import { PIECE_TYPES, type PieceType } from './pieces';

/** Small, fast, seedable PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36).padStart(6, '0').slice(-6);
}

/** Guideline 7-bag: every 7 pieces contain each tetromino exactly once. */
export class Bag {
  private queue: PieceType[] = [];
  private rng: () => number;

  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }

  private refill() {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue.push(...bag);
  }

  next(): PieceType {
    if (this.queue.length <= 7) this.refill();
    return this.queue.shift()!;
  }

  peek(n: number): PieceType[] {
    while (this.queue.length < n) this.refill();
    return this.queue.slice(0, n);
  }
}
