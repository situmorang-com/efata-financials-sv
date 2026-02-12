# EFATA Transfer Checklist

A simple internal app to manage monthly EFATA transfer batches: track attendance, calculate amounts for transport/zoom, mark transfers, notify via WhatsApp, and export batch reports as PDF.

## Features
- Batch management with monthly configuration (transport + zoom rates)
- Per-recipient attendance, zoom type, and amount calculation
- Transfer proof upload, transfer/notification tracking
- Auto-complete batches when all transfers and notifications are done
- PDF export for completed batches

## Tech Stack
- SvelteKit + Svelte 5
- Tailwind CSS
- SQLite (better-sqlite3)

## Setup

```bash
npm install
```

## Development

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

## Build

```bash
npm run build
```

## Notes
- PDF export is available once a batch is completed.
- If a recipient has no WhatsApp, notification status is auto-skipped.

