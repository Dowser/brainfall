import en from './ui.en.json';
import sv from './ui.sv.json';

export type UiKey = keyof typeof en;
type Strings = Record<UiKey, string>;

/**
 * Language registry. To add a language:
 *   1. add src/i18n/ui.<code>.json (same keys as ui.en.json)
 *   2. add public/questions/<code>.json
 *   3. add an entry here
 */
export const LANGUAGES: { code: string; name: string; strings: Strings }[] = [
  { code: 'sv', name: 'Svenska', strings: sv },
  { code: 'en', name: 'English', strings: en },
];

let current = LANGUAGES[0];

export function detectLanguage(saved?: string | null): string {
  const wanted = [saved, ...navigator.languages.map((l) => l.slice(0, 2).toLowerCase())];
  return wanted.find((c) => c && LANGUAGES.some((l) => l.code === c)) ?? 'en';
}

export function setLanguage(code: string) {
  current = LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
  document.documentElement.lang = current.code;
}

export function lang() {
  return current.code;
}

export function t(key: UiKey, vars: Record<string, string | number> = {}): string {
  const s = current.strings[key] ?? en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function formatNumber(n: number) {
  return n.toLocaleString(current.code === 'sv' ? 'sv-SE' : current.code);
}

/** Fill every element carrying data-i18n with its translation. */
export function translateDom(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as UiKey);
  });
}
