import { COLS, HIDDEN_ROWS, ROWS, VISIBLE_ROWS } from '../core/board';
import { RESOLVE_MS, type Game } from '../core/game';
import { PIECE_COLOR, SHAPES, pieceCells, type PieceType } from '../core/pieces';
import type { Effects } from './effects';
import { BlockSprites, COLORS, rgba } from './sprites';

function setupCanvas(c: HTMLCanvasElement, w: number, h: number, dpr: number) {
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export class Renderer {
  cell = 32;
  private nextCount = 5;
  private nextHorizontal = false;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private sprites = new BlockSprites(this.dpr);
  private ctx!: CanvasRenderingContext2D;
  private holdCtx!: CanvasRenderingContext2D;
  private nextCtx!: CanvasRenderingContext2D;
  private resolveStart = 0;

  constructor(
    private board: HTMLCanvasElement,
    private holdCanvas: HTMLCanvasElement,
    private nextCanvas: HTMLCanvasElement,
  ) {
    this.resize();
  }

  resize() {
    // Phones get a header row (hold · stats · next) above a full-width board; desktop has side panels.
    const narrow = window.innerWidth <= 640;
    const byH = (window.innerHeight - (narrow ? 126 : 56)) / VISIBLE_ROWS;
    const byW = (window.innerWidth - (narrow ? 16 : 380)) / COLS;
    this.cell = Math.max(14, Math.min(44, Math.floor(Math.min(byH, byW))));
    const c = this.cell;
    this.ctx = setupCanvas(this.board, c * COLS, c * VISIBLE_ROWS, this.dpr);
    const mini = narrow ? 13 : Math.round(c * 0.7);
    this.holdCtx = setupCanvas(this.holdCanvas, mini * 4.5, mini * 3, this.dpr);
    this.nextCount = narrow ? 2 : 5;
    this.nextHorizontal = narrow;
    this.nextCtx = narrow
      ? setupCanvas(this.nextCanvas, mini * 4.5 * this.nextCount, mini * 3, this.dpr)
      : setupCanvas(this.nextCanvas, mini * 4.5, mini * 3 * this.nextCount, this.dpr);
    document.documentElement.style.setProperty('--cell', `${c}px`);
  }

  /** Remember when an answer came in so the row animation can be timed. */
  markResolve(now: number) {
    this.resolveStart = now;
  }

  draw(game: Game, fx: Effects, now: number) {
    const ctx = this.ctx;
    const c = this.cell;
    const W = c * COLS;
    const H = c * VISIBLE_ROWS;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    const [sx, sy] = fx.shakeOffset();
    ctx.translate(sx, sy);

    // well
    ctx.fillStyle = 'rgba(6, 8, 22, 0.88)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(120, 140, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * c + 0.5, 0);
      ctx.lineTo(x * c + 0.5, H);
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.moveTo(0, y * c + 0.5);
      ctx.lineTo(W, y * c + 0.5);
    }
    ctx.stroke();

    this.drawDanger(game, ctx, W, c);

    // settled blocks
    const cells = game.board.cells;
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = cells[y][x];
        if (v) ctx.drawImage(this.sprites.get(v, c), x * c, (y - HIDDEN_ROWS) * c, c, c);
      }
      if (game.board.isLockedRow(y)) {
        const pulse = 0.08 + 0.06 * Math.sin(now / 300 + y);
        ctx.fillStyle = `rgba(255, 60, 100, ${pulse})`;
        ctx.fillRect(0, (y - HIDDEN_ROWS) * c, W, c);
      }
    }

    this.drawPendingRows(game, ctx, W, c, now);

    if (game.phase === 'playing' || game.phase === 'paused') {
      this.drawGhost(game, ctx, c);
      const color = PIECE_COLOR[game.active.type];
      for (const [x, y] of pieceCells(game.active)) {
        if (y >= HIDDEN_ROWS) ctx.drawImage(this.sprites.get(color, c), x * c, (y - HIDDEN_ROWS) * c, c, c);
      }
    }

    fx.draw(ctx, c);
    ctx.restore();

    this.drawMini(this.holdCtx, game.hold ? [game.hold] : [], !game.canHold, false);
    this.drawMini(this.nextCtx, game.queue(this.nextCount), false, this.nextHorizontal);
  }

  private drawDanger(game: Game, ctx: CanvasRenderingContext2D, W: number, c: number) {
    let top = ROWS;
    for (let y = 0; y < ROWS; y++) {
      if (game.board.cells[y].some(Boolean)) {
        top = y;
        break;
      }
    }
    const height = ROWS - top;
    if (height < 14) return;
    const k = Math.min(1, (height - 13) / 5);
    const g = ctx.createLinearGradient(0, 0, 0, c * 5);
    g.addColorStop(0, `rgba(255, 40, 80, ${0.35 * k})`);
    g.addColorStop(1, 'rgba(255, 40, 80, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, c * 5);
  }

  private drawPendingRows(game: Game, ctx: CanvasRenderingContext2D, W: number, c: number, now: number) {
    if (!game.pendingRows.length) return;
    for (const y of game.pendingRows) {
      const top = (y - HIDDEN_ROWS) * c;
      if (game.phase === 'resolving' && game.quiz) {
        const k = Math.min(1, (now - this.resolveStart) / RESOLVE_MS);
        if (game.quiz.correct) {
          // flash white and squeeze the row towards its centre line
          ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.65 * k})`;
          const h = c * (1 - k * 0.85);
          ctx.fillRect(0, top + (c - h) / 2, W, h);
        } else {
          ctx.fillStyle = `rgba(255, 50, 90, ${0.6 * (1 - k)})`;
          ctx.fillRect(0, top, W, c);
        }
      } else {
        const pulse = 0.18 + 0.14 * Math.sin(now / 90);
        ctx.fillStyle = `rgba(255,255,255,${pulse})`;
        ctx.fillRect(0, top, W, c);
      }
    }
  }

  private drawGhost(game: Game, ctx: CanvasRenderingContext2D, c: number) {
    const gy = game.ghostY();
    if (gy === game.active.y) return;
    const hex = COLORS[PIECE_COLOR[game.active.type]];
    ctx.save();
    ctx.strokeStyle = rgba(hex, 0.55);
    ctx.fillStyle = rgba(hex, 0.1);
    ctx.lineWidth = Math.max(1, c * 0.06);
    for (const [x, y] of pieceCells({ ...game.active, y: gy })) {
      if (y < HIDDEN_ROWS) continue;
      const p = c * 0.1;
      ctx.beginPath();
      ctx.roundRect(x * c + p, (y - HIDDEN_ROWS) * c + p, c - 2 * p, c - 2 * p, c * 0.14);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Hold box / next queue. Pieces stack vertically, or side by side in the phone header. */
  private drawMini(ctx: CanvasRenderingContext2D, pieces: PieceType[], dim: boolean, horizontal: boolean) {
    const canvas = ctx.canvas;
    const w = canvas.width / this.dpr;
    const h = canvas.height / this.dpr;
    ctx.clearRect(0, 0, w, h);
    const slotW = horizontal ? w / Math.max(1, pieces.length) : w;
    const slotH = horizontal ? h : (w / 4.5) * 3;
    const m = slotW / 4.5;
    pieces.forEach((type, i) => {
      const cells = SHAPES[type][0];
      const xs = cells.map(([x]) => x);
      const ys = cells.map(([, y]) => y);
      const pw = Math.max(...xs) - Math.min(...xs) + 1;
      const ph = Math.max(...ys) - Math.min(...ys) + 1;
      const s = i === 0 ? m : m * 0.85;
      const sx = horizontal ? i * slotW : 0;
      const sy = horizontal ? 0 : i * slotH;
      const ox = sx + (slotW - pw * s) / 2 - Math.min(...xs) * s;
      const oy = sy + (slotH - ph * s) / 2 - Math.min(...ys) * s;
      ctx.globalAlpha = dim ? 0.35 : 1;
      const color = PIECE_COLOR[type];
      for (const [x, y] of cells) ctx.drawImage(this.sprites.get(color, s), ox + x * s, oy + y * s, s, s);
    });
    ctx.globalAlpha = 1;
  }
}
