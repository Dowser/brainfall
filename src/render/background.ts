/** Colour themes that rotate with the level: [sky top, horizon glow, grid line, sun]. */
const THEMES: [string, string, string, string][] = [
  ['#07061a', '#ff2fb0', '#ff3fd0', '#ffcf3f'],
  ['#020b1c', '#1fd6ff', '#29e0ff', '#a6ff4d'],
  ['#120414', '#ff6a1f', '#ff7a2f', '#ffe14d'],
  ['#03130d', '#2fff9a', '#3dffa8', '#d6ff3f'],
  ['#0c0420', '#a24dff', '#b46bff', '#ff6ad5'],
  ['#1a0207', '#ff2f4f', '#ff4060', '#ffb13f'],
];

interface Star {
  x: number;
  y: number;
  r: number;
  tw: number;
}

/** Synthwave sky + scrolling perspective grid, drawn at low resolution behind everything. */
export class Background {
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private offset = 0;
  private theme = 0;
  speed = 1;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.stars = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.55,
      r: Math.random() * 1.4 + 0.3,
      tw: Math.random() * Math.PI * 2,
    }));
    this.resize();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  setLevel(level: number) {
    this.theme = (level - 1) % THEMES.length;
    this.speed = 1 + Math.min(level - 1, 15) * 0.15;
  }

  draw(dt: number, now: number) {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const [sky, glow, line, sun] = THEMES[this.theme];
    const horizon = h * 0.58;
    if (!this.reducedMotion) this.offset = (this.offset + dt * 0.00035 * this.speed) % 1;

    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, sky);
    g.addColorStop(1, glow + '55');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizon);

    for (const s of this.stars) {
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(now / 900 + s.tw);
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // sun with scanline cut-outs
    const r = Math.min(w, h) * 0.17;
    const cx = w / 2;
    const cy = horizon - r * 0.35;
    const sg = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    sg.addColorStop(0, sun);
    sg.addColorStop(1, glow);
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = r * 0.6;
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.lineTo(cx + r, horizon);
    ctx.lineTo(cx - r, horizon);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = sky;
    for (let i = 0; i < 6; i++) {
      const yy = cy + r * (0.05 + i * 0.13);
      ctx.fillRect(cx - r, yy, r * 2, 2 + i * 1.4);
    }

    // floor
    const fg = ctx.createLinearGradient(0, horizon, 0, h);
    fg.addColorStop(0, '#05030f');
    fg.addColorStop(1, sky);
    ctx.fillStyle = fg;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.strokeStyle = line;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let i = -20; i <= 20; i++) {
      ctx.moveTo(cx + i * w * 0.012, horizon);
      ctx.lineTo(cx + i * w * 0.16, h);
    }
    for (let i = 0; i < 14; i++) {
      const z = (i + this.offset) / 14;
      const y = horizon + (h - horizon) * z * z;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    const hg = ctx.createLinearGradient(0, horizon - 2, 0, horizon + 40);
    hg.addColorStop(0, glow + 'aa');
    hg.addColorStop(1, glow + '00');
    ctx.fillStyle = hg;
    ctx.fillRect(0, horizon - 2, w, 42);
  }
}
