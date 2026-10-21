import { COLORS } from './sprites';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface FloatText {
  text: string;
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

/** Particles, floating text and screen shake. Coordinates are in board cells. */
export class Effects {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  shakeTime = 0;
  shakeAmp = 0;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** `cells[i]` holds the colours of `rows[i]` before it was removed. */
  rowBurst(rows: number[], cells: number[][], hiddenRows: number) {
    if (this.reducedMotion) return;
    for (const [i, y] of rows.entries()) {
      for (let x = 0; x < 10; x++) {
        const color = COLORS[cells[i]?.[x] || 1] || '#ffffff';
        for (let i = 0; i < 4; i++) {
          this.particles.push({
            x: x + Math.random(),
            y: y - hiddenRows + Math.random(),
            vx: (Math.random() - 0.5) * 14,
            vy: (Math.random() - 0.8) * 12,
            life: 0,
            max: 500 + Math.random() * 500,
            size: 0.08 + Math.random() * 0.14,
            color,
          });
        }
      }
    }
  }

  burnRow(y: number) {
    if (this.reducedMotion) return;
    for (let x = 0; x < 10; x += 0.25) {
      this.particles.push({
        x,
        y: y + Math.random(),
        vx: (Math.random() - 0.5) * 3,
        vy: -4 - Math.random() * 8,
        life: 0,
        max: 700 + Math.random() * 600,
        size: 0.1 + Math.random() * 0.2,
        color: Math.random() < 0.5 ? '#ff7a1f' : '#ffd24d',
      });
    }
  }

  dropTrail(cells: readonly (readonly [number, number])[], color: number, hiddenRows: number, distance: number) {
    if (this.reducedMotion || distance < 2) return;
    for (const [x, y] of cells) {
      for (let i = 0; i < 3; i++) {
        this.particles.push({
          x: x + Math.random(),
          y: y - hiddenRows - Math.random() * Math.min(distance, 6),
          vx: (Math.random() - 0.5) * 1.5,
          vy: -1 - Math.random() * 2,
          life: 0,
          max: 250 + Math.random() * 250,
          size: 0.06 + Math.random() * 0.08,
          color: COLORS[color],
        });
      }
    }
  }

  text(text: string, color = '#ffffff', size = 1.4, y = 8) {
    this.texts.push({ text, x: 5, y, life: 0, max: 1100, color, size });
  }

  shake(amp: number, ms = 160) {
    if (this.reducedMotion) return;
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeTime = Math.max(this.shakeTime, ms);
  }

  update(dt: number) {
    const s = dt / 1000;
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vy += 22 * s;
      p.vx *= 0.98;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const t of this.texts) t.life += dt;
    this.texts = this.texts.filter((t) => t.life < t.max);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime === 0) this.shakeAmp = 0;
  }

  shakeOffset(): [number, number] {
    if (!this.shakeTime) return [0, 0];
    const a = this.shakeAmp * (this.shakeTime / 160);
    return [(Math.random() - 0.5) * a, (Math.random() - 0.5) * a];
  }

  draw(ctx: CanvasRenderingContext2D, cell: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      const sz = p.size * cell * (0.5 + k * 0.5);
      ctx.fillRect(p.x * cell - sz / 2, p.y * cell - sz / 2, sz, sz);
    }
    ctx.restore();

    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.3);
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.translate(t.x * cell, (t.y - k * 1.5) * cell);
      ctx.scale(pop, pop);
      ctx.font = `900 ${t.size * cell}px Orbitron, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = t.color;
      ctx.shadowBlur = cell * 0.6;
      ctx.lineWidth = cell * 0.12;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
  }
}
