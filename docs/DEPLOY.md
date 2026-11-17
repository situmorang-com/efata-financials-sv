# Deploying EFATA Financials

Production: **https://efata.situmorang.com** on the self-hosted Coolify at
https://coolify.situmorang.com.

| | |
| --- | --- |
| Coolify app | `msgw0cg0skkggo0cscg44kw8` (Dockerfile build pack, port 3000) |
| Repo / branch | `situmorang-com/efata-financials-sv` (public) · `main` |
| Deploy | automatic on push to `main` |
| Health check | `GET /health` (Coolify runs it with busybox `wget` inside the container) |
| Storage | named volume `…-efata-db-data` (uuid `ait1bu8y4azbtfw15vlfv5e1`) mounted at `/app/data` — the SQLite database, transfer proofs, approval proofs and restore safety copies |
| Env keys | `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NODE_ENV`, `TZ`, `ORIGIN`, `BODY_SIZE_LIMIT` (values only in Coolify) |

## Why these settings

- **`ORIGIN=https://efata.situmorang.com`** — behind Traefik the app sees plain
  HTTP; without `ORIGIN` SvelteKit rejects every form POST as cross-site
  (giver PIN, giver submit, backup restore, giver link creation).
- **`BODY_SIZE_LIMIT=104857600`** — the database upload on `/finance/backup`
  is larger than adapter-node's 512 KB default.
- **Health check on `/health`** — so a broken image never replaces a working one.

## Access

Everything requires a Google account on the allowlist in
`src/hooks.server.ts` (plus `ALLOWED_EMAILS` env), enforced centrally in the
`requireSignIn` hook. Public on purpose:

- `/auth/*` — sign-in
- `/health`
- `/g/<token>` — giver confirmation pages, protected by their own random link
  and 6-digit PIN (5 wrong tries lock it for 15 minutes)
- `GET /api/batches/<id>/items/<item>/proof` — transfer proof images linked
  from the WhatsApp messages sent to recipients

## Data

The database lives only on the production volume. To move data in or out use
**Finance → Backup & Restore** (`/finance/backup`): download takes a consistent
snapshot; restore integrity-checks the upload, writes
`efata.db.bak-<time>-before-restore` next to the live file, then swaps the
content in through SQLite's online backup API. Restart the app afterwards
(`coolify.sh restart msgw0cg0skkggo0cscg44kw8`).

Church financial records and member data are **never committed** (the repo is
public): bank statements, `reports/`, `recipients.xlsx`, and the data scripts
that contain names and amounts are in `.gitignore`. `recipients.xlsx` was
committed before 11 Oct 2026 and is still in git history.

## Rollback

`coolify.sh rollback msgw0cg0skkggo0cscg44kw8` redeploys the previous image.
For data, download a safety copy from the list on `/finance/backup` and restore it
there.
