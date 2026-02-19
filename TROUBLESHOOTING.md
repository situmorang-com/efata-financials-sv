# Troubleshooting Guide

Common issues and solutions for Efata Financials application.

## 🔧 Installation Issues

### Dependencies Won't Install

**Problem**: `npm install` fails with errors

**Solutions**:
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Try with legacy peer deps
npm install --legacy-peer-deps

# Check Node version (requires Node 18+)
node --version
```

---

## 🔐 Authentication Issues

### "Redirect URI Mismatch" Error

**Problem**: Google OAuth shows redirect URI error

**Solution**: Ensure Google Cloud Console redirect URI matches exactly:
- **Development**: `http://localhost:5173/auth/callback/google`
- **Production**: `https://yourdomain.com/auth/callback/google`

**Steps**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client
3. Under "Authorized redirect URIs", verify the exact URL
4. Save changes
5. Wait 5 minutes for changes to propagate

### "Access Denied" After Sign In

**Problem**: Signed in successfully but see "Access Denied" page

**Cause**: Your email is not in the whitelist

**Solution**: 
1. Verify you're using one of these emails:
   - `edmundsitumorang@gmail.com`
   - `situmeangirhen@gmail.com`

2. To add your email, edit `src/hooks.server.ts`:
```typescript
const ALLOWED_EMAILS = [
  'edmundsitumorang@gmail.com',
  'situmeangirhen@gmail.com',
  'youremail@gmail.com', // Add here
];
```

3. Restart dev server: `npm run dev`

### "Configuration" Error

**Problem**: Error page shows "Configuration error"

**Cause**: Missing or invalid OAuth credentials

**Solution**:
1. Check `.env` file has all required variables:
```env
AUTH_SECRET=your-secret-here
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

2. Verify values are not empty or placeholder text

3. Generate a new AUTH_SECRET:
```bash
npm run generate-secret
```

4. Restart dev server after changing `.env`

### Session Expires Too Quickly

**Problem**: Have to sign in repeatedly

**Solution**: Check AUTH_SECRET is set correctly in production:
```bash
# Generate a strong secret
openssl rand -base64 32

# Set in Coolify environment variables
AUTH_SECRET=<generated-secret>
```

### Google Sign In Button Doesn't Work

**Problem**: Clicking "Sign in with Google" does nothing

**Solution**:
1. Check browser console for errors (F12)
2. Verify GOOGLE_CLIENT_ID is set in `.env`
3. Clear browser cache and cookies
4. Try in incognito/private mode
5. Check if popup blockers are interfering

---

## 🐳 Docker Issues

### Docker Build Fails

**Problem**: `docker build` command fails

**Solutions**:
```bash
# Check Dockerfile syntax
cat Dockerfile

# Build with no cache
docker build --no-cache -t efata-financials .

# Check disk space
df -h

# Clean up old images
docker system prune -a
```

### Container Won't Start

**Problem**: Container exits immediately

**Solution**:
```bash
# Check logs
docker logs <container-id>

# Run with interactive mode to see errors
docker run -it efata-financials

# Verify environment variables
docker run -it efata-financials env
```

### Auth Doesn't Work in Docker

**Problem**: Authentication fails when running in Docker

**Solution**: Ensure environment variables are passed:
```bash
# Using docker run
docker run -p 3000:3000 \
  -e AUTH_SECRET="your-secret" \
  -e GOOGLE_CLIENT_ID="your-id" \
  -e GOOGLE_CLIENT_SECRET="your-secret" \
  efata-financials

# Using docker-compose
# Make sure .env file exists with values
docker-compose up
```

---

## 🚀 Deployment Issues (Coolify)

### Build Fails on Coolify

**Problem**: Deployment fails during build

**Solutions**:
1. Check build logs in Coolify dashboard
2. Verify Dockerfile is in repository root
3. Ensure all dependencies are in `package.json`
4. Check Node version compatibility
5. Verify build pack is set to "Dockerfile"

### Environment Variables Not Working

**Problem**: App shows configuration errors in production

**Solution**:
1. Go to Coolify → Your App → Environment
2. Verify all variables are set:
   - `AUTH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `NODE_ENV=production`
   - `PORT=3000`
   - `HOST=0.0.0.0`
3. Click "Redeploy" after adding variables

### Database Not Persisting

**Problem**: Data is lost after redeployment

**Solution**:
1. In Coolify → Storage tab
2. Add persistent volume:
   - **Source**: Create new volume (e.g., `efata-db`)
   - **Destination**: `/app/data`
3. Redeploy application

### Can't Access Application

**Problem**: Domain doesn't load or shows 502 error

**Solutions**:
1. Check if container is running in Coolify logs
2. Verify port 3000 is exposed
3. Check health check endpoint: `/health`
4. Review application logs for errors
5. Ensure domain DNS is configured correctly

### OAuth Redirect Not Working in Production

**Problem**: Google OAuth fails in production but works locally

**Solution**:
1. Update Google Cloud Console:
   - Add production domain to Authorized JavaScript origins
   - Add redirect URI: `https://yourdomain.com/auth/callback/google`
2. Ensure HTTPS is working (Coolify handles this automatically)
3. Verify callback URL in Coolify environment
4. Wait 5-10 minutes for Google changes to propagate

---

## 💻 Development Issues

### Port Already in Use

**Problem**: `npm run dev` fails with "Port 5173 already in use"

**Solutions**:
```bash
# Kill process using port 5173
lsof -ti:5173 | xargs kill -9

# Or use a different port
npm run dev -- --port 5174
```

### TypeScript Errors

**Problem**: TypeScript compilation errors

**Solutions**:
```bash
# Regenerate types
npm run prepare

# Check for errors
npm run check

# Clear .svelte-kit cache
rm -rf .svelte-kit
npm run dev
```

### Hot Reload Not Working

**Problem**: Changes don't reflect in browser

**Solutions**:
1. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Restart dev server
3. Clear browser cache
4. Check if files are being saved
5. Disable browser extensions that might interfere

### Database Locked Error

**Problem**: "Database is locked" error

**Solutions**:
```bash
# Close other applications accessing the database
# Restart dev server
npm run dev

# If persists, remove WAL files
rm efata.db-shm efata.db-wal
npm run dev
```

---

## 🔍 Debugging Tips

### Enable Verbose Logging

Add to `.env`:
```env
DEBUG=auth:*
NODE_ENV=development
```

### Check Session State

Add to any `+page.server.ts`:
```typescript
export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  console.log('Session:', session);
  return { session };
};
```

### Test Auth Manually

1. Visit `/health` - should return JSON
2. Visit `/` - should redirect to `/auth/signin`
3. Sign in - check browser network tab
4. After sign in - check cookies in browser DevTools

### Browser Console Errors

Press F12 and check:
- **Console** tab for JavaScript errors
- **Network** tab for failed requests
- **Application** tab for cookies and session storage

---

## 📞 Still Having Issues?

### Quick Checklist

- [ ] Node.js 18+ installed
- [ ] Dependencies installed: `npm install`
- [ ] `.env` file exists with correct values
- [ ] Google OAuth credentials configured
- [ ] Redirect URIs match exactly
- [ ] Dev server restarted after `.env` changes
- [ ] Browser cache cleared
- [ ] No console errors in browser

### Get Help

1. **Check Documentation**:
   - `QUICKSTART.md` - Setup guide
   - `AUTH_SETUP.md` - Authentication details
   - `COOLIFY_DEPLOYMENT.md` - Deployment guide

2. **Review Logs**:
   - Browser console (F12)
   - Terminal/dev server output
   - Coolify logs (if deployed)

3. **Common Solutions**:
   - Restart dev server
   - Clear browser cache
   - Regenerate AUTH_SECRET
   - Verify Google Cloud Console settings
   - Check environment variables

4. **Debug Steps**:
   ```bash
   # Verify environment
   cat .env
   
   # Check Node version
   node --version
   
   # Reinstall dependencies
   rm -rf node_modules && npm install
   
   # Clear cache and restart
   rm -rf .svelte-kit && npm run dev
   ```

---

## 💡 Pro Tips

1. **Always restart dev server** after changing `.env`
2. **Use incognito mode** to test auth without cache issues
3. **Check browser console** before asking for help
4. **Generate new AUTH_SECRET** for each environment
5. **Wait 5-10 minutes** after changing Google OAuth settings
6. **Use `npm run generate-secret`** for secure secrets
7. **Keep documentation open** while troubleshooting

---

*Last updated: February 19, 2026*
