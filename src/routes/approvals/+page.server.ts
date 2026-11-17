import { redirect } from "@sveltejs/kit";
import { boardApprovalDb, boardApprovalVoteDb } from "$lib/server/db.js";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = async (event) => {
  let session = null;
  try {
    session = await event.locals.auth();
  } catch (error) {
    console.error("Failed to resolve auth session in approvals load:", error);
  }

  if (!session?.user) {
    throw redirect(
      303,
      `/auth/signin?callbackUrl=${encodeURIComponent(event.url.pathname)}`,
    );
  }

  return {
    session,
    approvals: boardApprovalDb.getAll().map((approval) => ({
      ...approval,
      vote_summary: approval.id
        ? boardApprovalVoteDb.getSummary(approval.id)
        : { agree: 0, disagree: 0, total: 0 },
      votes: approval.id ? boardApprovalVoteDb.getByApprovalId(approval.id) : [],
    })),
  };
};
