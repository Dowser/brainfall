import type { Game } from '../core/game';

/** Movement (px) before a touch counts as a drag rather than a tap. */
const TAP_SLOP = 10;
const TAP_MAX_MS = 280;
/** Finger speed (px/ms) over the last moments of a swipe that counts as a flick. */
const FLICK_SPEED = 0.9;
const FLICK_WINDOW_MS = 80;

export type Release = 'rotate-cw' | 'rotate-ccw' | 'harddrop' | 'hold' | null;

export interface ReleaseInfo {
  /** Total finger travel since touch start. */
  dx: number;
  dy: number;
  durationMs: number;
  /** Vertical speed over the last ~80 ms, px/ms (positive = downwards). */
  recentVy: number;
  /** Vertical travel over the last ~80 ms. */
  recentDy: number;
  /** Did the gesture already move the piece sideways? */
  movedSideways: boolean;
  /** Touch x relative to screen width (0..1), used to pick rotation direction. */
  xFraction: number;
  /** One board cell in px – flick distances scale with it. */
  cell: number;
}

/** Decides what a finished touch gesture means. Pure so it can be unit tested. */
export function classifyRelease(r: ReleaseInfo): Release {
  const dist = Math.hypot(r.dx, r.dy);
  if (dist < TAP_SLOP && r.durationMs < TAP_MAX_MS) {
    return r.xFraction < 0.5 ? 'rotate-ccw' : 'rotate-cw';
  }
  const flickDist = Math.max(18, r.cell * 0.6);
  if (r.recentVy > FLICK_SPEED && r.recentDy > flickDist) return 'harddrop';
  if (!r.movedSideways && r.recentVy < -FLICK_SPEED && r.recentDy < -flickDist && Math.abs(r.dy) > Math.abs(r.dx)) {
    return 'hold';
  }
  return null;
}

interface Sample {
  t: number;
  y: number;
}

/**
 * Touch gestures on the game area:
 *   drag sideways → move one column per cell of finger travel
 *   drag down slowly → soft drop following the finger
 *   flick down → hard drop, flick up → hold
 *   tap → rotate (left half counter-clockwise, right half clockwise)
 */
export class TouchControls {
  game: Game | null = null;
  /** Set when a touch gesture was used, so haptics only fire for touch players. */
  active = false;

  private id: number | null = null;
  private startX = 0;
  private startY = 0;
  private startT = 0;
  private axis: 'h' | 'v' | null = null;
  private appliedX = 0;
  private appliedY = 0;
  private movedSideways = false;
  private samples: Sample[] = [];
  /** The piece this gesture started on; once it locks, the rest of the gesture is ignored. */
  private piece = -1;

  constructor(
    el: HTMLElement,
    private cellSize: () => number,
    private onRelease: (r: Release) => void,
  ) {
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', () => this.reset());
  }

  private reset() {
    this.id = null;
    if (this.game) this.game.softDropping = false;
  }

  private down(e: PointerEvent) {
    if (e.pointerType === 'mouse' || this.id !== null) return;
    if ((e.target as Element).closest('button')) return;
    this.active = true;
    this.id = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startT = e.timeStamp;
    this.axis = null;
    this.appliedX = 0;
    this.appliedY = 0;
    this.movedSideways = false;
    this.samples = [{ t: e.timeStamp, y: e.clientY }];
    this.piece = this.game?.pieceCount ?? -1;
    try {
      // Keep receiving moves even when the finger leaves the board.
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone – the gesture still works without capture */
    }
  }

  private move(e: PointerEvent) {
    if (e.pointerId !== this.id) return;
    const g = this.game;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    this.samples.push({ t: e.timeStamp, y: e.clientY });
    while (this.samples.length > 2 && e.timeStamp - this.samples[0].t > FLICK_WINDOW_MS) this.samples.shift();

    if (!this.axis && Math.hypot(dx, dy) > TAP_SLOP) this.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (!g || g.phase !== 'playing' || g.pieceCount !== this.piece) return;

    const cell = this.cellSize();
    // Sideways stays live during a downward drag too, so players can steer while soft dropping.
    const wantX = Math.trunc(dx / (cell * 0.9));
    if (this.axis === 'h' || (this.axis === 'v' && Math.abs(dx) > cell * 1.5)) {
      for (; this.appliedX < wantX; this.appliedX++) if (g.move(1)) this.movedSideways = true;
      for (; this.appliedX > wantX; this.appliedX--) if (g.move(-1)) this.movedSideways = true;
    }
    if (this.axis === 'v' && dy > 0) {
      const wantY = Math.floor(dy / cell);
      for (; this.appliedY < wantY; this.appliedY++) g.softDropStep();
    }
  }

  private up(e: PointerEvent) {
    if (e.pointerId !== this.id) return;
    this.id = null;
    if (this.game?.pieceCount !== this.piece) return;
    const first = this.samples[0];
    const span = Math.max(1, e.timeStamp - first.t);
    const recentDy = e.clientY - first.y;
    const result = classifyRelease({
      dx: e.clientX - this.startX,
      dy: e.clientY - this.startY,
      durationMs: e.timeStamp - this.startT,
      recentVy: recentDy / span,
      recentDy,
      movedSideways: this.movedSideways,
      xFraction: e.clientX / window.innerWidth,
      cell: this.cellSize(),
    });
    if (result) this.onRelease(result);
  }
}
