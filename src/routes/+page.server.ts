import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();

  // If not authenticated, redirect to Auth.js default signin
  if (!session?.user) {
    throw redirect(303, "/auth/signin?callbackUrl=/finance");
  }

  throw redirect(307, "/finance");
};
