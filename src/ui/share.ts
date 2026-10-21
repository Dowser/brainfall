import { formatNumber, lang, t } from '../i18n';

export interface Challenge {
  seed: string;
  score: number | null;
  lang: string | null;
}

const SEED_RE = /^[a-z0-9]{1,12}$/;

/** Reads ?seed=…&score=…&lang=… from the URL. */
export function readChallenge(): Challenge | null {
  const p = new URLSearchParams(location.search);
  const seed = p.get('seed')?.toLowerCase();
  if (!seed || !SEED_RE.test(seed)) return null;
  const score = Number(p.get('score'));
  return {
    seed,
    score: Number.isFinite(score) && score > 0 ? Math.floor(score) : null,
    lang: p.get('lang'),
  };
}

export function challengeUrl(seed: string, score: number) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('seed', seed);
  url.searchParams.set('score', String(score));
  url.searchParams.set('lang', lang());
  return url.toString();
}

let toastTimer = 0;
export function toast(msg: string) {
  const el = document.getElementById('toast')!;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

export async function shareScore(seed: string, score: number) {
  const url = challengeUrl(seed, score);
  const text = t('shareText', { score: formatNumber(score) });
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Brainfall', text, url });
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast(t('copied'));
  } catch {
    prompt('', url);
  }
}
