/**
 * Giver statements: a private page per giver listing their bank transfers, so
 * they can confirm how much of each was tithe, terpadu offering or special
 * offering (Persembahan Khusus, 100% for the church).
 *
 * A statement is a snapshot: when the link is created, each of the giver's
 * bank lines is copied with the split the books currently hold (or a guess
 * from the transfer remark). The giver edits their copy; nothing touches the
 * books until the treasurer applies the submitted statement.
 *
 * Access is a random link plus a 6-digit PIN. The PIN is stored hashed; after
 * MAX_ATTEMPTS wrong tries the statement locks for LOCK_MINUTES.
 */
import type Database from "better-sqlite3";
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "crypto";
import type {
  GiverLineSuggestion,
  GiverStatement,
  GiverStatementLine,
  GiverSummary,
} from "$lib/types.js";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const BOOKS_START = "2026-01-01";
const TERPADU = "Persembahan Terpadu";
const KHUSUS = "Persembahan Khusus";
const TAG = "[GIVER_STATEMENT]";

export const GIVER_SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS giver_statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giver_key TEXT NOT NULL,
    giver_name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    period_from TEXT NOT NULL,
    period_to TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'opened', 'submitted', 'applied', 'superseded')),
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    giver_note TEXT,
    opened_at TEXT,
    submitted_at TEXT,
    applied_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS giver_statement_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_id INTEGER NOT NULL,
    bank_line_id INTEGER NOT NULL,
    txn_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    remark TEXT,
    account_label TEXT,
    suggested_tithe INTEGER NOT NULL DEFAULT 0,
    suggested_offering INTEGER NOT NULL DEFAULT 0,
    suggested_special INTEGER NOT NULL DEFAULT 0,
    suggestion_source TEXT NOT NULL,
    suggestion_detail TEXT,
    tithe INTEGER NOT NULL DEFAULT 0,
    offering INTEGER NOT NULL DEFAULT 0,
    special INTEGER NOT NULL DEFAULT 0,
    not_mine INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    edited_at TEXT,
    FOREIGN KEY (statement_id) REFERENCES giver_statements(id) ON DELETE CASCADE,
    FOREIGN KEY (bank_line_id) REFERENCES bank_statement_lines(id),
    UNIQUE (statement_id, bank_line_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_giver_statements_key ON giver_statements(giver_key, status)`,
];

export function applyGiverSchema(db: Database.Database): void {
  for (const sql of GIVER_SCHEMA_SQL) db.exec(sql);
  const cols = db.prepare("PRAGMA table_info(bank_statement_lines)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "counterparty")) {
    // Who sent or received the money, as printed on the statement. The bank's
    // CSV export drops it, so PDF imports fill it in.
    db.exec("ALTER TABLE bank_statement_lines ADD COLUMN counterparty TEXT");
  }
}

// ------------------------------------------------------------------ helpers

/** Sender name from a Mandiri remark: "…DARI NAME…" or "…BANKCODE/NAME 1234…". */
export function senderFromRemark(text: string): string | null {
  const dari = text.match(/\bDARI\s+((?:[A-Z][A-Z.'-]*\s+)*[A-Z][A-Z.'-]*)\b(?![a-z])/);
  if (dari) return dari[1].replace(/\s+/g, " ").trim();
  const bank = text.match(/\b[A-Z0-9]{8}\/([A-Z][A-Z .'-]*?)(?:\s+\d|\s*$)/);
  if (bank) return bank[1].replace(/\s+/g, " ").trim();
  return null;
}

const keyOf = (name: string) => name.toUpperCase().replace(/\s+/g, " ").trim();
const titleCase = (name: string) =>
  name.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

/** WIB calendar date of a stored (UTC) post_date. */
const wibDate = (iso: string) =>
  new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

function pinMatches(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Guess a split from the giver's own words on the transfer. */
function guessFromRemark(remark: string, amount: number): GiverLineSuggestion {
  const r = remark.toLowerCase();
  const tithe = /\b(perpuluhan|pepuluhan|persepuluhan|perp\b|perpul)/.test(r);
  const terpadu = /terpadu/.test(r);
  const special = /\b(khusus|donasi|kkr|sumbangan|pembangunan|gedung)/.test(r);
  const offering = /\b(persembahan|pers\b|perse\b)/.test(r);
  if (tithe && (terpadu || offering)) {
    return {
      tithe: amount, offering: 0, special: 0,
      source: "Dari keterangan transfer",
      detail: "Keterangan menyebut perpuluhan dan persembahan — mohon isi pembagiannya.",
    };
  }
  if (tithe) return { tithe: amount, offering: 0, special: 0, source: "Dari keterangan transfer", detail: null };
  if (special) return { tithe: 0, offering: 0, special: amount, source: "Dari keterangan transfer", detail: null };
  if (terpadu || offering) return { tithe: 0, offering: amount, special: 0, source: "Dari keterangan transfer", detail: null };
  return { tithe: 0, offering: 0, special: 0, source: "Belum diketahui", detail: "Mohon isi pembagiannya." };
}

type BankLineRow = {
  id: number;
  import_id: number;
  line_no: number;
  post_date: string;
  signed_amount: number;
  remarks: string | null;
  additional_desc: string | null;
  counterparty: string | null;
  match_status: string;
  linked_account_id: number | null;
  account_name: string | null;
};

type BookRow = {
  id: number;
  type: string;
  sub_type: string;
  service_label: string | null;
  amount: number;
  notes: string | null;
  party_id: number | null;
  party_name: string | null;
};

type ContributionLine = {
  line: BankLineRow;
  sender: string;
  date: string;
  amount: number;
  remark: string;
  suggestion: GiverLineSuggestion;
};

export function createGiverStatementDb(db: Database.Database, secret: string) {
  const bookRowsFor = (line: { import_id: number; line_no: number }) =>
    db
      .prepare(
        `SELECT t.id, t.type, t.sub_type, t.service_label, t.amount, t.notes, t.party_id, p.name AS party_name
         FROM transactions t LEFT JOIN parties p ON p.id = t.party_id
         WHERE t.reference_no = ? AND t.status != 'void'`,
      )
      .all(`BANK:${line.import_id}:${line.line_no}`) as BookRow[];

  /** Split currently in the books for a bank line, in giver terms. */
  function bookSplit(rows: BookRow[]) {
    let tithe = 0, offering = 0, special = 0, other = 0;
    for (const r of rows) {
      if (r.type !== "income") continue;
      if (r.sub_type === "tithe") tithe += r.amount;
      else if (r.sub_type === "offering") {
        if ((r.service_label || "").trim() === TERPADU) offering += r.amount;
        else special += r.amount;
      } else other += r.amount;
    }
    return { tithe, offering, special, other };
  }

  function suggestionFromBooks(rows: BookRow[], senderName: string): GiverLineSuggestion {
    const split = bookSplit(rows);
    const notes = rows.map((r) => r.notes || "").join(" ");
    const source = /konfirmasi/i.test(notes)
      ? "Konfirmasi bendahara"
      : /Kwitansi/i.test(notes)
        ? "Sesuai kwitansi"
        : /Pola bulanan/i.test(notes)
          ? "Pola bulanan"
          : "Catatan buku";
    const gifts = rows.filter((r) => r.type === "income" && ["tithe", "offering"].includes(r.sub_type));
    const parties = new Set(gifts.map((r) => r.party_name).filter(Boolean));
    const onBehalf =
      parties.size > 1 || (parties.size === 1 && keyOf([...parties][0] as string) !== keyOf(senderName));
    const detail = onBehalf
      ? "Dicatat atas nama: " +
        gifts
          .map((r) => {
            const kind =
              r.sub_type === "tithe"
                ? "perpuluhan"
                : (r.service_label || "") === TERPADU
                  ? "persembahan"
                  : "persembahan khusus";
            return `${r.party_name} (${kind} ${rupiah(r.amount)})`;
          })
          .join(", ")
      : null;
    return { tithe: split.tithe, offering: split.offering, special: split.special, source, detail };
  }

  /** Every incoming bank line in the books period that is someone's gift (or still unclassified). */
  function contributionLines(): ContributionLine[] {
    const lines = db
      .prepare(
        `SELECT l.id, l.import_id, l.line_no, l.post_date, l.signed_amount, l.remarks, l.additional_desc,
                l.counterparty, l.match_status, i.linked_account_id, a.name AS account_name
         FROM bank_statement_lines l
         JOIN bank_statement_imports i ON i.id = l.import_id
         LEFT JOIN accounts a ON a.id = i.linked_account_id
         WHERE l.signed_amount > 0 AND l.match_status != 'ignored' AND date(i.period_from) >= date(?)
         ORDER BY l.post_date`,
      )
      .all(BOOKS_START) as BankLineRow[];

    const out: ContributionLine[] = [];
    for (const line of lines) {
      const text = `${line.remarks || ""} ${line.additional_desc || ""}`;
      const rawRemark = (line.remarks || "").replace(/\s*\[PERLU_REVIEW\].*$/, "").trim();
      const rows = bookRowsFor(line);
      const split = bookSplit(rows);
      const isGift = split.tithe + split.offering + split.special > 0;
      const isUnclassified = line.match_status === "unmatched";
      if (!isGift && !isUnclassified) continue; // deposits, transfers, grants, interest

      const sender =
        line.counterparty ||
        senderFromRemark(text) ||
        rows.find((r) => r.party_name)?.party_name ||
        null;
      if (!sender) continue;
      const amount = Math.round(line.signed_amount);
      // Only gift lines that are wholly a gift belong on a statement.
      if (isGift && split.other > 0) continue;
      out.push({
        line,
        sender: titleCase(sender),
        date: wibDate(line.post_date),
        amount,
        remark: rawRemark,
        suggestion: isGift ? suggestionFromBooks(rows, sender) : guessFromRemark(text, amount),
      });
    }
    return out;
  }

  const latestStatement = (key: string) =>
    db
      .prepare(
        `SELECT * FROM giver_statements WHERE giver_key = ? AND status != 'superseded'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(key) as GiverStatement | undefined;

  const statementLines = (statementId: number) =>
    db
      .prepare("SELECT * FROM giver_statement_lines WHERE statement_id = ? ORDER BY txn_date, id")
      .all(statementId) as GiverStatementLine[];

  return {
    /** Everyone who gave by bank transfer, with the state of their statement. */
    listGivers(): GiverSummary[] {
      const groups = new Map<string, GiverSummary>();
      for (const c of contributionLines()) {
        const key = keyOf(c.sender);
        const g = groups.get(key) ?? {
          giver_key: key,
          giver_name: c.sender,
          line_count: 0,
          total: 0,
          unclassified: 0,
          first_date: c.date,
          last_date: c.date,
          statement: null,
        };
        g.line_count += 1;
        g.total += c.amount;
        if (c.line.match_status === "unmatched") g.unclassified += 1;
        g.last_date = c.date;
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        const s = latestStatement(g.giver_key);
        g.statement = s
          ? {
              id: s.id,
              token: s.token,
              status: s.status,
              created_at: s.created_at,
              opened_at: s.opened_at,
              submitted_at: s.submitted_at,
              applied_at: s.applied_at,
              changed_lines: s.status === "submitted" ? this.diff(s.id).filter((d) => d.changed).length : 0,
            }
          : null;
      }
      return [...groups.values()].sort((a, b) => b.total - a.total);
    },

    /**
     * Creates a fresh statement for a giver (replacing any unapplied one) and
     * returns the link token and the PIN. The PIN is shown only now.
     */
    createStatement(giverKey: string): { statement: GiverStatement; pin: string } {
      const lines = contributionLines().filter((c) => keyOf(c.sender) === giverKey);
      if (!lines.length) throw new Error("Tidak ada transfer untuk pemberi ini.");
      const now = new Date().toISOString();
      const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const token = randomBytes(9).toString("base64url");

      const tx = db.transaction(() => {
        db.prepare(
          `UPDATE giver_statements SET status = 'superseded', updated_at = ?
           WHERE giver_key = ? AND status IN ('sent', 'opened', 'submitted')`,
        ).run(now, giverKey);
        const id = Number(
          db
            .prepare(
              `INSERT INTO giver_statements (giver_key, giver_name, token, pin_hash, period_from, period_to, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
            )
            .run(giverKey, lines[0].sender, token, hashPin(pin), lines[0].date, lines.at(-1)!.date, now, now)
            .lastInsertRowid,
        );
        const insert = db.prepare(
          `INSERT INTO giver_statement_lines
             (statement_id, bank_line_id, txn_date, amount, remark, account_label,
              suggested_tithe, suggested_offering, suggested_special, suggestion_source, suggestion_detail,
              tithe, offering, special)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const c of lines) {
          const s = c.suggestion;
          insert.run(
            id, c.line.id, c.date, c.amount, c.remark, c.line.account_name,
            s.tithe, s.offering, s.special, s.source, s.detail,
            s.tithe, s.offering, s.special,
          );
        }
        return id;
      });
      const id = tx();
      return { statement: db.prepare("SELECT * FROM giver_statements WHERE id = ?").get(id) as GiverStatement, pin };
    },

    byToken(token: string): GiverStatement | undefined {
      return db
        .prepare("SELECT * FROM giver_statements WHERE token = ? AND status != 'superseded'")
        .get(token) as GiverStatement | undefined;
    },

    byId(id: number): GiverStatement | undefined {
      return db.prepare("SELECT * FROM giver_statements WHERE id = ?").get(id) as GiverStatement | undefined;
    },

    lines: statementLines,

    /** Checks a PIN, counting failures and locking after too many. */
    checkPin(statement: GiverStatement, pin: string): { ok: true } | { ok: false; error: string } {
      const now = new Date();
      if (statement.locked_until && new Date(statement.locked_until) > now) {
        return { ok: false, error: `Terlalu banyak percobaan. Coba lagi setelah ${LOCK_MINUTES} menit.` };
      }
      if (/^\d{6}$/.test(pin.trim()) && pinMatches(pin.trim(), statement.pin_hash)) {
        db.prepare(
          `UPDATE giver_statements SET failed_attempts = 0, locked_until = NULL,
             status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END,
             opened_at = COALESCE(opened_at, ?), updated_at = ? WHERE id = ?`,
        ).run(now.toISOString(), now.toISOString(), statement.id);
        return { ok: true };
      }
      const attempts = statement.failed_attempts + 1;
      const lock = attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() : null;
      db.prepare(
        "UPDATE giver_statements SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?",
      ).run(lock ? 0 : attempts, lock, now.toISOString(), statement.id);
      return {
        ok: false,
        error: lock
          ? `PIN salah ${MAX_ATTEMPTS} kali. Halaman dikunci ${LOCK_MINUTES} menit.`
          : `PIN salah. Sisa ${MAX_ATTEMPTS - attempts} percobaan.`,
      };
    },

    /** Cookie value proving the PIN was entered; changes if the PIN is reissued. */
    sessionValue(statement: GiverStatement): string {
      if (!secret) throw new Error("AUTH_SECRET is required for giver statement sessions.");
      return createHmac("sha256", secret).update(`${statement.id}:${statement.pin_hash}`).digest("base64url");
    },

    isEditable(statement: GiverStatement): boolean {
      return statement.status === "sent" || statement.status === "opened";
    },

    /** Saves the giver's split for one line. The parts must add up to the transfer. */
    saveLine(
      statement: GiverStatement,
      lineId: number,
      input: { tithe: number; offering: number; special: number; not_mine: boolean; note: string },
    ): GiverStatementLine {
      if (!this.isEditable(statement)) throw new Error("Konfirmasi sudah dikirim dan tidak bisa diubah lagi.");
      const line = db
        .prepare("SELECT * FROM giver_statement_lines WHERE id = ? AND statement_id = ?")
        .get(lineId, statement.id) as GiverStatementLine | undefined;
      if (!line) throw new Error("Baris tidak ditemukan.");
      const parts = [input.tithe, input.offering, input.special].map((n) => Math.round(Number(n) || 0));
      if (parts.some((n) => n < 0)) throw new Error("Jumlah tidak boleh negatif.");
      const sum = parts.reduce((a, b) => a + b, 0);
      if (!input.not_mine && sum !== line.amount) {
        throw new Error(`Jumlah pembagian ${rupiah(sum)} harus sama dengan transfer ${rupiah(line.amount)}.`);
      }
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE giver_statement_lines SET tithe = ?, offering = ?, special = ?, not_mine = ?, note = ?, edited_at = ?
         WHERE id = ?`,
      ).run(...parts, input.not_mine ? 1 : 0, (input.note || "").slice(0, 500) || null, now, lineId);
      db.prepare("UPDATE giver_statements SET updated_at = ? WHERE id = ?").run(now, statement.id);
      return db.prepare("SELECT * FROM giver_statement_lines WHERE id = ?").get(lineId) as GiverStatementLine;
    },

    submit(statement: GiverStatement, note: string): void {
      if (!this.isEditable(statement)) throw new Error("Konfirmasi sudah dikirim.");
      const open = statementLines(statement.id).filter(
        (l) => !l.not_mine && l.tithe + l.offering + l.special !== l.amount,
      );
      if (open.length) throw new Error(`Masih ada ${open.length} transfer yang belum diisi pembagiannya.`);
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE giver_statements SET status = 'submitted', giver_note = ?, submitted_at = ?, updated_at = ? WHERE id = ?`,
      ).run((note || "").slice(0, 1000) || null, now, now, statement.id);
    },

    /** Giver's answer for each line next to what the books hold now. */
    diff(statementId: number) {
      return statementLines(statementId).map((l) => {
        const bank = db
          .prepare("SELECT import_id, line_no FROM bank_statement_lines WHERE id = ?")
          .get(l.bank_line_id) as { import_id: number; line_no: number };
        const books = bookSplit(bookRowsFor(bank));
        const changed =
          !l.not_mine && (books.tithe !== l.tithe || books.offering !== l.offering || books.special !== l.special);
        return { ...l, books: { tithe: books.tithe, offering: books.offering, special: books.special }, changed };
      });
    },

    /**
     * Writes a submitted statement into the books. Only lines whose split
     * differs from the books change: their gift transactions are voided (kept
     * for audit) and replaced, attributed to the party already on the line
     * when there was exactly one, otherwise to the giver.
     */
    apply(statementId: number): { changed: number; skipped_not_mine: number } {
      const statement = this.byId(statementId);
      if (!statement || statement.status !== "submitted") throw new Error("Hanya konfirmasi yang sudah dikirim yang bisa diterapkan.");
      const now = new Date().toISOString();
      const catId = (name: string) =>
        (db.prepare("SELECT id FROM categories WHERE kind = 'income' AND name = ?").get(name) as { id: number }).id;
      const partyFor = (name: string) => {
        const row = db.prepare("SELECT id FROM parties WHERE name = ?").get(name) as { id: number } | undefined;
        if (row) return row.id;
        return Number(
          db
            .prepare(
              `INSERT INTO parties (name, party_type, whatsapp, email, notes, is_active, created_at, updated_at)
               VALUES (?, 'member', NULL, NULL, ?, 1, ?, ?)`,
            )
            .run(name, `${TAG} dari konfirmasi pemberi`, now, now).lastInsertRowid,
        );
      };
      let changed = 0;
      let skipped = 0;

      db.transaction(() => {
        for (const d of this.diff(statementId)) {
          if (d.not_mine) { skipped++; continue; }
          if (!d.changed) continue;
          const bank = db
            .prepare(
              `SELECT l.id, l.import_id, l.line_no, i.linked_account_id FROM bank_statement_lines l
               JOIN bank_statement_imports i ON i.id = l.import_id WHERE l.id = ?`,
            )
            .get(d.bank_line_id) as { id: number; import_id: number; line_no: number; linked_account_id: number | null };
          const ref = `BANK:${bank.import_id}:${bank.line_no}`;
          const old = bookRowsFor(bank).filter((r) => r.type === "income" && ["tithe", "offering"].includes(r.sub_type));
          const oldParties = new Set(old.map((r) => r.party_id).filter(Boolean));
          const partyId = oldParties.size === 1 ? [...oldParties][0] : partyFor(statement.giver_name);
          for (const r of old) {
            db.prepare("UPDATE transactions SET status = 'void', notes = COALESCE(notes, '') || ?, updated_at = ? WHERE id = ?")
              .run(` ${TAG} diganti konfirmasi pemberi #${statementId}`, now, r.id);
          }
          const note = `${TAG} Konfirmasi ${statement.giver_name} #${statementId}${d.note ? ` — ${d.note}` : ""}`;
          const insert = db.prepare(
            `INSERT INTO transactions
               (type, sub_type, party_id, category_id, account_id, amount, txn_date, payment_method, service_label,
                reference_no, status, notes, created_by, approved_by, approved_at, created_at, updated_at)
             VALUES ('income', ?, ?, ?, ?, ?, ?, 'transfer', ?, ?, 'posted', ?, NULL, NULL, NULL, ?, ?)`,
          );
          const ids: number[] = [];
          const add = (sub: string, cat: string, amount: number, label: string) => {
            if (amount > 0) {
              ids.push(Number(insert.run(sub, partyId, catId(cat), bank.linked_account_id, amount, d.txn_date, label, ref, note, now, now).lastInsertRowid));
            }
          };
          add("tithe", "Persepuluhan", d.tithe, "Storehouse / Conference");
          add("offering", "Persembahan", d.offering, TERPADU);
          add("offering", "Persembahan", d.special, KHUSUS);
          db.prepare(
            `UPDATE bank_statement_lines SET match_status = 'matched', matched_txn_id = ?, match_confidence = 100,
               additional_desc = trim(substr(COALESCE(additional_desc, ''), 1,
                 instr(COALESCE(additional_desc, '') || '[PERLU_REVIEW]', '[PERLU_REVIEW]') - 1)),
               updated_at = ? WHERE id = ?`,
          ).run(ids[0], now, bank.id);
          for (const id of ids) {
            db.prepare(
              `INSERT INTO bank_reconciliation_matches (import_id, line_id, txn_id, action, confidence, note, created_at)
               VALUES (?, ?, ?, 'manual_match', 100, ?, ?)`,
            ).run(bank.import_id, bank.id, id, `${TAG} konfirmasi pemberi #${statementId}`, now);
          }
          const left = (db.prepare(
            "SELECT COUNT(*) AS n FROM bank_statement_lines WHERE import_id = ? AND match_status IN ('unmatched','suggested')",
          ).get(bank.import_id) as { n: number }).n;
          if (left === 0) {
            db.prepare(
              "UPDATE bank_statement_imports SET status = 'closed', closed_at = COALESCE(closed_at, ?), updated_at = ? WHERE id = ?",
            ).run(now, now, bank.import_id);
          }
          changed++;
        }
        db.prepare("UPDATE giver_statements SET status = 'applied', applied_at = ?, updated_at = ? WHERE id = ?")
          .run(now, now, statementId);
      })();
      return { changed, skipped_not_mine: skipped };
    },
  };
}
