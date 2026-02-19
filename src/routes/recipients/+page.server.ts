import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();

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
