# TTetris – Tetris med frågesport

Tetris med en twist: varje gång du fyller en rad dyker en snabb fråga med två svarsalternativ upp.
**Rätt svar** → raden rensas. **Fel svar** (eller tiden tar slut) → raden blir *låst* och stannar kvar.
**3 rätt i rad** bränner bort den understa låsta raden.

Helt statisk sajt: ingen backend, inga cookies, inga externa requests. Driftskostnaden är 0 kr.

## Utveckling

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # spellogik + validering av frågor/översättningar
npm run build      # typkontroll + produktionsbygge till dist/
```

## Kontroller

| Tangent | Funktion |
|---|---|
| ← → | Flytta (DAS 167 ms / ARR 33 ms) |
| ↓ | Mjuk drop |
| Space | Hård drop |
| ↑ / X | Rotera medurs |
| Z / Ctrl | Rotera moturs |
| C / Shift | Håll bit |
| Esc / P | Paus |
| ← → eller 1 2 | Svara på fråga |
| M / S | Musik / ljudeffekter av/på |

Tangenterna kan bindas om under *Inställningar*.

## Delning och utmaningar

Efter game over skapar "Dela & utmana" en länk som `https://…/?seed=k3x9q2&score=12400&lang=sv`.
Seeden styr den 7-bag-randomiserade bitsekvensen, så mottagaren får **exakt samma bitar** och ser en banner med poängen att slå.
Frågorna slumpas däremot fritt.

## Lägga till ett språk

1. Kopiera `src/i18n/ui.en.json` till `src/i18n/ui.<kod>.json` och översätt värdena.
2. Skapa `public/questions/<kod>.json`:
   ```json
   { "version": 1, "lang": "de", "questions": [
     { "id": "geo-001", "cat": "geo", "q": "Hauptstadt von Australien?", "a": ["Canberra", "Sydney"] }
   ]}
   ```
   `a[0]` är **alltid rätt svar**. Ordningen slumpas när frågan visas.
   Frågor får vara högst 60 tecken och svar högst 24, eftersom man ska hinna läsa dem på ett par sekunder.
3. Lägg till språket i `LANGUAGES` i `src/i18n/index.ts`.
4. `npm test` kontrollerar att alla nycklar finns, att id:n är unika och att längderna håller.

Fler frågor i ett befintligt språk läggs bara till i JSON-filen. Spelet sparar vilka frågor du sett (per språk, i localStorage), så du får inga upprepningar förrän banken är slut.

## Deploy till Cloudflare Pages (gratis)

**Via GitHub (rekommenderas):**
1. Pusha repot till GitHub.
2. Gå till Cloudflare dashboard → *Workers & Pages* → *Create* → *Pages* → *Connect to Git* och välj repot.
3. Build command: `npm run build`. Build output directory: `dist`.
4. Under *Environment variables*: sätt `VITE_SITE_URL` till din publika URL med avslutande `/`, t.ex. `https://ttetris.pages.dev/`.
   Den används för `og:image`, som måste vara en absolut URL för att länkförhandsvisningar ska fungera.

Varje push till `main` deployas automatiskt, och andra brancher får egna preview-URL:er.

**Utan GitHub:**
```bash
npm run build
npx wrangler pages deploy dist --project-name ttetris
```

`public/_headers` ger hashade assets en cache-tid på ett år. `public/sw.js` gör att spelet fungerar offline och kan installeras som app (PWA).

## Arkitektur

```
src/core/      ren spellogik utan DOM (testas med Vitest)
  pieces.ts      SRS-rotation och wall kicks
  randomizer.ts  seedad 7-bag (mulberry32)
  board.ts       10×22-bräde, låsta rader
  game.ts        tillståndsmaskin: playing → quiz → resolving → playing / over
  quiz.ts        frågekortlek utan upprepningar
  scoring.ts     poäng, gravitation, tid per fråga
src/input/     tangentbord med egen DAS/ARR
src/render/    canvas: förrenderade block-sprites, partiklar, synthwave-bakgrund
src/audio/     Web Audio: syntade ljudeffekter och Korobeiniki (folkvisa, public domain)
src/ui/        inställningar och delning
src/i18n/      UI-texter per språk
public/questions/  frågebanker, laddas lazy per språk
```

Spellogiken skickar händelser (`clear`, `quiz`, `burn` …) som ljud, effekter och UI reagerar på.
Därför kan logiken testas helt utan webbläsare.
