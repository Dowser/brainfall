import { Board, HIDDEN_ROWS } from './board';
import { kicks, PIECE_COLOR, pieceCells, spawnPiece, type Cell, type Piece, type PieceType, type Rotation } from './pieces';
import type { AskedQuestion } from './quiz';
import { Bag } from './randomizer';
import { BURN_SCORE, gravityMs, levelForLines, lineScore, quizBonus, quizTimeMs } from './scoring';

export type Phase = 'playing' | 'quiz' | 'resolving' | 'paused' | 'over';

export type GameEvent =
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'hold' }
  | { type: 'land' }
  | { type: 'lock' }
  | { type: 'harddrop'; distance: number; cells: Cell[]; color: number }
  | { type: 'quiz'; rows: number[]; asked: AskedQuestion; total: number }
  | { type: 'answer'; correct: boolean; timeout: boolean; rows: number[]; asked: AskedQuestion; choice: number }
  /** `cells` is a snapshot of the cleared rows (the board is already updated when events are read). */
  | { type: 'clear'; rows: number[]; cells: number[][] }
  | { type: 'burn'; row: number }
  | { type: 'levelup'; level: number }
  | { type: 'gameover' };

export interface QuizState {
  asked: AskedQuestion;
  timeLeft: number;
  total: number;
  /** Index of the option the player picked, -1 for timeout, null while unanswered. */
  choice: number | null;
  correct: boolean | null;
}

export interface GameOptions {
  seed: number;
  nextQuestion: () => AskedQuestion | null;
  startLevel?: number;
}

export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const RESOLVE_MS = 380;
/** Correct answers in a row needed to burn away one locked row. */
export const BURN_STREAK = 3;

export class Game {
  board = new Board();
  active!: Piece;
  hold: PieceType | null = null;
  canHold = true;

  score = 0;
  lines = 0;
  level: number;
  streak = 0;
  maxStreak = 0;
  correctAnswers = 0;
  wrongAnswers = 0;
  burned = 0;

  phase: Phase = 'playing';
  pendingRows: number[] = [];
  quiz: QuizState | null = null;
  softDropping = false;
  events: GameEvent[] = [];

  private bag: Bag;
  private nextQuestion: () => AskedQuestion | null;
  private startLevel: number;
  private pausedFrom: Phase = 'playing';
  private resolveLeft = 0;
  private gravityAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private grounded = false;

  constructor(opts: GameOptions) {
    this.bag = new Bag(opts.seed);
    this.nextQuestion = opts.nextQuestion;
    this.startLevel = opts.startLevel ?? 1;
    this.level = this.startLevel;
    this.spawn(this.bag.next());
  }

  // ── queries ──────────────────────────────────────────────

  queue(n = 5): PieceType[] {
    return this.bag.peek(n);
  }

  ghostY(): number {
    let y = this.active.y;
    while (this.fitsAt({ ...this.active, y: y + 1 })) y++;
    return y;
  }

  private fitsAt(p: Piece) {
    return this.board.fits(pieceCells(p));
  }

  // ── input ────────────────────────────────────────────────

  move(dx: number): boolean {
    if (this.phase !== 'playing') return false;
    const next = { ...this.active, x: this.active.x + dx };
    if (!this.fitsAt(next)) return false;
    this.active = next;
    this.events.push({ type: 'move' });
    this.afterShift();
    return true;
  }

  rotate(dir: 1 | -1): boolean {
    if (this.phase !== 'playing') return false;
    const from = this.active.rot;
    const to = ((from + dir + 4) % 4) as Rotation;
    for (const [kx, ky] of kicks(this.active.type, from, to)) {
      const next = { ...this.active, rot: to, x: this.active.x + kx, y: this.active.y + ky };
      if (this.fitsAt(next)) {
        this.active = next;
        this.events.push({ type: 'rotate' });
        this.afterShift();
        return true;
      }
    }
    return false;
  }

  hardDrop() {
    if (this.phase !== 'playing') return;
    const distance = this.ghostY() - this.active.y;
    this.active = { ...this.active, y: this.active.y + distance };
    this.score += distance * 2;
    this.events.push({
      type: 'harddrop',
      distance,
      cells: pieceCells(this.active),
      color: PIECE_COLOR[this.active.type],
    });
    this.lock();
  }

  holdPiece() {
    if (this.phase !== 'playing' || !this.canHold) return;
    const current = this.active.type;
    const next = this.hold ?? this.bag.next();
    this.hold = current;
    this.spawn(next);
    this.canHold = false;
    this.events.push({ type: 'hold' });
  }

  /** Answer the current quiz: option index 0/1, or -1 for timeout. */
  answer(choice: number) {
    if (this.phase !== 'quiz' || !this.quiz) return;
    const timeout = choice < 0;
    const correct = !timeout && this.quiz.asked.options[choice] === 0;
    this.quiz.choice = choice;
    this.quiz.correct = correct;
    this.events.push({ type: 'answer', correct, timeout, rows: [...this.pendingRows], asked: this.quiz.asked, choice });
    this.phase = 'resolving';
    this.resolveLeft = RESOLVE_MS;
  }

  togglePause() {
    if (this.phase === 'over') return;
    if (this.phase === 'paused') {
      this.phase = this.pausedFrom;
    } else {
      this.pausedFrom = this.phase;
      this.phase = 'paused';
    }
  }

  // ── simulation ───────────────────────────────────────────

  update(dt: number) {
    switch (this.phase) {
      case 'quiz':
        this.quiz!.timeLeft -= dt;
        if (this.quiz!.timeLeft <= 0) {
          this.quiz!.timeLeft = 0;
          this.answer(-1);
        }
        return;
      case 'resolving':
        this.resolveLeft -= dt;
        if (this.resolveLeft <= 0) this.resolve();
        return;
      case 'playing':
        this.tickGravity(dt);
        return;
      default:
        return;
    }
  }

  private tickGravity(dt: number) {
    const base = gravityMs(this.level);
    const interval = this.softDropping ? Math.min(base / 20, 40) : base;
    this.gravityAcc += dt;
    // Cap iterations so a long frame (tab switch) can't teleport the piece through the stack weirdly.
    let steps = 0;
    while (this.gravityAcc >= interval && steps++ < 22) {
      this.gravityAcc -= interval;
      const next = { ...this.active, y: this.active.y + 1 };
      if (!this.fitsAt(next)) {
        this.gravityAcc = 0;
        break;
      }
      this.active = next;
      if (this.softDropping) this.score += 1;
      this.trackLowest();
    }

    const onGround = !this.fitsAt({ ...this.active, y: this.active.y + 1 });
    if (onGround && !this.grounded) this.events.push({ type: 'land' });
    this.grounded = onGround;
    if (onGround) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY_MS) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }

  private trackLowest() {
    if (this.active.y > this.lowestY) {
      this.lowestY = this.active.y;
      this.lockResets = 0;
    }
  }

  /** Move/rotate resets lock delay (guideline "move reset", limited). */
  private afterShift() {
    this.trackLowest();
    if (this.lockTimer > 0 && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private lock() {
    const cells = pieceCells(this.active);
    this.board.place(cells, PIECE_COLOR[this.active.type]);
    this.events.push({ type: 'lock' });

    // Lock out: the whole piece came to rest above the visible field.
    if (cells.every(([, y]) => y < HIDDEN_ROWS)) return this.gameOver();

    const rows = this.board.fullRows();
    if (rows.length === 0) return this.spawn(this.bag.next());

    this.pendingRows = rows;
    const asked = this.nextQuestion();
    if (!asked) {
      // No questions available: behave like a classic block-stacking game.
      this.quiz = null;
      this.applyCorrect(1);
      return this.finishTurn();
    }
    const total = quizTimeMs(this.level);
    this.quiz = { asked, total, timeLeft: total, choice: null, correct: null };
    this.phase = 'quiz';
    this.events.push({ type: 'quiz', rows: [...rows], asked, total });
  }

  private resolve() {
    const quiz = this.quiz!;
    if (quiz.correct) {
      this.correctAnswers++;
      this.applyCorrect(quiz.timeLeft / quiz.total);
    } else {
      this.wrongAnswers++;
      this.streak = 0;
      this.board.lockRows(this.pendingRows);
    }
    this.finishTurn();
  }

  private applyCorrect(timeFraction: number) {
    const rows = this.pendingRows;
    const n = rows.length;
    const levelBefore = this.level;
    this.score += lineScore(n, levelBefore) + (this.quiz ? quizBonus(levelBefore, timeFraction) : 0);
    this.events.push({ type: 'clear', rows: [...rows], cells: rows.map((y) => [...this.board.cells[y]]) });
    this.board.removeRows(rows);
    this.lines += n;

    if (this.quiz) {
      this.streak++;
      this.maxStreak = Math.max(this.maxStreak, this.streak);
      const locked = this.board.lockedRows();
      if (this.streak >= BURN_STREAK && locked.length > 0) {
        const row = locked[locked.length - 1];
        this.board.removeRows([row]);
        this.events.push({ type: 'burn', row });
        this.score += BURN_SCORE * levelBefore;
        this.burned++;
        this.streak -= BURN_STREAK;
      }
    }

    this.level = levelForLines(this.lines, this.startLevel);
    if (this.level > levelBefore) this.events.push({ type: 'levelup', level: this.level });
  }

  private finishTurn() {
    this.pendingRows = [];
    this.quiz = null;
    this.phase = 'playing';
    this.spawn(this.bag.next());
  }

  private spawn(type: PieceType) {
    this.active = spawnPiece(type);
    this.canHold = true;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = this.active.y;
    this.grounded = false;
    if (!this.fitsAt(this.active)) this.gameOver();
  }

  private gameOver() {
    this.phase = 'over';
    this.events.push({ type: 'gameover' });
  }
}
