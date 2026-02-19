# EFATA Transfer Checklist

A simple internal app to manage monthly EFATA transfer batches: track attendance, calculate amounts for transport/zoom, mark transfers, notify via WhatsApp, and export batch reports as PDF.

## 🔐 Authentication

This application uses **Google SSO** with email whitelist. Only authorized users can access the system:
- `edmundsitumorang@gmail.com`
- `situmeangirhen@gmail.com`

## Features
- 🔒 Google SSO authentication with email whitelist
- 📦 Batch management with monthly configuration (transport + zoom rates)
- 📊 Per-recipient attendance, zoom type, and amount calculation
- 📸 Transfer proof upload, transfer/notification tracking
- ✅ Auto-complete batches when all transfers and notifications are done
- 📄 PDF export for completed batches
- 💰 Finance tracking (expenses, income, reports)

## Tech Stack
- SvelteKit + Svelte 5
- Tailwind CSS
- SQLite (better-sqlite3)
- Auth.js (Google OAuth)

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Google OAuth

**See [QUICKSTART.md](QUICKSTART.md) for detailed 5-minute setup guide.**

Quick steps:
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID
3. Add redirect URI: `http://localhost:5173/auth/callback/google`
4. Copy Client ID and Secret to `.env`

### 3. Configure Environment

Update `.env` with your Google OAuth credentials:
```env
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
AUTH_SECRET=your-secret-key
```

Generate a secure secret:
```bash
npm run generate-secret
```

### 4. Run Development Server

```bash
npm run dev
```

Visit http://localhost:5173 and sign in with an authorized Google account.

## 📚 Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Get running in 5 minutes
- **[AUTH_SETUP.md](AUTH_SETUP.md)** - Complete authentication setup guide
- **[COOLIFY_DEPLOYMENT.md](COOLIFY_DEPLOYMENT.md)** - Deploy to Coolify
- **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checklist
- **[SSO_IMPLEMENTATION.md](SSO_IMPLEMENTATION.md)** - What was implemented

## 🏗️ Build for Production

```bash
npm run build
```

## 🐳 Docker Deployment

### Local Testing
```bash
docker-compose up
```

### Deploy to Coolify
See [COOLIFY_DEPLOYMENT.md](COOLIFY_DEPLOYMENT.md) for complete instructions.

**Quick setup:**
1. Set environment variables in Coolify (including Google OAuth)
2. Configure persistent storage for database
3. Deploy!

## 📝 Notes
- PDF export is available once a batch is completed
- If a recipient has no WhatsApp, notification status is auto-skipped
- All routes require authentication (redirects to sign-in page)
- Health check endpoint available at `/health`

## 💰 Financial System

Planning docs for multi-module finance system:
- `docs/FINANCE_SYSTEM_BLUEPRINT.md`
- `docs/FINANCE_IMPLEMENTATION_TODO.md`

## 🔧 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run generate-secret` - Generate AUTH_SECRET
- `npm run seed:finance-dummy` - Seed dummy finance data

## 🔒 Security

- ✅ Google OAuth authentication
- ✅ Email whitelist (only 2 authorized users)
- ✅ Session-based security
- ✅ All routes protected by default
- ✅ Environment-based configuration

## 📄 License

Private internal application for EFATA organization.

