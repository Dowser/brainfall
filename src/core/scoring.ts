const LINE_SCORE = [0, 100, 300, 500, 800];

export function lineScore(lines: number, level: number) {
  const base = LINE_SCORE[Math.min(lines, 4)] * level;
  return lines >= 4 ? base * 2 : base;
}

/** Bonus for answering, scaled by how much time was left (0..1). */
export function quizBonus(level: number, timeFraction: number) {
  return Math.round((50 + 100 * timeFraction) * level);
}

export const BURN_SCORE = 250;

/** Guideline gravity: milliseconds per row. */
export function gravityMs(level: number) {
  return Math.pow(0.8 - (level - 1) * 0.007, level - 1) * 1000;
}

/** Quiz answer time shrinks with level: 6 s → 3 s. */
export function quizTimeMs(level: number) {
  return Math.max(3000, 6000 - (level - 1) * 300);
}

export function levelForLines(lines: number, startLevel = 1) {
  return startLevel + Math.floor(lines / 10);
}
