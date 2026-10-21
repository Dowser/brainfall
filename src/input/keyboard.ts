import type { Game } from '../core/game';
import type { Action } from '../storage';

const ANSWER_KEYS: Record<string, number> = {
  ArrowLeft: 0, KeyA: 0, Digit1: 0, Numpad1: 0,
  ArrowRight: 1, KeyD: 1, Digit2: 1, Numpad2: 1,
};

/** Ignore answer presses this soon after a question appears (a tap already in flight). */
const ANSWER_GRACE_MS = 140;

export interface ControlHooks {
  pause(): void;
  toggleMusic(): void;
  toggleSfx(): void;
  /** True while a dialog owns the keyboard. */
  blocked(): boolean;
}

/**
 * Keyboard → game. Implements DAS/ARR ourselves instead of relying on OS key repeat,
 * which varies per machine and feels sluggish.
 */
export class Controls {
  das = 167;
  arr = 33;
  game: Game | null = null;

  private held: { dir: -1 | 1; time: number; acc: number } | null = null;
  private down = new Set<Action>();
  private quizShownAt = 0;

  constructor(
    private keys: () => Record<Action, string[]>,
    private hooks: ControlHooks,
  ) {
    window.addEventListener('keydown', (e) => this.onDown(e));
    window.addEventListener('keyup', (e) => this.onUp(e));
    window.addEventListener('blur', () => this.releaseAll());
  }

  private actionFor(code: string): Action | null {
    const map = this.keys();
    for (const action of Object.keys(map) as Action[]) if (map[action].includes(code)) return action;
    return null;
  }

  /** Called when a question pops up: drop held movement so answering doesn't move the next piece. */
  onQuizShown() {
    this.quizShownAt = performance.now();
    this.releaseAll();
  }

  releaseAll() {
    this.held = null;
    this.down.clear();
    if (this.game) this.game.softDropping = false;
  }

  private onDown(e: KeyboardEvent) {
    const g = this.game;
    if (!g || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.metaKey || e.altKey || this.hooks.blocked()) return;

    if (e.code === 'KeyM' && !e.repeat) return this.hooks.toggleMusic();
    if (e.code === 'KeyS' && !e.repeat) return this.hooks.toggleSfx();

    const action = this.actionFor(e.code);
    if (action || e.code in ANSWER_KEYS) e.preventDefault();
    if (e.repeat) return;

    if (g.phase === 'quiz') {
      if (e.code in ANSWER_KEYS && performance.now() - this.quizShownAt > ANSWER_GRACE_MS) {
        g.answer(ANSWER_KEYS[e.code]);
      } else if (action === 'pause') {
        this.hooks.pause();
      }
      return;
    }

    if (!action) return;
    if (action === 'pause') return this.hooks.pause();
    if (g.phase !== 'playing') return;

    this.down.add(action);
    switch (action) {
      case 'left':
      case 'right': {
        const dir = action === 'left' ? -1 : 1;
        g.move(dir);
        this.held = { dir, time: 0, acc: 0 };
        break;
      }
      case 'soft':
        g.softDropping = true;
        break;
      case 'hard':
        g.hardDrop();
        break;
      case 'cw':
        g.rotate(1);
        break;
      case 'ccw':
        g.rotate(-1);
        break;
      case 'hold':
        g.holdPiece();
        break;
    }
  }

  private onUp(e: KeyboardEvent) {
    const action = this.actionFor(e.code);
    if (!action) return;
    this.down.delete(action);
    if (action === 'soft' && this.game) this.game.softDropping = false;
    if ((action === 'left' || action === 'right') && this.held) {
      const other = action === 'left' ? 'right' : 'left';
      // Holding both: fall back to the one still pressed.
      this.held = this.down.has(other) ? { dir: other === 'left' ? -1 : 1, time: 0, acc: 0 } : null;
    }
  }

  update(dt: number) {
    const g = this.game;
    if (!g || !this.held || g.phase !== 'playing') return;
    this.held.time += dt;
    if (this.held.time < this.das) return;
    this.held.acc += dt;
    while (this.held.acc >= this.arr) {
      this.held.acc -= this.arr;
      if (!g.move(this.held.dir)) {
        this.held.acc = 0;
        break;
      }
    }
  }
}
