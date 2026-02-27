import { json } from "@sveltejs/kit";
import { financeReconciliationDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

const validStatuses = new Set(["unmatched", "suggested", "matched", "ignored"]);

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: "Invalid import id" }, { status: 400 });

    const importRow = financeReconciliationDb.getImportById(id) as
      | Record<string, unknown>
      | undefined;
    if (!importRow) return json({ error: "Import not found" }, { status: 404 });

    const statusRaw = url.searchParams.get("status");
    const status = statusRaw && validStatuses.has(statusRaw) ? statusRaw : undefined;
    const lines = financeReconciliationDb.getLines(
      id,
      status as "unmatched" | "suggested" | "matched" | "ignored" | undefined,
    );

    const summary = {
      matched_amount: lines
        .filter((l) => l.match_status === "matched")
        .reduce((sum, l) => sum + Math.abs(Number(l.signed_amount || 0)), 0),
      unmatched_amount: lines
        .filter((l) => l.match_status === "unmatched" || l.match_status === "suggested")
        .reduce((sum, l) => sum + Math.abs(Number(l.signed_amount || 0)), 0),
      lines_count: lines.length,
    };

    return json({ import: importRow, lines, summary });
  } catch (error) {
    console.error("Error loading reconciliation import detail:", error);
    return json({ error: "Failed to load reconciliation import detail" }, { status: 500 });
  }
};
