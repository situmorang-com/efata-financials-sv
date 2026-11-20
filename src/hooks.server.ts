import { SvelteKitAuth } from "@auth/sveltekit";
import { json, redirect, type Handle, type HandleServerError } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import Google from "@auth/core/providers/google";
import { env } from "$env/dynamic/private";

const ALLOWED_EMAILS = [
  "edmundsitumorang@gmail.com",
  "situmeangirhen@gmail.com",
];
const configuredAllowedEmails = (env.ALLOWED_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const allowedEmails = new Set([
  ...ALLOWED_EMAILS.map((email) => email.toLowerCase()),
  ...configuredAllowedEmails,
]);

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

const { handle: authHandle } = SvelteKitAuth({
  debug: env.AUTH_DEBUG === "true",
  trustHost: true,
  session: {
    maxAge: 60 * 60 * 24 * 60,
  },
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (user?.email && allowedEmails.has(user.email.toLowerCase())) {
        return true;
      }
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

/** Reachable without signing in. Everything else needs an allowed Google account. */
const PUBLIC_PATHS = [
  /^\/auth(\/|$)/, // Auth.js sign-in, callback, session, csrf
  /^\/health$/,
  /^\/favicon\.ico$/,
  /^\/apple-touch-icon[^/]*\.png$/,
  /^\/g\//, // giver confirmation pages: protected by their own link + PIN
  /^\/api\/admin\/database$/, // maintenance sync: gated by DB_SYNC_TOKEN in the route
];
/**
 * Read-only routes linked from WhatsApp messages to recipients, who have no
 * account: the transfer proof image for one batch item, and the receipt of the
 * cash payout sent to the cash distributor.
 */
const PUBLIC_GET_PATHS = [
  /^\/api\/batches\/\d+\/items\/\d+\/proof$/,
  /^\/api\/batches\/\d+\/payments\/cash-proof$/,
];

const requireSignIn: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  const isPublic =
    PUBLIC_PATHS.some((re) => re.test(path)) ||
    (event.request.method === "GET" && PUBLIC_GET_PATHS.some((re) => re.test(path)));
  if (isPublic) return resolve(event);

  let session = null;
  try {
    session = await event.locals.auth();
  } catch (error) {
    console.error("Failed to resolve auth session in guard:", error);
  }
  if (session?.user) return resolve(event);

  if (path.startsWith("/api/")) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const callback = event.url.pathname + event.url.search;
  throw redirect(303, `/auth/signin?callbackUrl=${encodeURIComponent(callback)}`);
};

export const handle = sequence(authHandle, requireSignIn);

export const handleError: HandleServerError = ({ error, event }) => {
  console.error("Unhandled server error:", {
    path: event.url.pathname,
    message: error instanceof Error ? error.message : String(error),
  });
  return {
    message: "Internal Server Error",
  };
};
