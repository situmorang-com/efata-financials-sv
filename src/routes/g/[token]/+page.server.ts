import { error, fail, type Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { giverStatementDb } from "$lib/server/db.js";
import type { GiverStatement } from "$lib/types.js";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Public, PIN-protected page where a giver confirms the split of their own
 * bank transfers. Only the giver's own lines are ever sent to the browser.
 */

const COOKIE = "giver_session";

function statementFor(token: string): GiverStatement {
  const statement = giverStatementDb.byToken(token);
  if (!statement) throw error(404, "Halaman tidak ditemukan atau sudah tidak berlaku.");
  return statement;
}

function isUnlocked(cookies: Cookies, statement: GiverStatement): boolean {
  return cookies.get(COOKIE) === giverStatementDb.sessionValue(statement);
}

export const load: PageServerLoad = async ({ params, cookies, setHeaders }) => {
  setHeaders({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" });
  const statement = statementFor(params.token);
  if (!isUnlocked(cookies, statement)) return { unlocked: false as const };
  return {
    unlocked: true as const,
    giver_name: statement.giver_name,
    status: statement.status,
    editable: giverStatementDb.isEditable(statement),
    giver_note: statement.giver_note,
    submitted_at: statement.submitted_at,
    lines: giverStatementDb.lines(statement.id).map((l) => ({
      id: l.id,
      txn_date: l.txn_date,
      amount: l.amount,
      remark: l.remark,
      account_label: l.account_label,
      suggested: { tithe: l.suggested_tithe, offering: l.suggested_offering, special: l.suggested_special },
      suggestion_source: l.suggestion_source,
      suggestion_detail: l.suggestion_detail,
      tithe: l.tithe,
      offering: l.offering,
      special: l.special,
      not_mine: !!l.not_mine,
      note: l.note ?? "",
      edited: !!l.edited_at,
    })),
  };
};

export const actions: Actions = {
  pin: async ({ params, request, cookies, url }) => {
    const statement = statementFor(params.token);
    const pin = String((await request.formData()).get("pin") || "");
    const result = giverStatementDb.checkPin(statement, pin);
    if (!result.ok) return fail(400, { pinError: result.error });
    cookies.set(COOKIE, giverStatementDb.sessionValue(statement), {
      path: url.pathname,
      httpOnly: true,
      sameSite: "lax",
      secure: !dev,
      maxAge: 60 * 60 * 24 * 7,
    });
    return { unlocked: true };
  },

  save: async ({ params, request, cookies }) => {
    const statement = statementFor(params.token);
    if (!isUnlocked(cookies, statement)) return fail(401, { error: "Sesi berakhir. Masukkan PIN lagi." });
    const form = await request.formData();
    try {
      const line = giverStatementDb.saveLine(statement, Number(form.get("line_id")), {
        tithe: Number(form.get("tithe")),
        offering: Number(form.get("offering")),
        special: Number(form.get("special")),
        not_mine: form.get("not_mine") === "1",
        note: String(form.get("note") || ""),
      });
      return { saved: line.id };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : "Gagal menyimpan." });
    }
  },

  submit: async ({ params, request, cookies }) => {
    const statement = statementFor(params.token);
    if (!isUnlocked(cookies, statement)) return fail(401, { error: "Sesi berakhir. Masukkan PIN lagi." });
    const form = await request.formData();
    try {
      giverStatementDb.submit(statement, String(form.get("note") || ""));
      return { submitted: true };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : "Gagal mengirim." });
    }
  },
};
