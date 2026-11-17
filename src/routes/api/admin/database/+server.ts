import { timingSafeEqual } from "crypto";
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { env } from "$env/dynamic/private";
import { restoreDatabase, snapshotDatabase } from "$lib/server/db.js";
import type { RequestHandler } from "./$types";

/**
 * Machine access to the database for maintenance from the treasurer's laptop
 * (download, merge, upload) without a browser session.
 *
 *   curl -H "Authorization: Bearer $TOKEN" https://…/api/admin/database -o prod.db
 *   curl -X PUT -H "Authorization: Bearer $TOKEN" --data-binary @merged.db https://…/api/admin/database
 *
 * Answers 404 unless DB_SYNC_TOKEN is set to at least 32 characters and the
 * request carries exactly that token. The sign-in guard lets this one path
 * through, so the token check here is the gate. Unset DB_SYNC_TOKEN in
 * Coolify to switch the endpoint off.
 */

function authorized(request: Request): boolean {
  const expected = env.DB_SYNC_TOKEN?.trim() || "";
  if (expected.length < 32) return false;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const notFound = () => new Response("Not found", { status: 404 });

export const GET: RequestHandler = async ({ request }) => {
  if (!authorized(request)) return notFound();
  const file = join(tmpdir(), `efata-sync-${Date.now()}-${process.pid}.db`);
  snapshotDatabase(file);
  try {
    return new Response(new Uint8Array(readFileSync(file)), {
      headers: { "content-type": "application/vnd.sqlite3", "cache-control": "no-store" },
    });
  } finally {
    unlinkSync(file);
  }
};

export const PUT: RequestHandler = async ({ request }) => {
  if (!authorized(request)) return notFound();
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.subarray(0, 16).toString("latin1").startsWith("SQLite format 3")) {
    return Response.json({ error: "Body is not an SQLite database" }, { status: 400 });
  }
  const file = join(tmpdir(), `efata-sync-upload-${Date.now()}-${process.pid}.db`);
  writeFileSync(file, bytes);
  try {
    const safety = await restoreDatabase(file);
    console.log(`[sync] database restored via API; safety copy ${safety}`);
    return Response.json({ restored: true, safety_copy: safety.split("/").pop() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Restore failed" }, { status: 400 });
  } finally {
    unlinkSync(file);
  }
};
