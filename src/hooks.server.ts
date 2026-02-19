import { SvelteKitAuth } from "@auth/sveltekit";
import Google from "@auth/core/providers/google";
import { env } from "$env/dynamic/private";

const ALLOWED_EMAILS = [
  "edmundsitumorang@gmail.com",
  "situmeangirhen@gmail.com",
];

const authSecret = env.AUTH_SECRET?.trim();
const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();

if (!authSecret) {
  throw new Error(
    "Auth secret is not configured. Set AUTH_SECRET in environment variables."
  );
}

if (!googleClientId || !googleClientSecret) {
  throw new Error(
    "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables."
  );
}

export const { handle } = SvelteKitAuth({
  debug: env.NODE_ENV !== "production",
  trustHost: true,
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Check if email is in the allowed list
      if (user?.email && ALLOWED_EMAILS.includes(user.email.toLowerCase())) {
        return true;
      }
      // Deny access if email is not in the allowed list
      return false;
    },
    async session({ session, token }) {
      // Add user info to session
      if (session?.user && token?.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
});
