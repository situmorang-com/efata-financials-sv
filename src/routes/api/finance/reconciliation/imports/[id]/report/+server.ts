import { json } from "@sveltejs/kit";
import { financeReconciliationDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

function esc(value: unknown): string {
  const str = String(value ?? "");
  if (/[,"\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export const GET: RequestHandler = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: "Invalid import id" }, { status: 400 });
    const rows = financeReconciliationDb.getReportRows(id) as Array<Record<string, unknown>>;
    if (!rows.length) return json({ error: "No report data" }, { status: 404 });

    const headers = [
      "account_no",
      "period_from",
      "period_to",
      "import_status",
      "line_no",
      "post_date",
      "remarks",
      "additional_desc",
      "credit_amount",
      "debit_amount",
      "signed_amount",
      "close_balance",
      "match_status",
      "suggestion_score",
      "match_confidence",
      "txn_id",
      "txn_type",
      "txn_sub_type",
      "txn_amount",
      "txn_date",
      "reference_no",
      "service_label",
    ];

    const csv = [
      headers.join(";"),
      ...rows.map((row) => headers.map((h) => esc(row[h])).join(";")),
    ].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reconciliation-import-${id}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error generating reconciliation report:", error);
    return json({ error: "Failed to generate reconciliation report" }, { status: 500 });
  }
};
