# Coolify Deployment Checklist

## Pre-Deployment

- [x] Dockerfile created
- [x] .dockerignore configured
- [x] SvelteKit adapter changed to `@sveltejs/adapter-node`
- [x] docker-compose.yml for local testing
- [x] Health check endpoint created (`/health`)
- [x] Google SSO authentication implemented
- [ ] **IMPORTANT**: Set up Google OAuth credentials (see AUTH_SETUP.md)
- [ ] Install dependencies: `npm install`
- [ ] Configure `.env` with Google credentials
- [ ] Test authentication locally
- [ ] Test build locally: `npm run build`
- [ ] Test Docker build: `docker build -t efata-financials .`
- [ ] Test Docker run: `docker run -p 3000:3000 efata-financials`

## Google OAuth Setup (REQUIRED)

- [ ] Create Google Cloud project
- [ ] Enable Google+ API
- [ ] Create OAuth 2.0 credentials
- [ ] Add authorized origins (dev and prod)
- [ ] Add redirect URIs:
  - Dev: `http://localhost:5173/auth/callback/google`
  - Prod: `https://your-domain.com/auth/callback/google`
- [ ] Copy Client ID and Client Secret
- [ ] Generate secure AUTH_SECRET: `openssl rand -base64 32`

## Coolify Setup

- [ ] Create new Application in Coolify
- [ ] Connect Git repository
- [ ] Set Build Pack to "Dockerfile"
- [ ] Configure Port: 3000
- [ ] Set Environment Variables:
  - `NODE_ENV=production`
  - `PORT=3000`
  - `HOST=0.0.0.0`
  - `AUTH_SECRET=<generated-secret>` **REQUIRED**
  - `GOOGLE_CLIENT_ID=<your-client-id>` **REQUIRED**
  - `GOOGLE_CLIENT_SECRET=<your-client-secret>` **REQUIRED**
- [ ] Configure Persistent Storage:
  - Source: Create volume (e.g., `efata-db-data`)
  - Destination: `/app/data`
- [ ] Set Health Check:
  - Path: `/health`
  - Port: `3000`

## Post-Deployment

- [ ] Verify application is running
- [ ] Check logs in Coolify
- [ ] Access health endpoint: `https://your-domain.com/health`
- [ ] Initialize database (if needed)
- [ ] Test main functionality
- [ ] Configure custom domain (optional)
- [ ] Enable auto-deployment (optional)
- [ ] Set up backups

## Database Initialization

If starting fresh:

```bash
# Connect to container terminal in Coolify
node scripts/seed-finance-dummy.mjs
```

## Testing

After deployment, test these endpoints:
- `/` - Home page
- `/health` - Health check
- `/batches` - Batches page
- `/recipients` - Recipients page
- `/finance` - Finance dashboard

## Rollback Plan

If issues occur:
1. Check logs in Coolify dashboard
2. Review environment variables
3. Verify volume mounts for database persistence
4. Rollback to previous deployment in Coolify
5. Review recent code changes

## Notes

- SQLite database requires persistent volume for data retention
- File uploads (proofs) stored in `/app/data/proofs`
- Consider using object storage for production file uploads
- Monitor disk usage for SQLite database growth
