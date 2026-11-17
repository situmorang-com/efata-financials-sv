import { error, redirect, type RequestEvent } from "@sveltejs/kit";

/**
 * The signed-in treasurer, or a redirect to sign-in. Use in page loads and
 * form actions that must not be reachable without a session.
 */
export async function requireUser(event: RequestEvent) {
  let session = null;
  try {
    session = await event.locals.auth();
  } catch (err) {
    console.error("Failed to resolve auth session:", err);
  }
  if (!session?.user) {
    if (event.request.method === "GET") {
      throw redirect(303, `/auth/signin?callbackUrl=${encodeURIComponent(event.url.pathname)}`);
    }
    throw error(401, "Unauthorized");
  }
  return session;
}
