import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
  let session = null;
  try {
    session = await event.locals.auth();
  } catch (error) {
    console.error("Failed to resolve auth session in layout load:", error);
  }

  return {
    session,
  };
};
