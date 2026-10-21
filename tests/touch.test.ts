import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { classifyRelease, type ReleaseInfo } from '../src/input/touch';

const base: ReleaseInfo = {
  dx: 0,
  dy: 0,
  durationMs: 120,
  recentVy: 0,
  recentDy: 0,
  movedSideways: false,
  xFraction: 0.7,
  cell: 34,
};

describe('touch gestures', () => {
  it('quick tap rotates – right half clockwise, left half counter-clockwise', () => {
    expect(classifyRelease({ ...base, dx: 3, dy: 2 })).toBe('rotate-cw');
    expect(classifyRelease({ ...base, xFraction: 0.2 })).toBe('rotate-ccw');
  });

  it('a long press is not a tap', () => {
    expect(classifyRelease({ ...base, durationMs: 600 })).toBeNull();
  });

  it('fast downward flick hard drops, even after steering sideways', () => {
    expect(classifyRelease({ ...base, dx: 60, dy: 140, recentVy: 1.6, recentDy: 70, movedSideways: true })).toBe('harddrop');
  });

  it('slow drag down does not hard drop', () => {
    expect(classifyRelease({ ...base, dy: 200, durationMs: 900, recentVy: 0.2, recentDy: 15 })).toBeNull();
  });

  it('upward flick holds, but not after a sideways move', () => {
    const up = { ...base, dy: -120, recentVy: -1.5, recentDy: -60 };
    expect(classifyRelease(up)).toBe('hold');
    expect(classifyRelease({ ...up, movedSideways: true })).toBeNull();
  });

  it('sideways drag alone does nothing on release', () => {
    expect(classifyRelease({ ...base, dx: 120, dy: 8, durationMs: 400, movedSideways: true })).toBeNull();
  });
});

describe('softDropStep', () => {
  it('moves the piece one row and scores 1', () => {
    const g = new Game({ seed: 3, nextQuestion: () => null });
    const y = g.active.y;
    expect(g.softDropStep()).toBe(true);
    expect(g.active.y).toBe(y + 1);
    expect(g.score).toBe(1);
  });

  it('stops at the floor without locking', () => {
    const g = new Game({ seed: 3, nextQuestion: () => null });
    const pieces = g.pieceCount;
    while (g.softDropStep());
    expect(g.active.y).toBe(g.ghostY());
    expect(g.pieceCount).toBe(pieces);
  });
});
