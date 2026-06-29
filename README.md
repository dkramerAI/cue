# Cue

**The fastest way to create Apple Calendar events.**

Cue turns a message, email, or screenshot into a polished calendar event and exports a standard `.ics` file you can open in Apple Calendar, Google Calendar, or Outlook. Type the details by hand, paste some text, or drop in an image — Cue fills in the rest.

![Built with Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

## Features

- **Start with anything** — paste text or attach screenshots and let AI extract the event (title, time, location, recurrence, alerts) with per-field confidence scores.
- **Manual builder** — a clean, accessible form for everything: title, notes, location, link, organizer, and private notes.
- **Real time zones** — every export includes a generated `VTIMEZONE`, so events land at the right time in strict clients (Outlook included), not just Apple Calendar. Floating and UTC times are handled correctly too.
- **Recurrence** — daily/weekly/monthly/yearly, nth-weekday, day-of-month, end-after-count or end-on-date, plus skip dates.
- **Alerts** — one or more reminders per event, with sensible presets.
- **Multiple events** — build a batch and export them in a single file.
- **Templates** — save an event’s title, location, time zone, and alerts to reuse later.
- **Import `.ics`** — load an existing calendar file to edit or extend it.
- **Light / dark / auto** appearance, with no flash on load.
- **Private by design** — events are built in your browser; only AI extraction (if used) sends content to the API.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

AI extraction is **optional**. Without a key, the manual builder, import, templates, and export all work — the AI button just shows a friendly notice.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Optional | Enables “Start with anything” AI extraction. |
| `NEXT_PUBLIC_SITE_URL` | Optional | Canonical URL used for metadata (defaults to `https://cue.app`). |

Copy the example file and add your key:

```bash
cp .env.example .env.local
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run build` | Production build. |
| `npm start` | Run the production build. |
| `npm run lint` | Lint with ESLint. |
| `npm test` | Run the unit tests (Vitest). |

## Tech stack

Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind CSS · Framer Motion · Sonner · OpenAI.

## Project structure

```
src/
  app/                 Routes, layout, metadata, icons
    api/
      extract-event/   AI extraction endpoint (OpenAI)
      generate-ics/    Validates and returns the .ics file
  components/
    EventBuilder.tsx   Main UI
    ui/                Accessible primitives (Dialog, Switch, Segmented)
  hooks/               useAppearance (light/dark/auto)
  lib/
    ics.ts             RFC 5545 .ics generation
    vtimezone.ts       VTIMEZONE generation from the Intl engine
    ics-import.ts      .ics parsing
    time.ts            Time-zone-aware date math
    event-format.ts    Human-readable summaries
    brand.ts           Single source of product naming
  types/event.ts       Shared event types
```

## Deploy

Deploy to [Vercel](https://vercel.com/) (or any Node host):

1. Import the repo.
2. Add `OPENAI_API_KEY` (optional) in project settings.
3. Deploy — no extra configuration needed.

## License

MIT
