import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = async (event) => {
  let session = null;
  try {
    session = await event.locals.auth();
  } catch (error) {
    console.error("Failed to resolve auth session in root load:", error);
  }

  // If not authenticated, redirect to Auth.js default signin
  if (!session?.user) {
    throw redirect(303, "/auth/signin?callbackUrl=/finance");
  }

  throw redirect(307, "/finance");
};
