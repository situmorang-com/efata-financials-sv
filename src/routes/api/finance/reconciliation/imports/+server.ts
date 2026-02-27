import { json } from "@sveltejs/kit";
import { financeReconciliationDb } from "$lib/server/db.js";
import { parseBankStatementCsv } from "$lib/server/reconciliation-import.js";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = async () => {
  try {
    return json(financeReconciliationDb.getImports());
  } catch (error) {
    console.error("Error listing reconciliation imports:", error);
    return json({ error: "Failed to list reconciliation imports" }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const linkedAccountRaw = form.get("linked_account_id");
    if (!(file instanceof File)) {
      return json({ error: "File CSV wajib diupload" }, { status: 400 });
    }
    const content = await file.text();
    const parsed = parseBankStatementCsv(content);
    const existing = financeReconciliationDb.getImportByFileHash(parsed.file_hash) as
      | { id: number }
      | undefined;
    if (existing?.id) {
      const importRow = financeReconciliationDb.getImportById(existing.id);
      return json({ reused: true, import: importRow });
    }

    const importId = financeReconciliationDb.createImport({
      ...parsed,
      file_name: file.name,
      linked_account_id: linkedAccountRaw ? Number(linkedAccountRaw) : null,
    });
    const importRow = financeReconciliationDb.getImportById(importId);
    return json({ reused: false, import: importRow }, { status: 201 });
  } catch (error) {
    console.error("Error importing bank statement CSV:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Failed to import bank statement",
      },
      { status: 500 },
    );
  }
};
