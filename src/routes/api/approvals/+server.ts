import { json } from "@sveltejs/kit";
import { boardApprovalDb, boardApprovalVoteDb } from "$lib/server/db.js";
import { compressApprovalProof } from "$lib/server/approval-proof.js";
import type { BoardApproval } from "$lib/types.js";
import type { RequestHandler } from "./$types.js";

function text(form: FormData, key: string): string {
  return String(form.get(key) || "").trim();
}

function optionalText(form: FormData, key: string): string | null {
  const value = text(form, key);
  return value || null;
}

function proofFile(form: FormData): File | null {
  const file = form.get("proof");
  if (!file || typeof file === "string" || file.size <= 0) return null;
  return file;
}

export const GET: RequestHandler = async ({ locals, url }) => {
  try {
    const session = await locals.auth();
    if (!session?.user) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    const kindRaw = url.searchParams.get("kind");
    const statusRaw = url.searchParams.get("status");
    const q = url.searchParams.get("q") || undefined;
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;

    const kind =
      kindRaw === "expense" ||
      kindRaw === "decision" ||
      kindRaw === "budget" ||
      kindRaw === "policy" ||
      kindRaw === "other"
        ? kindRaw
        : undefined;
    const status =
      statusRaw === "pending" ||
      statusRaw === "approved" ||
      statusRaw === "superseded" ||
      statusRaw === "rejected"
        ? statusRaw
        : undefined;

    return json(
      boardApprovalDb.getAll({ kind, status, from, to, q }).map((approval) => ({
        ...approval,
        vote_summary: approval.id
          ? boardApprovalVoteDb.getSummary(approval.id)
          : { agree: 0, disagree: 0, total: 0 },
        votes: approval.id ? boardApprovalVoteDb.getByApprovalId(approval.id) : [],
      })),
    );
  } catch (error) {
    console.error("Error fetching approvals:", error);
    return json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    const session = await locals.auth();
    if (!session?.user) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    const form = await request.formData();
    const title = text(form, "title");
    const decisionDate = text(form, "decision_date");
    const approvers = text(form, "approvers");

    if (!title || !decisionDate) {
      return json(
        { error: "Title and decision date are required" },
        { status: 400 },
      );
    }

    const created = boardApprovalDb.create({
      kind: text(form, "kind"),
      title,
      decision_date: `${decisionDate}T12:00:00.000Z`,
      amount: Number(text(form, "amount")) || 0,
      currency: text(form, "currency") || "IDR",
      status: text(form, "status") || "pending",
      approvers,
      whatsapp_context: optionalText(form, "whatsapp_context"),
      notes: optionalText(form, "notes"),
      created_by_email: session.user.email ?? null,
      updated_by_email: session.user.email ?? null,
    });

    const file = proofFile(form);
    if (file && created.id) {
      const proof = await compressApprovalProof(created.id, file, title);
      boardApprovalDb.setProof(created.id, {
        ...proof,
        updated_by_email: session.user.email ?? null,
      });
    }

    return json(boardApprovalDb.getById(created.id as number), { status: 201 });
  } catch (error) {
    console.error("Error creating approval:", error);
    const message = error instanceof Error ? error.message : "Failed to create approval";
    return json({ error: message }, { status: 500 });
  }
};
