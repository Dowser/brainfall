export type Action = 'left' | 'right' | 'soft' | 'hard' | 'cw' | 'ccw' | 'hold' | 'pause';

export const DEFAULT_KEYS: Record<Action, string[]> = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  soft: ['ArrowDown'],
  hard: ['Space'],
  cw: ['ArrowUp', 'KeyX'],
  ccw: ['KeyZ', 'ControlLeft'],
  hold: ['KeyC', 'ShiftLeft'],
  pause: ['Escape', 'KeyP'],
};

export interface Settings {
  lang: string | null;
  music: boolean;
  sfx: boolean;
  musicVolume: number;
  sfxVolume: number;
  keys: Record<Action, string[]>;
}

export interface HighScore {
  score: number;
  lines: number;
  level: number;
  date: string;
  seed: string;
}

const PREFIX = 'brainfall.';

// Storage can throw (private mode, blocked site data) – the game must work without it.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFIX + key) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadSettings(): Settings {
  const s = read<Settings>('settings', {
    lang: null,
    music: true,
    sfx: true,
    musicVolume: 0.5,
    sfxVolume: 0.7,
    keys: DEFAULT_KEYS,
  });
  s.keys = { ...DEFAULT_KEYS, ...s.keys };
  return s;
}

export function saveSettings(s: Settings) {
  write('settings', s);
}

export function loadHighScores(): HighScore[] {
  return readArray<HighScore>('highscores');
}

/** Insert a score; returns its rank (0-based) or -1 if it didn't make the top 10. */
export function addHighScore(entry: HighScore): number {
  const list = [...loadHighScores(), entry].sort((a, b) => b.score - a.score).slice(0, 10);
  write('highscores', list);
  return list.indexOf(entry);
}

export function loadSeen(lang: string): Set<string> {
  return new Set(readArray<string>(`seen.${lang}`));
}

export function saveSeen(lang: string, ids: string[]) {
  write(`seen.${lang}`, ids);
}
