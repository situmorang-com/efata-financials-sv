import { json } from "@sveltejs/kit";
import {
  boardApprovalDb,
  deleteApprovalProofFile,
} from "$lib/server/db.js";
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

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  try {
    const session = await locals.auth();
    if (!session?.user) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    const id = Number(params.id);
    if (!id) return json({ error: "Invalid id" }, { status: 400 });

    const existing = boardApprovalDb.getById(id);
    if (!existing) return json({ error: "Approval not found" }, { status: 404 });

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

    const success = boardApprovalDb.update(id, {
      kind: text(form, "kind") as BoardApproval["kind"],
      title,
      decision_date: `${decisionDate}T12:00:00.000Z`,
      amount: Number(text(form, "amount")) || 0,
      currency: text(form, "currency") || "IDR",
      status: text(form, "status") as BoardApproval["status"],
      approvers,
      whatsapp_context: optionalText(form, "whatsapp_context"),
      notes: optionalText(form, "notes"),
      updated_by_email: session.user.email ?? null,
    });

    if (!success) return json({ error: "Approval not found" }, { status: 404 });

    const file = proofFile(form);
    if (file) {
      const proof = await compressApprovalProof(id, file, title);
      boardApprovalDb.setProof(id, {
        ...proof,
        updated_by_email: session.user.email ?? null,
      });
      if (existing.proof_filename) {
        deleteApprovalProofFile(existing.proof_filename);
      }
    }

    return json(boardApprovalDb.getById(id));
  } catch (error) {
    console.error("Error updating approval:", error);
    const message = error instanceof Error ? error.message : "Failed to update approval";
    return json({ error: message }, { status: 500 });
  }
};
