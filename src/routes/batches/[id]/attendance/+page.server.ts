import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  let session = null;
  try {
    session = await event.locals.auth();
  } catch (error) {
    console.error("Failed to resolve auth session in attendance load:", error);
  }

  if (!session?.user) {
    throw redirect(
      303,
      `/auth/signin?callbackUrl=${encodeURIComponent(event.url.pathname)}`,
    );
  }

  return {};
};
