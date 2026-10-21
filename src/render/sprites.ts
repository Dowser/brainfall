import { LOCKED } from '../core/board';

/** Index = board cell value. 1..7 tetrominoes, 8 locked. */
export const COLORS = ['', '#22e5ff', '#3d6bff', '#ff9a1f', '#ffe14d', '#3dff7a', '#c04dff', '#ff3d6a', '#5b6273'];

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function shade(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c + amt * 255))));
  return `rgb(${r},${g},${b})`;
}

/**
 * Pre-rendered block sprites. Drawing gradients + glow per cell every frame is slow,
 * so each colour is rendered once per cell size and blitted with drawImage.
 */
export class BlockSprites {
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(private dpr: number) {}

  get(color: number, size: number): HTMLCanvasElement {
    const key = `${color}:${size}`;
    let c = this.cache.get(key);
    if (!c) {
      c = color === LOCKED ? this.drawLocked(size) : this.drawBlock(COLORS[color], size);
      this.cache.set(key, c);
    }
    return c;
  }

  private canvas(size: number) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * this.dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(this.dpr, this.dpr);
    return { c, ctx };
  }

  private drawBlock(hex: string, s: number) {
    const { c, ctx } = this.canvas(s);
    const p = Math.max(1, s * 0.06);
    const r = s * 0.16;
    // body
    const body = ctx.createLinearGradient(0, 0, s, s);
    body.addColorStop(0, shade(hex, 0.18));
    body.addColorStop(0.55, hex);
    body.addColorStop(1, shade(hex, -0.25));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(p, p, s - 2 * p, s - 2 * p, r);
    ctx.fill();
    // inner bevel
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.roundRect(p * 2.2, p * 2.2, s - 4.4 * p, s - 4.4 * p, r * 0.7);
    ctx.stroke();
    // gloss
    const gloss = ctx.createLinearGradient(0, p, 0, s * 0.55);
    gloss.addColorStop(0, 'rgba(255,255,255,0.55)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.roundRect(p * 2.5, p * 2.5, s - 5 * p, s * 0.38, [r * 0.6, r * 0.6, r * 0.2, r * 0.2]);
    ctx.fill();
    return c;
  }

  private drawLocked(s: number) {
    const { c, ctx } = this.canvas(s);
    const p = Math.max(1, s * 0.06);
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#4a505d');
    g.addColorStop(1, '#262a33');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(p, p, s - 2 * p, s - 2 * p, s * 0.1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,70,100,0.55)';
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.stroke();
    // cracks
    ctx.strokeStyle = 'rgba(10,10,14,0.85)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.15);
    ctx.lineTo(s * 0.45, s * 0.45);
    ctx.lineTo(s * 0.38, s * 0.7);
    ctx.lineTo(s * 0.55, s * 0.88);
    ctx.moveTo(s * 0.45, s * 0.45);
    ctx.lineTo(s * 0.8, s * 0.35);
    ctx.stroke();
    return c;
  }
}
