import { json } from "@sveltejs/kit";
import { financeReconciliationDb, financeTransactionDb } from "$lib/server/db.js";
import type { FinanceTransaction } from "$lib/types.js";
import type { RequestHandler } from "./$types.js";

function addDays(dateOnly: string, delta: number): string {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const lineId = Number(params.lineId);
    if (!lineId) return json({ error: "Invalid line id" }, { status: 400 });
    const line = financeReconciliationDb.getLineById(lineId) as
      | {
          post_date: string;
          signed_amount: number;
        }
      | undefined;
    if (!line) return json({ error: "Line not found" }, { status: 404 });

    const lineDate = line.post_date.slice(0, 10);
    const q = (url.searchParams.get("q") || "").trim();
    const items = financeTransactionDb.getAll({
      type: line.signed_amount >= 0 ? "income" : "expense",
      from: addDays(lineDate, -7),
      to: addDays(lineDate, 7),
      q: q || undefined,
    });
    const amountExpected = Math.abs(line.signed_amount || 0);
    const ranked = (items as FinanceTransaction[])
      .filter((t) => t.status !== "void")
      .map((t) => ({
        ...t,
        amount_diff: Math.abs(Math.abs(t.amount || 0) - amountExpected),
      }))
      .sort((a, b) => a.amount_diff - b.amount_diff || b.id! - a.id!)
      .slice(0, 20);
    return json(ranked);
  } catch (error) {
    console.error("Error loading reconciliation candidates:", error);
    return json({ error: "Failed to load candidates" }, { status: 500 });
  }
};
