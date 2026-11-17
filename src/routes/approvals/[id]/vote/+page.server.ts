import { error, redirect } from "@sveltejs/kit";
import {
  boardApprovalDb,
  boardApprovalVoteDb,
} from "$lib/server/db.js";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = async (event) => {
  let session = null;
  try {
    session = await event.locals.auth();
  } catch (err) {
    console.error("Failed to resolve auth session in approval vote load:", err);
  }

  if (!session?.user) {
    throw redirect(
      303,
      `/auth/signin?callbackUrl=${encodeURIComponent(event.url.pathname)}`,
    );
  }

  const approvalId = Number(event.params.id);
  if (!approvalId) throw error(400, "Invalid approval id");

  const approval = boardApprovalDb.getById(approvalId);
  if (!approval) throw error(404, "Approval not found");

  const userEmail = session.user.email || "";
  return {
    session,
    approval: {
      ...approval,
      vote_summary: boardApprovalVoteDb.getSummary(approvalId),
      user_vote: userEmail
        ? boardApprovalVoteDb.getByApprovalAndEmail(approvalId, userEmail) ?? null
        : null,
    },
    votes: boardApprovalVoteDb.getByApprovalId(approvalId),
  };
};
