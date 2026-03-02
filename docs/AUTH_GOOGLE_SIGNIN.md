# Google sign-in (NextAuth)

## 1. Set a session secret (fix 401 / NO_SECRET)

NextAuth needs a secret to sign the session cookie. In `.env.local` add **one** of:

- `NEXTAUTH_SECRET=<random string>`
- or `REFLEXION_JWT_SECRET=<random string>` (same value as backend if you use backend auth)

Generate a value: `openssl rand -base64 32` (or any long random string). Restart the dev server after adding it.

Without this you get `[next-auth][warn] NO_SECRET` and requests like `GET /api/projects` can return 401.

## 2. Error 400: redirect_uri_mismatch ("This app sent an invalid request")

Google rejects sign-in because the **redirect URI** we send isn’t in your OAuth client’s list.

**Fix:**

1. **Use one origin**  
   Open the app at exactly the same URL as `NEXTAUTH_URL` (e.g. if `NEXTAUTH_URL=http://localhost:3003`, use `http://localhost:3003` in the browser, not `http://localhost:3000`).

2. **Add this exact redirect URI in Google Cloud Console**  
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → your project → **APIs & Services** → **Credentials**.
   - Open your **OAuth 2.0 Client ID** (Web application).
   - Under **Authorized redirect URIs** click **+ ADD URI** and add **exactly** (no trailing slash, correct port):
     ```
     http://localhost:3003/api/auth/callback/google
     ```
   - If you use a different port in `NEXTAUTH_URL`, use that port in the URI (e.g. `http://localhost:3000/api/auth/callback/google`).
   - Save.

3. **Wait a minute**  
   Google can take a short time to apply changes. Then try sign-in again.

**Check:** The URI must match character-for-character: `http` (not `https` for localhost), correct host and port, path `/api/auth/callback/google`, no trailing slash.
