import { json } from "@sveltejs/kit";
import {
  boardApprovalDb,
  boardApprovalVoteDb,
} from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ locals, params, request }) => {
  try {
    const session = await locals.auth();
    if (!session?.user?.email) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    const approvalId = Number(params.id);
    if (!approvalId) return json({ error: "Invalid approval id" }, { status: 400 });

    const approval = boardApprovalDb.getById(approvalId);
    if (!approval) return json({ error: "Approval not found" }, { status: 404 });

    const data = await request.json();
    const vote = String(data.vote || "");
    if (vote !== "agree" && vote !== "disagree") {
      return json({ error: "Vote must be agree or disagree" }, { status: 400 });
    }

    const saved = boardApprovalVoteDb.upsert({
      approval_id: approvalId,
      voter_email: session.user.email,
      voter_name: session.user.name ?? null,
      vote,
      comment: typeof data.comment === "string" ? data.comment : null,
    });

    return json({
      vote: saved,
      summary: boardApprovalVoteDb.getSummary(approvalId),
      votes: boardApprovalVoteDb.getByApprovalId(approvalId),
    });
  } catch (error) {
    console.error("Error saving approval vote:", error);
    return json({ error: "Failed to save vote" }, { status: 500 });
  }
};
