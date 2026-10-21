import type { Cell } from './pieces';

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const EMPTY = 0;
/** Cell value for rows that stayed after a wrong answer. */
export const LOCKED = 8;

export class Board {
  cells: number[][];

  constructor() {
    this.cells = Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));
  }

  inside(x: number, y: number) {
    return x >= 0 && x < COLS && y < ROWS;
  }

  fits(cells: Cell[]) {
    return cells.every(([x, y]) => this.inside(x, y) && (y < 0 || this.cells[y][x] === EMPTY));
  }

  place(cells: Cell[], color: number) {
    for (const [x, y] of cells) if (y >= 0) this.cells[y][x] = color;
  }

  isLockedRow(y: number) {
    return this.cells[y].every((c) => c === LOCKED);
  }

  /** Full rows made of normal blocks; locked rows never count again. */
  fullRows(): number[] {
    const out: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      const row = this.cells[y];
      if (row.every((c) => c !== EMPTY) && !this.isLockedRow(y)) out.push(y);
    }
    return out;
  }

  lockedRows(): number[] {
    const out: number[] = [];
    for (let y = 0; y < ROWS; y++) if (this.isLockedRow(y)) out.push(y);
    return out;
  }

  removeRows(rows: number[]) {
    const drop = new Set(rows);
    const kept = this.cells.filter((_, y) => !drop.has(y));
    const fresh = Array.from({ length: rows.length }, () => new Array(COLS).fill(EMPTY));
    this.cells = [...fresh, ...kept];
  }

  lockRows(rows: number[]) {
    for (const y of rows) this.cells[y].fill(LOCKED);
  }
}
