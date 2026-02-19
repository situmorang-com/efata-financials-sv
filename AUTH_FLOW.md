# Authentication Flow Diagram

## User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Visits Application                       │
│                    http://localhost:5173                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
                  ┌────────────────┐
                  │ Authenticated? │
                  └────────┬───────┘
                           │
                ┌──────────┴──────────┐
                │                     │
               NO                    YES
                │                     │
                ▼                     ▼
      ┌─────────────────┐    ┌──────────────┐
      │ Redirect to     │    │ Show App     │
      │ /auth/signin    │    │ with User    │
      └────────┬────────┘    │ Navigation   │
               │              └──────────────┘
               ▼
      ┌─────────────────┐
      │ Sign In Page    │
      │ [Google Button] │
      └────────┬────────┘
               │
               │ User clicks "Sign in with Google"
               ▼
      ┌─────────────────┐
      │ Google OAuth    │
      │ Consent Screen  │
      └────────┬────────┘
               │
               │ User grants permission
               ▼
      ┌─────────────────┐
      │ Callback to     │
      │ /auth/callback  │
      └────────┬────────┘
               │
               ▼
      ┌─────────────────┐
      │ Check Email     │
      │ in Whitelist?   │
      └────────┬────────┘
               │
        ┌──────┴──────┐
        │             │
       NO            YES
        │             │
        ▼             ▼
┌──────────────┐  ┌──────────────┐
│ /auth/error  │  │ Create       │
│ Access       │  │ Session      │
│ Denied       │  └──────┬───────┘
└──────────────┘         │
                         ▼
                  ┌──────────────┐
                  │ Redirect to  │
                  │ /finance     │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ Application  │
                  │ Dashboard    │
                  └──────────────┘
```

## Email Whitelist Check

```
┌─────────────────────────────────────┐
│     User attempts to sign in        │
└──────────────┬──────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Google returns user email           │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Check if email in ALLOWED_EMAILS:   │
│  - edmundsitumorang@gmail.com        │
│  - situmeangirhen@gmail.com          │
└──────────────┬───────────────────────┘
               │
        ┌──────┴───────┐
        │              │
     MATCH          NO MATCH
        │              │
        ▼              ▼
  ┌──────────┐   ┌──────────┐
  │  ALLOW   │   │  BLOCK   │
  │  ACCESS  │   │  ACCESS  │
  └──────────┘   └──────────┘
        │              │
        ▼              ▼
  ┌──────────┐   ┌──────────┐
  │ Create   │   │ Redirect │
  │ Session  │   │ to Error │
  └──────────┘   └──────────┘
```

## Protected Route Flow

```
User visits: /finance, /batches, /recipients, etc.
                     │
                     ▼
         ┌───────────────────┐
         │ +page.server.ts   │
         │ Load Function     │
         └─────────┬─────────┘
                   │
                   ▼
         ┌───────────────────┐
         │ Check Session     │
         │ await auth()      │
         └─────────┬─────────┘
                   │
            ┌──────┴──────┐
            │             │
         EXISTS        NULL
            │             │
            ▼             ▼
     ┌──────────┐   ┌──────────────┐
     │ Load     │   │ Redirect to  │
     │ Page     │   │ /auth/signin │
     │ Data     │   │ + callback   │
     └──────────┘   └──────────────┘
```

## Sign Out Flow

```
┌─────────────────────────────────────┐
│  User clicks Sign Out button        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  signOut({ callbackUrl: '/auth/... })│
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Destroy session                    │
│  Clear cookies                      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Redirect to /auth/signin           │
└─────────────────────────────────────┘
```

## Key Components

### Backend (Server-Side)

**`src/hooks.server.ts`**
- Configures Auth.js
- Defines Google provider
- Implements email whitelist
- Manages session callbacks

**Route Protection**
```typescript
// In +page.server.ts files
export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user) {
    throw redirect(303, '/auth/signin');
  }
  return {};
};
```

### Frontend (Client-Side)

**`src/routes/+layout.svelte`**
- Displays user email
- Shows sign-out button
- Manages navigation

**`src/routes/auth/signin/+page.svelte`**
- Google sign-in button
- Error message display

**`src/routes/auth/error/+page.svelte`**
- Access denied message
- List of authorized emails

## Environment Variables

```
AUTH_SECRET          → Session encryption key
GOOGLE_CLIENT_ID     → OAuth client identifier
GOOGLE_CLIENT_SECRET → OAuth client secret
```

## Security Layers

```
Layer 1: Session Check
   ↓
Layer 2: Email Whitelist
   ↓
Layer 3: Route Protection
   ↓
Layer 4: Secure Cookies
```

## Callback URLs

**Development:**
```
http://localhost:5173/auth/callback/google
```

**Production:**
```
https://yourdomain.com/auth/callback/google
```

Must be configured in Google Cloud Console!
