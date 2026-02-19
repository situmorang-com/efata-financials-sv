# Google SSO Authentication Setup Guide

This application now requires Google SSO authentication with email whitelist. Only the following emails are allowed:
- `edmundsitumorang@gmail.com`
- `situmeangirhen@gmail.com`

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API"
   - Click "Enable"

4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
   - Configure:
     - **Name**: Efata Financials
     - **Authorized JavaScript origins**:
       - `http://localhost:5173` (for development)
       - `https://yourdomain.com` (for production)
     - **Authorized redirect URIs**:
       - `http://localhost:5173/auth/callback/google` (for development)
       - `https://yourdomain.com/auth/callback/google` (for production)
   - Click "Create"
   - Copy the **Client ID** and **Client Secret**

### 3. Configure Environment Variables

Update your `.env` file with the credentials:

```env
NODE_ENV=development
AUTH_SECRET=your-secret-key-here
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
```

#### Generate AUTH_SECRET

You can generate a secure secret with:

```bash
openssl rand -base64 32
```

Or in Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 4. Update Allowed Emails (Optional)

To add or modify allowed emails, edit `src/hooks.server.ts`:

```typescript
const ALLOWED_EMAILS = [
  'edmundsitumorang@gmail.com',
  'situmeangirhen@gmail.com',
  // Add more emails here
];
```

### 5. Run the Application

```bash
npm run dev
```

Visit `http://localhost:5173` and you'll be redirected to the sign-in page.

## Production Deployment

### For Coolify

1. Set environment variables in Coolify:
   ```
   NODE_ENV=production
   AUTH_SECRET=<your-generated-secret>
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```

2. Add your production domain to Google OAuth:
   - Go to Google Cloud Console → Credentials
   - Edit your OAuth client
   - Add authorized origins: `https://yourdomain.com`
   - Add redirect URI: `https://yourdomain.com/auth/callback/google`

3. Deploy as usual

### Dockerfile Updates

The Dockerfile already includes environment variable support. No changes needed.

## How It Works

### Authentication Flow

1. User visits any protected route
2. If not authenticated, redirected to `/auth/signin`
3. User clicks "Sign in with Google"
4. Redirected to Google OAuth consent screen
5. After consent, Google redirects back to the app
6. Email is checked against whitelist
7. If authorized, session is created and user can access the app
8. If not authorized, user sees error page

### Protected Routes

The following routes are protected and require authentication:
- `/` (redirects to `/finance` if authenticated)
- `/finance/*`
- `/batches/*`
- `/recipients/*`

### Public Routes

These routes are accessible without authentication:
- `/auth/signin` - Sign in page
- `/auth/error` - Error page
- `/health` - Health check endpoint

## Troubleshooting

### "Redirect URI mismatch" Error

Make sure the redirect URI in Google Cloud Console exactly matches:
- Development: `http://localhost:5173/auth/callback/google`
- Production: `https://yourdomain.com/auth/callback/google`

### "Access Denied" After Signing In

This means your email is not in the allowed list. Check:
1. The email you're using matches exactly (case-insensitive)
2. The ALLOWED_EMAILS array in `src/hooks.server.ts`

### Environment Variables Not Working

1. Restart the dev server after changing `.env`
2. Make sure `.env` is in the project root
3. Verify variable names match exactly (case-sensitive)

### "Configuration" Error

This means the OAuth credentials are not set or invalid:
1. Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
2. Verify they're correct by checking Google Cloud Console
3. Make sure `AUTH_SECRET` is set and not empty

## Security Notes

1. **Never commit `.env`** - It's already in `.gitignore`
2. **Use strong AUTH_SECRET** - Generate with OpenSSL or crypto
3. **HTTPS in production** - Required for OAuth to work properly
4. **Rotate secrets regularly** - Update AUTH_SECRET periodically
5. **Review allowed emails** - Keep the whitelist up to date

## Testing

### Test Authentication Locally

1. Start the dev server: `npm run dev`
2. Visit `http://localhost:5173`
3. Should redirect to `/auth/signin`
4. Click "Sign in with Google"
5. Sign in with an allowed email
6. Should redirect back to the app

### Test Email Whitelist

1. Try signing in with a non-whitelisted email
2. Should see "Access Denied" error
3. Should display list of authorized emails

## Support

For issues:
1. Check the troubleshooting section
2. Review Google Cloud Console configuration
3. Check browser console for errors
4. Verify environment variables are set correctly
