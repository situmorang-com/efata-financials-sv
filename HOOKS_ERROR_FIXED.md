# ✅ HOOKS ERROR FIXED

## Issue
```
TypeError: options.hooks.handle is not a function
```

## What Was Wrong
The Auth.js v0.3 configuration was incorrect:
- Used wrong options (`secret`, `trustHost`)
- Incorrect session access pattern (tried to use `getSession()` which doesn't exist)

## What Was Fixed

### 1. Updated `src/hooks.server.ts`
- Removed invalid options (`secret`, `trustHost`)
- Kept only working callback options

### 2. Updated `src/app.d.ts`
- Removed `Locals.getSession` interface (doesn't exist in v0.3)
- Simplified to just `PageData.session`

### 3. Updated All Page Server Files
Changed from:
```typescript
const session = await event.locals.getSession();
```

To:
```typescript
const { locals } = event;
// or destructured: { locals, url }
if (!locals.session?.user) { ... }
```

Updated files:
- `src/routes/+layout.server.ts`
- `src/routes/+page.server.ts`
- `src/routes/batches/+page.server.ts`
- `src/routes/recipients/+page.server.ts`
- `src/routes/finance/+page.server.ts`

## ✅ Now Try Again

```bash
# Stop the current server (Ctrl+C if still running)
# Then restart:
npm run dev
```

Visit: **http://localhost:5177** (or whatever port Vite chose)

The SSO login should now work!

---

**Note**: The dev server is running on port 5177 because ports 5173-5176 are in use. You can kill those processes if you want to use the default port:

```bash
# Kill all node processes using those ports
lsof -ti:5173 | xargs kill -9
lsof -ti:5174 | xargs kill -9
lsof -ti:5175 | xargs kill -9
lsof -ti:5176 | xargs kill -9
```
