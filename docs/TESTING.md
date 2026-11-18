# Testing EFATA Financials locally

| Command | What it proves |
| --- | --- |
| `npm run check` | types (svelte-check); must stay at 0 errors |
| `npm test` | vitest: membership dates, transfer fees, batch sync on a throwaway database |
| `npm run check:sensitive` | no phone or account numbers or data files in tracked files (also the pre-commit hook) |
| `npm run build` | the production build |

CI (`.github/workflows/ci.yml`) runs all four on every push to `main`. Coolify deploys the same
push in parallel, so a red CI run means production may already have the change.

## Running the app against a copy of the data

`npm run dev:copy -- --port 3001` (or the `dev-copy` launch config) snapshots `data/efata.db`
into `.data-copy/` and runs the dev server with `DATA_DIR=.data-copy`. Every run starts from a
fresh copy; `--keep` reuses the last one. The real database is never opened for writing.

Every page and `/api` route needs a session. Sign in with Google, or for scripted checks mint
one from the local `AUTH_SECRET`:

```bash
T=$(npm run -s dev:session)
curl -H "Cookie: authjs.session-token=$T" -H "Origin: http://localhost:3001" localhost:3001/api/recipients
```

In a browser, set the same cookie on `http://localhost:3001` (path `/`). The script refuses to
run when `NODE_ENV` or `ORIGIN` look like production.

## Tests that need the database

Set `DATA_DIR` to a temp directory before importing `$lib/server/db` (see
`src/lib/server/membership-sync.test.ts`); the module creates and migrates a fresh database
there.
