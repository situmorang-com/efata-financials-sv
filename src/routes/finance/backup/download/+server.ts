import { readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { listSafetyCopies, readSafetyCopy, snapshotDatabase } from "$lib/server/db.js";
import { requireUser } from "$lib/server/require-user.js";
import type { RequestHandler } from "./$types";

/**
 * Downloads a consistent snapshot of the live database, or with
 * `?copy=<name>` one of the safety copies written before a restore.
 */
export const GET: RequestHandler = async (event) => {
  await requireUser(event);
  const copy = event.url.searchParams.get("copy");
  if (copy) {
    // Only names from the server's own listing — never a path from the request.
    if (!listSafetyCopies().some((c) => c.name === copy)) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(new Uint8Array(readSafetyCopy(copy)), {
      headers: {
        "content-type": "application/vnd.sqlite3",
        "content-disposition": `attachment; filename="${copy}.db"`,
        "cache-control": "no-store",
      },
    });
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const file = join(tmpdir(), `efata-${stamp}-${process.pid}.db`);
  snapshotDatabase(file);
  try {
    const bytes = readFileSync(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/vnd.sqlite3",
        "content-disposition": `attachment; filename="efata-${stamp}.db"`,
        "cache-control": "no-store",
      },
    });
  } finally {
    unlinkSync(file);
  }
};
