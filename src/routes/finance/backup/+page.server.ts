import { fail } from "@sveltejs/kit";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { listSafetyCopies, restoreDatabase } from "$lib/server/db.js";
import { requireUser } from "$lib/server/require-user.js";
import type { Actions, PageServerLoad } from "./$types";

const CONFIRM_WORD = "GANTI";

export const load: PageServerLoad = async (event) => {
  await requireUser(event);
  return { safetyCopies: listSafetyCopies().slice(0, 10), confirmWord: CONFIRM_WORD };
};

export const actions: Actions = {
  /** Replaces the live database with an uploaded file, after a safety copy. */
  restore: async (event) => {
    const session = await requireUser(event);
    const form = await event.request.formData();
    if (String(form.get("confirm") || "").trim().toUpperCase() !== CONFIRM_WORD) {
      return fail(400, { error: `Ketik ${CONFIRM_WORD} untuk mengonfirmasi.` });
    }
    const file = form.get("database");
    if (!(file instanceof File) || file.size === 0) return fail(400, { error: "Pilih file database (.db)." });
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.subarray(0, 16).toString("latin1").startsWith("SQLite format 3")) {
      return fail(400, { error: "File ini bukan database SQLite." });
    }
    const tmp = join(tmpdir(), `efata-upload-${Date.now()}-${process.pid}.db`);
    writeFileSync(tmp, bytes);
    try {
      const safety = await restoreDatabase(tmp);
      console.log(`[backup] database restored by ${session.user?.email}; safety copy ${safety}`);
      return { restored: true, safety: safety.split("/").pop() };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : "Gagal memulihkan database." });
    } finally {
      unlinkSync(tmp);
    }
  },
};
