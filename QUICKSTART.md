# Quick Start - Google SSO Setup

## ⚡ Fast Setup (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Get Google OAuth Credentials

**Go to**: https://console.cloud.google.com/apis/credentials

**Steps**:
1. Create project (if new) or select existing
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Add redirect URI: `http://localhost:5173/auth/callback/google`
5. Copy **Client ID** and **Client Secret**

### 3. Update .env File

Open `.env` and add your credentials:

```env
NODE_ENV=development
AUTH_SECRET=development-secret-replace-in-production
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

For production, generate a secure secret:
```bash
npm run generate-secret
# or
openssl rand -base64 32
```

### 4. Run the App

```bash
npm run dev
```

Visit: http://localhost:5173

### 5. Sign In

- Click "Continue with Google"
- Use one of these emails:
  - `edmundsitumorang@gmail.com`
  - `situmeangirhen@gmail.com`

✅ Done! You should now be signed in.

---

## 🚀 Production Deployment to Coolify

### Prerequisites
- Google OAuth credentials created (see above)
- Production domain configured

### Steps

1. **Update Google OAuth**:
   - Go to Google Cloud Console
   - Edit your OAuth client
   - Add: `https://yourdomain.com/auth/callback/google`

2. **Set Environment Variables in Coolify**:
   ```
   NODE_ENV=production
   PORT=3000
   HOST=0.0.0.0
   AUTH_SECRET=<generate-new-secret>
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```

3. **Deploy**: Push to git and Coolify will auto-deploy

---

## 🔒 Security Notes

- ✅ Only 2 emails are whitelisted
- ✅ All routes are protected
- ✅ Session-based authentication
- ✅ Automatic redirect to sign-in

## 📚 Need More Details?

- Full setup guide: `AUTH_SETUP.md`
- Deployment guide: `COOLIFY_DEPLOYMENT.md`
- Deployment checklist: `DEPLOYMENT_CHECKLIST.md`

## ❓ Troubleshooting

**"Redirect URI mismatch"**
→ Check Google Console redirect URI matches exactly

**"Access Denied"**
→ Your email is not in the allowed list

**"Configuration error"**
→ Check environment variables are set correctly

**Still having issues?**
→ Check `AUTH_SETUP.md` troubleshooting section
