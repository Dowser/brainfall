import { describe, expect, it } from 'vitest';
import { Board, COLS, LOCKED, ROWS } from '../src/core/board';
import { Game, RESOLVE_MS } from '../src/core/game';
import { kicks, pieceCells, SHAPES, spawnPiece } from '../src/core/pieces';
import { QuestionDeck, type AskedQuestion, type Question } from '../src/core/quiz';
import { Bag } from '../src/core/randomizer';

const Q: Question = { id: 't-1', cat: 'misc', q: '1+1?', a: ['2', '3'] };
const askCorrectFirst = (): AskedQuestion => ({ question: Q, options: [0, 1] });

/** Fill row y fully except the given gap columns. */
function fillRow(board: Board, y: number, gaps: number[] = []) {
  for (let x = 0; x < COLS; x++) board.cells[y][x] = gaps.includes(x) ? 0 : 3;
}

/** Game with an I piece active and the bottom row missing columns 0-3 → hard drop clears it. */
function gameReadyForLine(nextQuestion: () => AskedQuestion | null = askCorrectFirst) {
  // Search for a seed whose first piece is I so the test is deterministic.
  for (let seed = 1; seed < 500; seed++) {
    const g = new Game({ seed, nextQuestion });
    if (g.active.type === 'I') {
      fillRow(g.board, ROWS - 1, [0, 1, 2, 3]);
      g.move(-1);
      g.move(-1);
      g.move(-1);
      return g;
    }
  }
  throw new Error('no I seed');
}

describe('pieces / SRS', () => {
  it('every piece has 4 cells in every rotation', () => {
    for (const states of Object.values(SHAPES)) for (const s of states) expect(s).toHaveLength(4);
  });

  it('I piece rotates within a 4x4 box (state R is column 2)', () => {
    expect(SHAPES.I[1].map(([x]) => x)).toEqual([2, 2, 2, 2]);
  });

  it('kick tables are y-down and start with no offset', () => {
    expect(kicks('T', 0, 1)[0]).toEqual([0, 0]);
    expect(kicks('T', 0, 1)[2]).toEqual([-1, -1]); // standard (-1,+1) flipped
    expect(kicks('O', 0, 1)).toEqual([[0, 0]]);
  });

  it('pieces spawn horizontally centred', () => {
    const xs = pieceCells(spawnPiece('T')).map(([x]) => x);
    expect(Math.min(...xs)).toBe(3);
    expect(Math.max(...xs)).toBe(5);
  });

  it('wall kick lets T rotate against the left wall', () => {
    const g = new Game({ seed: 7, nextQuestion: () => null });
    g.active = { type: 'T', rot: 1, x: -1, y: 5 }; // vertical T flush with left wall
    expect(g.rotate(1)).toBe(true);
    expect(pieceCells(g.active).every(([x]) => x >= 0)).toBe(true);
  });
});

describe('7-bag randomizer', () => {
  it('each bag of 7 contains every piece once', () => {
    const bag = new Bag(42);
    for (let b = 0; b < 20; b++) {
      const set = new Set(Array.from({ length: 7 }, () => bag.next()));
      expect(set.size).toBe(7);
    }
  });

  it('same seed → same sequence (shareable challenges)', () => {
    const a = new Bag(1234);
    const b = new Bag(1234);
    expect(Array.from({ length: 50 }, () => a.next())).toEqual(Array.from({ length: 50 }, () => b.next()));
  });
});

describe('board', () => {
  it('locked rows do not count as full rows', () => {
    const b = new Board();
    fillRow(b, ROWS - 1);
    b.lockRows([ROWS - 1]);
    expect(b.cells[ROWS - 1].every((c) => c === LOCKED)).toBe(true);
    expect(b.fullRows()).toEqual([]);
    expect(b.lockedRows()).toEqual([ROWS - 1]);
  });

  it('removing rows shifts the stack down', () => {
    const b = new Board();
    b.cells[ROWS - 2][0] = 5;
    fillRow(b, ROWS - 1);
    b.removeRows([ROWS - 1]);
    expect(b.cells[ROWS - 1][0]).toBe(5);
    expect(b.cells).toHaveLength(ROWS);
  });
});

describe('quiz flow', () => {
  it('a line clear pauses play and asks a question', () => {
    const g = gameReadyForLine();
    g.hardDrop();
    expect(g.phase).toBe('quiz');
    expect(g.pendingRows).toEqual([ROWS - 1]);
  });

  it('correct answer clears the row and scores', () => {
    const g = gameReadyForLine();
    g.hardDrop();
    g.answer(0);
    g.update(RESOLVE_MS);
    expect(g.phase).toBe('playing');
    expect(g.lines).toBe(1);
    expect(g.board.cells[ROWS - 1].every((c) => c === 0)).toBe(true);
    expect(g.streak).toBe(1);
  });

  it('wrong answer leaves a locked row', () => {
    const g = gameReadyForLine();
    g.hardDrop();
    g.answer(1);
    g.update(RESOLVE_MS);
    expect(g.lines).toBe(0);
    expect(g.board.isLockedRow(ROWS - 1)).toBe(true);
    expect(g.streak).toBe(0);
  });

  it('timeout counts as wrong', () => {
    const g = gameReadyForLine();
    g.hardDrop();
    g.update(g.quiz!.total + 1);
    expect(g.quiz?.correct).toBe(false);
    g.update(RESOLVE_MS);
    expect(g.board.isLockedRow(ROWS - 1)).toBe(true);
  });

  it('three correct in a row burns the lowest locked row', () => {
    const g = gameReadyForLine();
    // Locked row at the bottom, gap row on top of it for the I piece.
    fillRow(g.board, ROWS - 1);
    g.board.lockRows([ROWS - 1]);
    fillRow(g.board, ROWS - 2, [0, 1, 2, 3]);
    g.streak = 2;
    g.hardDrop();
    expect(g.pendingRows).toEqual([ROWS - 2]);
    g.answer(0);
    g.update(RESOLVE_MS);
    expect(g.burned).toBe(1);
    expect(g.board.lockedRows()).toEqual([]);
    expect(g.streak).toBe(0);
  });

  it('without questions it plays like classic Tetris', () => {
    const g = gameReadyForLine(() => null);
    g.hardDrop();
    expect(g.phase).toBe('playing');
    expect(g.lines).toBe(1);
  });

  it('input is ignored while a question is open', () => {
    const g = gameReadyForLine();
    g.hardDrop();
    const before = { ...g.active };
    expect(g.move(1)).toBe(false);
    expect(g.active).toEqual(before);
  });
});

describe('question deck', () => {
  const bank: Question[] = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, cat: 'x', q: `${i}?`, a: ['y', 'n'] }));

  it('does not repeat until the bank is exhausted', () => {
    const deck = new QuestionDeck(bank);
    const ids = Array.from({ length: 5 }, () => deck.next()!.question.id);
    expect(new Set(ids).size).toBe(5);
    expect(deck.next()).not.toBeNull();
  });

  it('skips questions seen in earlier sessions', () => {
    const deck = new QuestionDeck(bank, new Set(['q0', 'q1', 'q2', 'q3']));
    expect(deck.next()!.question.id).toBe('q4');
  });

  it('options always map to both answers', () => {
    const deck = new QuestionDeck(bank);
    for (let i = 0; i < 20; i++) expect([...deck.next()!.options].sort()).toEqual([0, 1]);
  });
});
