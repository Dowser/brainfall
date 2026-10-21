// Validates question banks and UI string files. Run: npm run validate (also part of npm test).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const MAX_Q = 60;
const MAX_A = 24;

export function validate() {
  const errors = [];
  const qDir = `${root}public/questions/`;
  const uiDir = `${root}src/i18n/`;
  const uiFiles = readdirSync(uiDir).filter((f) => /^ui\.\w+\.json$/.test(f));
  const langs = uiFiles.map((f) => f.split('.')[1]);
  const reference = Object.keys(JSON.parse(readFileSync(`${uiDir}ui.en.json`, 'utf8'))).sort();

  for (const lang of langs) {
    const keys = Object.keys(JSON.parse(readFileSync(`${uiDir}ui.${lang}.json`, 'utf8'))).sort();
    const missing = reference.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !reference.includes(k));
    if (missing.length) errors.push(`ui.${lang}.json missing keys: ${missing.join(', ')}`);
    if (extra.length) errors.push(`ui.${lang}.json unknown keys: ${extra.join(', ')}`);

    let bank;
    try {
      bank = JSON.parse(readFileSync(`${qDir}${lang}.json`, 'utf8'));
    } catch (e) {
      errors.push(`questions/${lang}.json: ${e.message}`);
      continue;
    }
    if (bank.lang !== lang) errors.push(`questions/${lang}.json: lang is "${bank.lang}"`);
    const ids = new Set();
    for (const q of bank.questions ?? []) {
      const where = `questions/${lang}.json ${q.id}`;
      if (!q.id || ids.has(q.id)) errors.push(`${where}: missing or duplicate id`);
      ids.add(q.id);
      if (typeof q.q !== 'string' || !q.q.trim()) errors.push(`${where}: empty question`);
      else if (q.q.length > MAX_Q) errors.push(`${where}: question longer than ${MAX_Q}`);
      if (!Array.isArray(q.a) || q.a.length !== 2) errors.push(`${where}: needs exactly 2 answers`);
      else {
        if (q.a.some((a) => typeof a !== 'string' || !a.trim() || a.length > MAX_A)) errors.push(`${where}: answers must be 1-${MAX_A} chars`);
        if (q.a[0].trim().toLowerCase() === q.a[1].trim().toLowerCase()) errors.push(`${where}: answers are identical`);
      }
    }
    if ((bank.questions ?? []).length < 20) errors.push(`questions/${lang}.json: fewer than 20 questions`);
  }
  return { errors, langs };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { errors, langs } = validate();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(`OK: ${langs.join(', ')}`);
}
