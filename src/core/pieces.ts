export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export type Rotation = 0 | 1 | 2 | 3;

export const PIECE_TYPES: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

/** Colour index stored in board cells (1..7). */
export const PIECE_COLOR: Record<PieceType, number> = { I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 };

const SPAWN: Record<PieceType, string[]> = {
  I: ['....', '####', '....', '....'],
  J: ['#..', '###', '...'],
  L: ['..#', '###', '...'],
  O: ['##', '##'],
  S: ['.##', '##.', '...'],
  T: ['.#.', '###', '...'],
  Z: ['##.', '.##', '...'],
};

export type Cell = readonly [x: number, y: number];

function rotateCW(m: string[]): string[] {
  const n = m.length;
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => m[n - 1 - x][y]).join(''),
  );
}

function cellsOf(m: string[]): Cell[] {
  const out: Cell[] = [];
  m.forEach((row, y) => [...row].forEach((c, x) => c === '#' && out.push([x, y])));
  return out;
}

/** SHAPES[type][rotation] -> cell offsets within the bounding box. */
export const SHAPES: Record<PieceType, Cell[][]> = Object.fromEntries(
  PIECE_TYPES.map((t) => {
    const states: string[][] = [SPAWN[t]];
    for (let r = 1; r < 4; r++) states.push(rotateCW(states[r - 1]));
    return [t, states.map(cellsOf)];
  }),
) as Record<PieceType, Cell[][]>;

// SRS kick tables, written in the standard y-up notation and flipped to y-down below.
const JLSTZ_KICKS: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

export function kicks(type: PieceType, from: Rotation, to: Rotation): Cell[] {
  if (type === 'O') return [[0, 0]];
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}>${to}`].map(([x, y]) => [x, 0 - y] as const);
}

export interface Piece {
  type: PieceType;
  rot: Rotation;
  x: number;
  y: number;
}

export function pieceCells(p: Piece): Cell[] {
  return SHAPES[p.type][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy] as const);
}

export function spawnPiece(type: PieceType): Piece {
  return { type, rot: 0, x: type === 'O' ? 4 : 3, y: type === 'I' ? 0 : 1 };
}
