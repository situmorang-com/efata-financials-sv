import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  let session = null;
  try {
    session = await event.locals.auth();
  } catch (error) {
    console.error("Failed to resolve auth session in batches load:", error);
  }

  // If not authenticated, redirect to Auth.js signin
  if (!session?.user) {
    throw redirect(
      303,
      `/auth/signin?callbackUrl=${encodeURIComponent(event.url.pathname)}`,
    );
  }

  // Continue with existing page load
  return {};
};
