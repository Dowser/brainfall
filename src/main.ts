import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import './style.css';

import { AudioEngine } from './audio/audio';
import { HIDDEN_ROWS } from './core/board';
import { Game, type GameEvent } from './core/game';
import { QuestionDeck, type AskedQuestion, type Question, type QuestionBank } from './core/quiz';
import { randomSeed, seedFromString } from './core/randomizer';
import { detectLanguage, formatNumber, lang, LANGUAGES, setLanguage, t, translateDom } from './i18n';
import { Controls } from './input/keyboard';
import { Background } from './render/background';
import { Effects } from './render/effects';
import { Renderer } from './render/renderer';
import { addHighScore, DEFAULT_KEYS, loadHighScores, loadSeen, loadSettings, saveSeen, saveSettings } from './storage';
import { renderKeymap } from './ui/settings';
import { readChallenge, shareScore, type Challenge } from './ui/share';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ── state ──────────────────────────────────────────────────

const settings = loadSettings();
const audio = new AudioEngine();
const fx = new Effects();
const bg = new Background($<HTMLCanvasElement>('bg'));
const renderer = new Renderer($<HTMLCanvasElement>('board'), $<HTMLCanvasElement>('hold'), $<HTMLCanvasElement>('next'));
const controls = new Controls(() => settings.keys, {
  pause: () => togglePause(),
  toggleMusic: () => setMusic(!settings.music),
  toggleSfx: () => setSfx(!settings.sfx),
  blocked: () => !$('scores').hidden || !$('settings').hidden,
});

let game: Game | null = null;
let deck: QuestionDeck | null = null;
let seed = '';
const challenge: Challenge | null = readChallenge();
const banks = new Map<string, Question[]>();
let lastTick = 0;

audio.musicOn = settings.music;
audio.sfxOn = settings.sfx;
audio.musicVolume = settings.musicVolume;
audio.sfxVolume = settings.sfxVolume;

// ── questions ──────────────────────────────────────────────

async function loadBank(code: string): Promise<Question[]> {
  const cached = banks.get(code);
  if (cached) return cached;
  try {
    const res = await fetch(`questions/${code}.json`);
    const data = (await res.json()) as QuestionBank;
    banks.set(code, data.questions);
    return data.questions;
  } catch {
    return []; // offline without cache → no questions, plain stacking
  }
}

function persistSeen() {
  if (deck) saveSeen(lang(), deck.seenIds);
}

// ── screens ────────────────────────────────────────────────

const screens = ['menu', 'pause', 'over', 'scores', 'settings'] as const;
type Screen = (typeof screens)[number];

function show(screen: Screen | null) {
  for (const s of screens) $(s).hidden = s !== screen;
  $('game').hidden = !game || screen === 'menu';
  // A focused button would swallow Space/arrows during play.
  if (!screen) (document.activeElement as HTMLElement | null)?.blur();
  const first = screen && ($(screen).querySelector<HTMLButtonElement>('.btn.primary') ?? $(screen).querySelector<HTMLButtonElement>('.btn'));
  first?.focus({ preventScroll: true });
}

let modalReturn: Screen | null = 'menu';
function openModal(screen: 'scores' | 'settings') {
  modalReturn = ($('menu').hidden ? ($('pause').hidden ? null : 'pause') : 'menu');
  show(screen);
}

function renderLangs() {
  const el = $('langs');
  el.replaceChildren(
    ...LANGUAGES.map((l) => {
      const b = document.createElement('button');
      b.textContent = l.name;
      b.className = l.code === lang() ? 'active' : '';
      b.addEventListener('click', () => changeLanguage(l.code));
      return b;
    }),
  );
}

function changeLanguage(code: string) {
  persistSeen();
  setLanguage(code);
  settings.lang = code;
  saveSettings(settings);
  translateDom();
  renderLangs();
  renderChallenge();
  void loadBank(code);
}

function renderChallenge() {
  const el = $('challenge');
  el.hidden = !challenge?.score;
  if (challenge?.score) el.textContent = t('challenge', { score: formatNumber(challenge.score) });
}

function renderScores() {
  const list = loadHighScores();
  const el = $('score-list');
  if (!list.length) {
    const li = document.createElement('li');
    li.style.gridTemplateColumns = '1fr';
    li.textContent = t('noScores');
    el.replaceChildren(li);
    return;
  }
  el.replaceChildren(
    ...list.map((s) => {
      const li = document.createElement('li');
      const date = new Date(s.date).toLocaleDateString(lang());
      const score = document.createElement('b');
      score.textContent = formatNumber(s.score);
      const meta = document.createElement('small');
      meta.textContent = `${t('level')} ${s.level} · ${date}`;
      li.append(score, meta);
      return li;
    }),
  );
}

function renderSettings() {
  $<HTMLInputElement>('set-music').checked = settings.music;
  $<HTMLInputElement>('set-sfx').checked = settings.sfx;
  $<HTMLInputElement>('vol-music').value = String(settings.musicVolume);
  $<HTMLInputElement>('vol-sfx').value = String(settings.sfxVolume);
  renderKeymap($('keymap'), settings, () => saveSettings(settings));
}

// ── audio toggles ──────────────────────────────────────────

function setMusic(on: boolean) {
  settings.music = audio.musicOn = on;
  saveSettings(settings);
  audio.applyVolumes();
  if (on && game && game.phase !== 'over') audio.startMusic();
  if (!on) audio.stopMusic();
  syncChips();
}

function setSfx(on: boolean) {
  settings.sfx = audio.sfxOn = on;
  saveSettings(settings);
  audio.applyVolumes();
  syncChips();
}

function syncChips() {
  $('chip-music').classList.toggle('off', !settings.music);
  $('chip-sfx').classList.toggle('off', !settings.sfx);
  $<HTMLInputElement>('set-music').checked = settings.music;
  $<HTMLInputElement>('set-sfx').checked = settings.sfx;
}

// ── game lifecycle ─────────────────────────────────────────

async function startGame(useChallenge = true) {
  audio.unlock();
  persistSeen();
  const bank = await loadBank(lang());
  deck = new QuestionDeck(bank, loadSeen(lang()));
  seed = useChallenge && challenge ? challenge.seed : randomSeed();
  const d = deck;
  game = new Game({ seed: seedFromString(seed), nextQuestion: () => d.next() });
  controls.game = game;
  controls.releaseAll();
  fx.particles = [];
  fx.texts = [];
  bg.setLevel(1);
  audio.setLevel(1);
  audio.duck(false);
  hideQuiz();
  const hud = $('challenge-hud');
  hud.hidden = !(useChallenge && challenge?.score);
  if (challenge?.score) hud.textContent = `🎯 ${formatNumber(challenge.score)}`;
  $('hud-best').textContent = formatNumber(loadHighScores()[0]?.score ?? 0);
  show(null);
  audio.stopMusic();
  if (settings.music) audio.startMusic();
}

function togglePause() {
  if (!game || game.phase === 'over') return;
  game.togglePause();
  controls.releaseAll();
  if (game.phase === 'paused') {
    audio.stopMusic();
    show('pause');
  } else {
    if (settings.music) audio.startMusic();
    show(null);
  }
}

function quitToMenu() {
  persistSeen();
  audio.stopMusic();
  game = null;
  controls.game = null;
  renderChallenge();
  show('menu');
}

function endGame(g: Game) {
  audio.stopMusic();
  persistSeen();
  const best = loadHighScores()[0]?.score ?? 0;
  const rank = g.score > 0 ? addHighScore({ score: g.score, lines: g.lines, level: g.level, date: new Date().toISOString(), seed }) : -1;
  $('over-score').textContent = formatNumber(g.score);
  $('over-best').hidden = !(rank === 0 && g.score > best);

  const oc = $('over-challenge');
  const target = challenge?.seed === seed ? challenge.score : null;
  oc.hidden = !target;
  if (target) {
    const diff = g.score - target;
    oc.textContent = diff > 0 ? t('challengeWon', { diff: formatNumber(diff) }) : t('challengeLost', { diff: formatNumber(-diff) });
  }

  const stats: [string, number][] = [
    [t('lines'), g.lines],
    [t('level'), g.level],
    [t('correctAnswers'), g.correctAnswers],
    [t('wrongAnswers'), g.wrongAnswers],
    [t('burned'), g.burned],
    [t('maxStreak'), g.maxStreak],
  ];
  $('over-stats').replaceChildren(
    ...stats.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = formatNumber(v);
      return [dt, dd];
    }),
  );
  // Small delay so the final lock is visible before the modal appears.
  setTimeout(() => show('over'), 700);
}

// ── quiz overlay ───────────────────────────────────────────

const quizEl = $('quiz');
const optButtons = [...quizEl.querySelectorAll<HTMLButtonElement>('.opt')];

function showQuiz(asked: AskedQuestion, total: number) {
  $('quiz-q').textContent = asked.question.q;
  optButtons.forEach((b, i) => {
    b.className = 'opt';
    b.querySelector('span')!.textContent = asked.question.a[asked.options[i]];
  });
  quizEl.hidden = false;
  lastTick = total;
}

function hideQuiz() {
  quizEl.hidden = true;
}

function showAnswer(e: Extract<GameEvent, { type: 'answer' }>) {
  const { correct, timeout, asked, choice } = e;
  optButtons.forEach((b, i) => {
    const isRight = asked.options[i] === 0;
    if (isRight) b.classList.add('right');
    if (i === choice) b.classList.add('picked', ...(correct ? [] : ['wrong']));
  });
  const rows = e.rows.length;
  if (correct) fx.text(t('correct'), '#3dff9a', 1.3, 10);
  else {
    fx.text(timeout ? t('timeout') : t('wrong'), '#ff4466', 1.3, 10);
    fx.text(rows > 1 ? t('rowsStay') : t('rowStays'), '#ff9aa8', 0.6, 11.6);
  }
}

optButtons.forEach((b) =>
  b.addEventListener('click', () => {
    if (game?.phase === 'quiz') game.answer(Number(b.dataset.i));
  }),
);

// ── events → audio/fx ──────────────────────────────────────

function handleEvent(g: Game, e: GameEvent, now: number) {
  switch (e.type) {
    case 'move':
    case 'rotate':
    case 'hold':
    case 'land':
      audio.play(e.type);
      break;
    case 'lock':
      audio.play('lock');
      break;
    case 'harddrop':
      audio.play('harddrop');
      fx.shake(Math.min(10, 3 + e.distance * 0.4));
      fx.dropTrail(e.cells, e.color, HIDDEN_ROWS, e.distance);
      break;
    case 'quiz':
      audio.play('quiz');
      audio.duck(true);
      controls.onQuizShown();
      showQuiz(e.asked, e.total);
      break;
    case 'answer':
      audio.play(e.correct ? 'correct' : 'wrong');
      renderer.markResolve(now);
      showAnswer(e);
      if (!e.correct) fx.shake(6, 220);
      break;
    case 'clear':
      fx.rowBurst(e.rows, e.cells, HIDDEN_ROWS);
      if (e.rows.length >= 4) {
        audio.play('quad');
        fx.text(t('quad'), '#ffe14d', 1.6, 9);
        fx.shake(12, 260);
      } else audio.play('clear');
      break;
    case 'burn':
      audio.play('burn');
      fx.burnRow(e.row - HIDDEN_ROWS);
      fx.text(t('burn'), '#ff9a1f', 1.4, 11);
      break;
    case 'levelup':
      audio.play('levelup');
      audio.setLevel(e.level);
      bg.setLevel(e.level);
      fx.text(t('levelUp', { level: e.level }), '#22e5ff', 1.1, 12.5);
      break;
    case 'gameover':
      audio.play('gameover');
      hideQuiz();
      endGame(g);
      break;
  }
}

// ── HUD ────────────────────────────────────────────────────

const hud = {
  score: $('hud-score'),
  level: $('hud-level'),
  lines: $('hud-lines'),
  pips: [...$('hud-streak').children] as HTMLElement[],
  timer: $('quiz-timer'),
};
let shown = { score: -1, level: -1, lines: -1, streak: -1 };

function updateHud(g: Game) {
  if (g.score !== shown.score) hud.score.textContent = formatNumber(g.score);
  if (g.level !== shown.level) hud.level.textContent = String(g.level);
  if (g.lines !== shown.lines) hud.lines.textContent = String(g.lines);
  if (g.streak !== shown.streak) hud.pips.forEach((p, i) => p.classList.toggle('on', i < g.streak));
  shown = { score: g.score, level: g.level, lines: g.lines, streak: g.streak };

  if (g.quiz) {
    const k = g.quiz.timeLeft / g.quiz.total;
    hud.timer.style.transform = `scaleX(${k})`;
    hud.timer.style.background = `hsl(${Math.round(k * 130)}, 95%, 55%)`;
    if (g.phase === 'quiz' && g.quiz.timeLeft < 2000 && lastTick - g.quiz.timeLeft >= 500) {
      lastTick = g.quiz.timeLeft;
      audio.play('tick');
    }
  }
  if (!quizEl.hidden && g.phase !== 'quiz' && g.phase !== 'resolving' && g.phase !== 'paused') {
    hideQuiz();
    audio.duck(false);
  }
}

// ── main loop ──────────────────────────────────────────────

let prev = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, now - prev);
  prev = now;
  bg.draw(dt, now);
  const g = game;
  if (g) {
    controls.update(dt);
    g.update(dt);
    for (const e of g.events.splice(0)) {
      // One bad event handler must never kill the render loop.
      try {
        handleEvent(g, e, now);
      } catch (err) {
        console.error(err);
      }
    }
    fx.update(dt);
    renderer.draw(g, fx, now);
    updateHud(g);
  }
}

// ── wiring ─────────────────────────────────────────────────

function init() {
  const initialLang = challenge?.lang && LANGUAGES.some((l) => l.code === challenge!.lang) ? challenge.lang : detectLanguage(settings.lang);
  setLanguage(initialLang);
  translateDom();
  renderLangs();
  renderChallenge();
  syncChips();
  void loadBank(lang());

  $('btn-play').addEventListener('click', () => void startGame());
  $('btn-scores').addEventListener('click', () => {
    renderScores();
    openModal('scores');
  });
  $('btn-settings').addEventListener('click', () => {
    renderSettings();
    openModal('settings');
  });
  $('chip-music').addEventListener('click', (e) => {
    setMusic(!settings.music);
    (e.currentTarget as HTMLElement).blur();
  });
  $('chip-sfx').addEventListener('click', (e) => {
    setSfx(!settings.sfx);
    (e.currentTarget as HTMLElement).blur();
  });
  $<HTMLInputElement>('set-music').addEventListener('change', (e) => setMusic((e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('set-sfx').addEventListener('change', (e) => setSfx((e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('vol-music').addEventListener('input', (e) => {
    settings.musicVolume = audio.musicVolume = Number((e.target as HTMLInputElement).value);
    audio.applyVolumes();
    saveSettings(settings);
  });
  $<HTMLInputElement>('vol-sfx').addEventListener('input', (e) => {
    settings.sfxVolume = audio.sfxVolume = Number((e.target as HTMLInputElement).value);
    audio.applyVolumes();
    audio.play('select');
    saveSettings(settings);
  });

  document.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    audio.unlock();
    switch (act) {
      case 'resume':
        togglePause();
        break;
      case 'restart':
      case 'again':
        void startGame(act === 'again' ? challenge?.seed === seed : true);
        break;
      case 'quit':
        quitToMenu();
        break;
      case 'share':
        if (game) void shareScore(seed, game.score);
        break;
      case 'close':
        show(modalReturn);
        break;
      case 'reset-keys':
        settings.keys = structuredClone(DEFAULT_KEYS);
        saveSettings(settings);
        renderSettings();
        break;
    }
  });

  // Menu/modal keyboard shortcuts (in-game keys are handled by Controls).
  window.addEventListener('keydown', (e) => {
    audio.unlock();
    if (e.repeat) return;
    if (!$('menu').hidden && e.code === 'Enter') {
      e.preventDefault();
      void startGame();
    } else if (!$('over').hidden && e.code === 'Enter') {
      e.preventDefault();
      void startGame(challenge?.seed === seed);
    } else if (e.code === 'Escape' && (!$('scores').hidden || !$('settings').hidden)) {
      show(modalReturn);
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  window.addEventListener('resize', () => {
    renderer.resize();
    bg.resize();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game && game.phase !== 'paused' && game.phase !== 'over') togglePause();
  });
  window.addEventListener('pagehide', persistSeen);

  show('menu');
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) Object.assign(window, { __game: () => game });

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('sw.js');
  }
}

init();
