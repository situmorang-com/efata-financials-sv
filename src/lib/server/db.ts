import Database from "better-sqlite3";
import { dev } from "$app/environment";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import type {
  Recipient,
  Batch,
  BatchItem,
  AttendanceRecord,
  AttendanceType,
  ZoomType,
  FinanceCategory,
  FinanceParty,
  FinanceAccount,
  FinanceTransaction,
} from "$lib/types.js";
import { calculateAmount } from "$lib/types.js";
import { seedRecipients } from "./seed.js";

// Proof image file storage
const DATA_DIR = join(process.cwd(), "data");
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const PROOFS_DIR = join(DATA_DIR, "proofs");
if (!existsSync(PROOFS_DIR)) {
  mkdirSync(PROOFS_DIR, { recursive: true });
}

export function getProofPath(filename: string): string {
  return join(PROOFS_DIR, filename);
}

export function saveProofFile(
  itemId: number,
  buffer: Buffer,
  extension: string,
  preferredBaseName?: string,
): string {
  const safeBase = preferredBaseName?.trim().replace(/\s+/g, "-");
  const filename = `${safeBase || `proof-${itemId}`}.${extension}`;
  writeFileSync(join(PROOFS_DIR, filename), buffer);
  return filename;
}

export function readProofFile(filename: string): Buffer | null {
  const filepath = join(PROOFS_DIR, filename);
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath);
}

export function deleteProofFile(filename: string): void {
  const filepath = join(PROOFS_DIR, filename);
  if (existsSync(filepath)) {
    unlinkSync(filepath);
  }
}

const DB_PATH = join(DATA_DIR, "efata.db");
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bank_name TEXT,
    account_number TEXT,
    whatsapp TEXT,
    keterangan TEXT,
    transfer_to_id INTEGER,
    family_group_id INTEGER,
    zoom_eligible INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (transfer_to_id) REFERENCES recipients(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'monthly',
    name TEXT NOT NULL,
    description TEXT,
    default_amount INTEGER NOT NULL DEFAULT 0,
    total_saturdays INTEGER NOT NULL DEFAULT 4,
    transport_rate INTEGER NOT NULL DEFAULT 25000,
    zoom_single_rate INTEGER NOT NULL DEFAULT 50000,
    zoom_family_rate INTEGER NOT NULL DEFAULT 30000,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS batch_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'transfer',
    saturdays_attended INTEGER NOT NULL DEFAULT 0,
    wednesdays_attended INTEGER NOT NULL DEFAULT 0,
    zoom_type TEXT NOT NULL DEFAULT 'none',
    custom_zoom_amount INTEGER NOT NULL DEFAULT 0,
    transfer_status TEXT NOT NULL DEFAULT 'pending',
    notify_status TEXT NOT NULL DEFAULT 'pending',
    transfer_at TEXT,
    notified_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES recipients(id),
    UNIQUE(batch_id, recipient_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    attendance_type TEXT NOT NULL CHECK (attendance_type IN ('saturday', 'wednesday')),
    attendance_date TEXT NOT NULL,
    attended INTEGER NOT NULL DEFAULT 1 CHECK (attended IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES recipients(id),
    UNIQUE(batch_id, recipient_id, attendance_type, attendance_date)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    party_type TEXT NOT NULL CHECK (party_type IN ('member', 'donor', 'vendor', 'other')),
    whatsapp TEXT,
    email TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    parent_id INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'bank', 'ewallet', 'other')),
    bank_name TEXT,
    account_number TEXT,
    holder_name TEXT,
    opening_balance INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    sub_type TEXT NOT NULL,
    party_id INTEGER,
    category_id INTEGER NOT NULL,
    account_id INTEGER,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    txn_date TEXT NOT NULL,
    payment_method TEXT,
    service_label TEXT,
    reference_no TEXT,
    status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'pending_approval', 'approved', 'posted', 'void')),
    notes TEXT,
    created_by INTEGER,
    approved_by INTEGER,
    approved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    entity TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bank_statement_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_no TEXT NOT NULL,
    ccy TEXT,
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    period_from TEXT,
    period_to TEXT,
    opening_balance REAL,
    closing_balance REAL,
    total_credit REAL NOT NULL DEFAULT 0,
    total_debit REAL NOT NULL DEFAULT 0,
    line_count INTEGER NOT NULL DEFAULT 0,
    linked_account_id INTEGER,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'closed')),
    close_note TEXT,
    closed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (linked_account_id) REFERENCES accounts(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    line_no INTEGER NOT NULL,
    post_date TEXT NOT NULL,
    remarks TEXT,
    additional_desc TEXT,
    description_norm TEXT,
    credit_amount REAL NOT NULL DEFAULT 0,
    debit_amount REAL NOT NULL DEFAULT 0,
    signed_amount REAL NOT NULL DEFAULT 0,
    close_balance REAL,
    line_hash TEXT NOT NULL,
    match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'suggested', 'matched', 'ignored')),
    suggested_txn_id INTEGER,
    suggestion_score INTEGER NOT NULL DEFAULT 0,
    matched_txn_id INTEGER,
    match_confidence INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (import_id) REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
    FOREIGN KEY (suggested_txn_id) REFERENCES transactions(id),
    FOREIGN KEY (matched_txn_id) REFERENCES transactions(id),
    UNIQUE(import_id, line_no)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    line_id INTEGER,
    txn_id INTEGER,
    action TEXT NOT NULL CHECK (action IN ('auto_match', 'manual_match', 'create_txn', 'ignore', 'unmatch', 'close', 'reopen')),
    confidence INTEGER,
    note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (import_id) REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
    FOREIGN KEY (line_id) REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
    FOREIGN KEY (txn_id) REFERENCES transactions(id)
  )
`);

db.exec(
  `CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(type, txn_date)`,
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_transactions_sub_type_date ON transactions(sub_type, txn_date)`,
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, txn_date)`,
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)`,
);
db.exec(`CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(party_type)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_parties_active ON parties(is_active)`);
db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_kind_name ON categories(kind, name)`,
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id)`,
);
db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id)`);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_bank_import_status ON bank_statement_imports(status, period_from, period_to)`,
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_bank_lines_import_status ON bank_statement_lines(import_id, match_status)`,
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_bank_lines_post_date ON bank_statement_lines(post_date)`,
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_bank_lines_matched_txn ON bank_statement_lines(matched_txn_id)`,
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_attendance_batch_type_date ON attendance_records(batch_id, attendance_type, attendance_date)`,
);

// --- Migration: add new columns to existing tables if they don't exist ---
function columnExists(table: string, column: string): boolean {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return info.some((col) => col.name === column);
}

function tableExists(table: string): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(table) as { name: string } | undefined;
  return Boolean(row?.name);
}

function columnNotNull(table: string, column: string): boolean {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const col = info.find((item) => item.name === column);
  return Number(col?.notnull || 0) === 1;
}

function normalizeAccountNumber(value?: string | null): string {
  return String(value || "").replace(/\D/g, "");
}

function normalizeAccountNumberSql(expr: string): string {
  return `replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(${expr}, ' ', ''), '-', ''), '.', ''), '/', ''), '(', ''), ')', ''), '+', ''), '_', ''), '*', ''), '#', '')`;
}

function backfillReconciliationLinkedAccounts(): void {
  if (!tableExists("bank_statement_imports")) return;
  if (!tableExists("accounts")) return;
  if (!columnExists("bank_statement_imports", "linked_account_id")) return;

  const accounts = db
    .prepare(
      "SELECT id, account_number FROM accounts WHERE is_active = 1 AND account_number IS NOT NULL",
    )
    .all() as Array<{ id: number; account_number: string | null }>;

  const accountMap = new Map<string, number>();
  const ambiguous = new Set<string>();
  for (const account of accounts) {
    const normalized = normalizeAccountNumber(account.account_number);
    if (!normalized) continue;
    if (accountMap.has(normalized)) {
      ambiguous.add(normalized);
      accountMap.delete(normalized);
      continue;
    }
    if (!ambiguous.has(normalized)) {
      accountMap.set(normalized, account.id);
    }
  }

  const imports = db
    .prepare(
      "SELECT id, account_no FROM bank_statement_imports WHERE linked_account_id IS NULL",
    )
    .all() as Array<{ id: number; account_no: string | null }>;

  const now = new Date().toISOString();
  const updateLinked = db.prepare(
    "UPDATE bank_statement_imports SET linked_account_id = ?, updated_at = ? WHERE id = ?",
  );

  for (const item of imports) {
    const normalized = normalizeAccountNumber(item.account_no);
    const matchId = normalized ? accountMap.get(normalized) : undefined;
    if (!matchId) continue;
    updateLinked.run(matchId, now, item.id);
  }
}

function backfillReconciledTransactionAccounts(): void {
  if (!tableExists("transactions")) return;
  if (!tableExists("bank_statement_imports")) return;

  const rows = db
    .prepare(
      `SELECT
          t.id,
          t.reference_no,
          i.linked_account_id
       FROM transactions t
       JOIN bank_statement_imports i
         ON CAST(substr(
              t.reference_no,
              6,
              instr(substr(t.reference_no, 6), ':') - 1
            ) AS INTEGER) = i.id
       WHERE t.account_id IS NULL
         AND t.reference_no LIKE 'BANK:%'
         AND i.linked_account_id IS NOT NULL`,
    )
    .all() as Array<{
      id: number;
      reference_no: string | null;
      linked_account_id: number | null;
    }>;

  if (rows.length === 0) return;

  const now = new Date().toISOString();
  const updateTxn = db.prepare(
    "UPDATE transactions SET account_id = ?, updated_at = ? WHERE id = ?",
  );

  for (const row of rows) {
    if (!row.linked_account_id) continue;
    updateTxn.run(row.linked_account_id, now, row.id);
  }
}

function remapReconciliationData(): void {
  backfillReconciliationLinkedAccounts();
  backfillReconciledTransactionAccounts();
}

if (
  tableExists("bank_reconciliation_matches") &&
  columnExists("bank_reconciliation_matches", "line_id") &&
  columnNotNull("bank_reconciliation_matches", "line_id")
) {
  db.exec(`
    ALTER TABLE bank_reconciliation_matches RENAME TO bank_reconciliation_matches_old;

    CREATE TABLE bank_reconciliation_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL,
      line_id INTEGER,
      txn_id INTEGER,
      action TEXT NOT NULL CHECK (action IN ('auto_match', 'manual_match', 'create_txn', 'ignore', 'unmatch', 'close', 'reopen')),
      confidence INTEGER,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (import_id) REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
      FOREIGN KEY (line_id) REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
      FOREIGN KEY (txn_id) REFERENCES transactions(id)
    );

    INSERT INTO bank_reconciliation_matches (id, import_id, line_id, txn_id, action, confidence, note, created_at)
    SELECT id, import_id, line_id, txn_id, action, confidence, note, created_at
    FROM bank_reconciliation_matches_old;

    DROP TABLE bank_reconciliation_matches_old;
  `);
}

remapReconciliationData();

// Recipients migrations
if (!columnExists("recipients", "family_group_id")) {
  db.exec("ALTER TABLE recipients ADD COLUMN family_group_id INTEGER");
}
if (!columnExists("recipients", "zoom_eligible")) {
  db.exec(
    "ALTER TABLE recipients ADD COLUMN zoom_eligible INTEGER NOT NULL DEFAULT 1",
  );
}

// Batches migrations
if (!columnExists("batches", "total_saturdays")) {
  db.exec(
    "ALTER TABLE batches ADD COLUMN total_saturdays INTEGER NOT NULL DEFAULT 4",
  );
}
if (!columnExists("batches", "transport_rate")) {
  db.exec(
    "ALTER TABLE batches ADD COLUMN transport_rate INTEGER NOT NULL DEFAULT 25000",
  );
}
if (!columnExists("batches", "zoom_single_rate")) {
  db.exec(
    "ALTER TABLE batches ADD COLUMN zoom_single_rate INTEGER NOT NULL DEFAULT 50000",
  );
}
if (!columnExists("batches", "zoom_family_rate")) {
  db.exec(
    "ALTER TABLE batches ADD COLUMN zoom_family_rate INTEGER NOT NULL DEFAULT 30000",
  );
}
if (!columnExists("batches", "type")) {
  db.exec(
    "ALTER TABLE batches ADD COLUMN type TEXT NOT NULL DEFAULT 'monthly'",
  );
}
if (!columnExists("batches", "default_amount")) {
  db.exec(
    "ALTER TABLE batches ADD COLUMN default_amount INTEGER NOT NULL DEFAULT 0",
  );
}
if (!columnExists("batches", "status")) {
  db.exec(
    "ALTER TABLE batches ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
  );
}

// Batch items migrations
if (!columnExists("batch_items", "transfer_proof")) {
  db.exec("ALTER TABLE batch_items ADD COLUMN transfer_proof TEXT");
}
if (!columnExists("batch_items", "saturdays_attended")) {
  db.exec(
    "ALTER TABLE batch_items ADD COLUMN saturdays_attended INTEGER NOT NULL DEFAULT 0",
  );
}
if (!columnExists("batch_items", "wednesdays_attended")) {
  db.exec(
    "ALTER TABLE batch_items ADD COLUMN wednesdays_attended INTEGER NOT NULL DEFAULT 0",
  );
}
if (!columnExists("batch_items", "zoom_type")) {
  db.exec(
    "ALTER TABLE batch_items ADD COLUMN zoom_type TEXT NOT NULL DEFAULT 'none'",
  );
}
if (!columnExists("batch_items", "custom_zoom_amount")) {
  db.exec(
    "ALTER TABLE batch_items ADD COLUMN custom_zoom_amount INTEGER NOT NULL DEFAULT 0",
  );
}
if (!columnExists("batch_items", "transfer_fee")) {
  db.exec(
    "ALTER TABLE batch_items ADD COLUMN transfer_fee INTEGER NOT NULL DEFAULT 0",
  );
}
if (!columnExists("batch_items", "payment_method")) {
  db.exec(
    "ALTER TABLE batch_items ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'transfer'",
  );
}
db.exec(`
  UPDATE batch_items
  SET payment_method = CASE
    WHEN lower(trim(COALESCE(payment_method, ''))) = 'cash' THEN 'cash'
    ELSE 'transfer'
  END
`);
db.exec(`
  UPDATE batch_items
  SET wednesdays_attended = 0
  WHERE wednesdays_attended IS NULL
`);

function normalizeBatchPaymentMethod(value?: string | null): "transfer" | "cash" {
  return String(value || "").trim().toLowerCase() === "cash"
    ? "cash"
    : "transfer";
}

// --- Prepared statements - Recipients ---
const insertRecipient = db.prepare(`
  INSERT INTO recipients (name, bank_name, account_number, whatsapp, keterangan, transfer_to_id, family_group_id, zoom_eligible, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateRecipient = db.prepare(`
  UPDATE recipients
  SET name = ?, bank_name = ?, account_number = ?, whatsapp = ?, keterangan = ?, transfer_to_id = ?, family_group_id = ?, zoom_eligible = ?, is_active = ?, updated_at = ?
  WHERE id = ?
`);

const selectAllRecipients = db.prepare(`
  SELECT r.*, rt.name as transfer_to_name
  FROM recipients r
  LEFT JOIN recipients rt ON r.transfer_to_id = rt.id
  WHERE r.is_active = 1
  ORDER BY r.name
`);

const selectRecipientById = db.prepare(`
  SELECT r.*, rt.name as transfer_to_name
  FROM recipients r
  LEFT JOIN recipients rt ON r.transfer_to_id = rt.id
  WHERE r.id = ?
`);

const searchRecipients = db.prepare(`
  SELECT r.*, rt.name as transfer_to_name
  FROM recipients r
  LEFT JOIN recipients rt ON r.transfer_to_id = rt.id
  WHERE r.is_active = 1 AND (r.name LIKE ? OR r.bank_name LIKE ? OR r.account_number LIKE ? OR r.keterangan LIKE ?)
  ORDER BY r.name
`);

// --- Prepared statements - Batches ---
const insertBatch = db.prepare(`
  INSERT INTO batches (type, name, description, default_amount, total_saturdays, transport_rate, zoom_single_rate, zoom_family_rate, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateBatch = db.prepare(`
  UPDATE batches SET type = ?, name = ?, description = ?, default_amount = ?, total_saturdays = ?, transport_rate = ?, zoom_single_rate = ?, zoom_family_rate = ?, status = ?, updated_at = ?
  WHERE id = ?
`);

const deleteBatch = db.prepare("DELETE FROM batches WHERE id = ?");

const selectAllBatches = db.prepare(`
  SELECT b.*,
    COUNT(bi.id) as total_items,
    SUM(CASE WHEN bi.transfer_status = 'done' THEN 1 ELSE 0 END) as transferred_count,
    SUM(CASE WHEN bi.notify_status = 'sent' THEN 1 ELSE 0 END) as notified_count
  FROM batches b
  LEFT JOIN batch_items bi ON b.id = bi.batch_id
  GROUP BY b.id
  ORDER BY b.created_at DESC
`);

const selectBatchById = db.prepare(`
  SELECT b.*,
    COUNT(bi.id) as total_items,
    SUM(CASE WHEN bi.transfer_status = 'done' THEN 1 ELSE 0 END) as transferred_count,
    SUM(CASE WHEN bi.notify_status = 'sent' THEN 1 ELSE 0 END) as notified_count
  FROM batches b
  LEFT JOIN batch_items bi ON b.id = bi.batch_id
  WHERE b.id = ?
  GROUP BY b.id
`);

// --- Prepared statements - Batch Items ---
const insertBatchItem = db.prepare(`
  INSERT INTO batch_items (batch_id, recipient_id, amount, payment_method, saturdays_attended, wednesdays_attended, zoom_type, custom_zoom_amount, transfer_fee, transfer_status, notify_status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)
`);

const updateBatchItem = db.prepare(`
  UPDATE batch_items
  SET amount = ?, payment_method = ?, saturdays_attended = ?, wednesdays_attended = ?, zoom_type = ?, custom_zoom_amount = ?, transfer_fee = ?, transfer_status = ?, notify_status = ?, transfer_at = ?, notified_at = ?, notes = ?, transfer_proof = ?, updated_at = ?
  WHERE id = ?
`);

const deleteBatchItem = db.prepare("DELETE FROM batch_items WHERE id = ?");

const selectBatchItems = db.prepare(`
  SELECT
    bi.id, bi.batch_id, bi.recipient_id, bi.amount, bi.payment_method, bi.saturdays_attended, bi.wednesdays_attended,
    bi.zoom_type, bi.custom_zoom_amount, bi.transfer_fee, bi.transfer_status, bi.notify_status, bi.transfer_at,
    bi.notified_at, bi.notes, bi.created_at, bi.updated_at,
    (bi.transfer_proof IS NOT NULL AND bi.transfer_proof != '') AS has_transfer_proof,
    r.name AS recipient_name,
    r.bank_name,
    r.account_number,
    r.whatsapp,
    r.keterangan,
    r.transfer_to_id,
    r.family_group_id,
    rt.name AS transfer_to_name,
    COALESCE(rt.name, r.name) AS actual_account_holder,
    COALESCE(rt.bank_name, r.bank_name) AS actual_bank_name,
    COALESCE(rt.account_number, r.account_number) AS actual_account_number
  FROM batch_items bi
  JOIN recipients r ON bi.recipient_id = r.id
  LEFT JOIN recipients rt ON r.transfer_to_id = rt.id
  WHERE bi.batch_id = ?
  ORDER BY r.name
`);

const selectBatchItemById = db.prepare(`
  SELECT bi.* FROM batch_items bi WHERE bi.id = ?
`);

const checkBatchItemExists = db.prepare(`
  SELECT id FROM batch_items WHERE batch_id = ? AND recipient_id = ?
`);

const selectAttendanceRecordsByBatch = db.prepare(`
  SELECT
    id,
    batch_id,
    recipient_id,
    attendance_type,
    attendance_date,
    attended,
    created_at,
    updated_at
  FROM attendance_records
  WHERE batch_id = ?
  ORDER BY attendance_date, attendance_type, recipient_id
`);

const upsertAttendanceRecord = db.prepare(`
  INSERT INTO attendance_records (batch_id, recipient_id, attendance_type, attendance_date, attended, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(batch_id, recipient_id, attendance_type, attendance_date)
  DO UPDATE SET
    attended = excluded.attended,
    updated_at = excluded.updated_at
`);

const selectAttendanceCountsByBatch = db.prepare(`
  SELECT
    bi.id AS batch_item_id,
    bi.recipient_id,
    bi.zoom_type,
    bi.custom_zoom_amount,
    COALESCE(SUM(CASE WHEN ar.attendance_type = 'saturday' AND ar.attended = 1 THEN 1 ELSE 0 END), 0) AS saturday_count,
    COALESCE(SUM(CASE WHEN ar.attendance_type = 'wednesday' AND ar.attended = 1 THEN 1 ELSE 0 END), 0) AS wednesday_count
  FROM batch_items bi
  LEFT JOIN attendance_records ar
    ON ar.batch_id = bi.batch_id
   AND ar.recipient_id = bi.recipient_id
  WHERE bi.batch_id = ?
  GROUP BY bi.id, bi.recipient_id
`);

const selectBatchItemAttendanceByRecipient = db.prepare(`
  SELECT recipient_id, saturdays_attended, wednesdays_attended, amount
  FROM batch_items
  WHERE batch_id = ? AND recipient_id = ?
  LIMIT 1
`);

// --- Database access objects ---
export const recipientDb = {
  getAll: (): Recipient[] => {
    return selectAllRecipients.all() as Recipient[];
  },

  getById: (id: number): Recipient | undefined => {
    return selectRecipientById.get(id) as Recipient | undefined;
  },

  create: (
    recipient: Omit<
      Recipient,
      "id" | "created_at" | "updated_at" | "transfer_to_name"
    >,
  ): Recipient => {
    const now = new Date().toISOString();
    const result = insertRecipient.run(
      recipient.name,
      recipient.bank_name || null,
      recipient.account_number || null,
      recipient.whatsapp || null,
      recipient.keterangan || null,
      recipient.transfer_to_id || null,
      recipient.family_group_id ?? null,
      recipient.zoom_eligible ?? 1,
      recipient.is_active ?? 1,
      now,
      now,
    );
    return {
      id: result.lastInsertRowid as number,
      ...recipient,
      created_at: now,
      updated_at: now,
    };
  },

  update: (id: number, data: Partial<Recipient>): boolean => {
    const existing = selectRecipientById.get(id) as Recipient | undefined;
    if (!existing) return false;
    const now = new Date().toISOString();
    const updated = { ...existing, ...data };
    const result = updateRecipient.run(
      updated.name,
      updated.bank_name || null,
      updated.account_number || null,
      updated.whatsapp || null,
      updated.keterangan || null,
      updated.transfer_to_id || null,
      updated.family_group_id ?? null,
      updated.zoom_eligible ?? 1,
      updated.is_active,
      now,
      id,
    );
    return result.changes > 0;
  },

  softDelete: (id: number): boolean => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        "UPDATE recipients SET is_active = 0, updated_at = ? WHERE id = ?",
      )
      .run(now, id);
    return result.changes > 0;
  },

  search: (query: string): Recipient[] => {
    const term = `%${query}%`;
    return searchRecipients.all(term, term, term, term) as Recipient[];
  },

  findByName: (name: string): Recipient | undefined => {
    return db
      .prepare("SELECT * FROM recipients WHERE name = ? AND is_active = 1")
      .get(name) as Recipient | undefined;
  },

  getNextFamilyGroupId: (): number => {
    const result = db
      .prepare("SELECT MAX(family_group_id) as max_id FROM recipients")
      .get() as { max_id: number | null };
    return (result.max_id || 0) + 1;
  },

  getFamilyMembers: (familyGroupId: number): Recipient[] => {
    return db
      .prepare(
        "SELECT * FROM recipients WHERE family_group_id = ? AND is_active = 1 ORDER BY name",
      )
      .all(familyGroupId) as Recipient[];
  },

  setFamilyGroup: (
    recipientIds: number[],
    familyGroupId: number | null,
  ): number => {
    const now = new Date().toISOString();
    let count = 0;
    const tx = db.transaction(() => {
      for (const id of recipientIds) {
        const result = db
          .prepare(
            "UPDATE recipients SET family_group_id = ?, updated_at = ? WHERE id = ?",
          )
          .run(familyGroupId, now, id);
        count += result.changes;
      }
    });
    tx();
    return count;
  },
};

export const batchDb = {
  getAll: (): Batch[] => {
    return selectAllBatches.all() as Batch[];
  },

  getById: (id: number): Batch | undefined => {
    return selectBatchById.get(id) as Batch | undefined;
  },

  create: (batch: {
    type?: "monthly" | "special";
    name: string;
    description?: string;
    default_amount?: number;
    total_saturdays?: number;
    transport_rate?: number;
    zoom_single_rate?: number;
    zoom_family_rate?: number;
  }): Batch => {
    const now = new Date().toISOString();
    const type = batch.type ?? "monthly";
    const totalSat = batch.total_saturdays ?? 4;
    const tRate = batch.transport_rate ?? 25000;
    const zSingle = batch.zoom_single_rate ?? 50000;
    const zFamily = batch.zoom_family_rate ?? 30000;
    const defaultAmt =
      type === "special"
        ? (batch.default_amount ?? 0)
        : (batch.default_amount ?? totalSat * tRate);
    const result = insertBatch.run(
      type,
      batch.name,
      batch.description || null,
      defaultAmt,
      totalSat,
      tRate,
      zSingle,
      zFamily,
      "active",
      now,
      now,
    );
    return {
      id: result.lastInsertRowid as number,
      type,
      name: batch.name,
      description: batch.description,
      default_amount: defaultAmt,
      total_saturdays: totalSat,
      transport_rate: tRate,
      zoom_single_rate: zSingle,
      zoom_family_rate: zFamily,
      status: "active",
      created_at: now,
      updated_at: now,
      total_items: 0,
      transferred_count: 0,
      notified_count: 0,
    };
  },

  update: (id: number, data: Partial<Batch>): boolean => {
    const existing = selectBatchById.get(id) as Batch | undefined;
    if (!existing) return false;
    const now = new Date().toISOString();
    const updated = { ...existing, ...data };
    const result = updateBatch.run(
      updated.type,
      updated.name,
      updated.description || null,
      updated.default_amount,
      updated.total_saturdays,
      updated.transport_rate,
      updated.zoom_single_rate,
      updated.zoom_family_rate,
      updated.status,
      now,
      id,
    );
    return result.changes > 0;
  },

  delete: (id: number): boolean => {
    const result = deleteBatch.run(id);
    return result.changes > 0;
  },
};

function ensureExpenseCategoryId(name: string): number {
  const existing = db
    .prepare(
      "SELECT id FROM categories WHERE kind = 'expense' AND name = ? LIMIT 1",
    )
    .get(name) as { id: number } | undefined;
  if (existing?.id) return existing.id;

  const now = new Date().toISOString();
  const result = db
    .prepare(
      "INSERT INTO categories (name, kind, parent_id, is_active, created_at, updated_at) VALUES (?, 'expense', NULL, 1, ?, ?)",
    )
    .run(name, now, now);
  return Number(result.lastInsertRowid);
}

function ensureIncomeCategoryId(name: string): number {
  const existing = db
    .prepare(
      "SELECT id FROM categories WHERE kind = 'income' AND name = ? LIMIT 1",
    )
    .get(name) as { id: number } | undefined;
  if (existing?.id) return existing.id;

  const now = new Date().toISOString();
  const result = db
    .prepare(
      "INSERT INTO categories (name, kind, parent_id, is_active, created_at, updated_at) VALUES (?, 'income', NULL, 1, ?, ?)",
    )
    .run(name, now, now);
  return Number(result.lastInsertRowid);
}

function toBatchMonthLabel(batchName?: string | null): string {
  if (!batchName) return "";
  return batchName.replace(/^transfer\s+/i, "").trim();
}

function buildBatchExpenseLabel(
  batchName?: string | null,
  batchDescription?: string | null,
): string {
  const parts = ["Bantuan Sosial"];
  const description = (batchDescription || "").trim();
  const monthPart = toBatchMonthLabel(batchName);
  if (description) parts.push(description);
  if (monthPart) parts.push(monthPart);
  return parts.join(" ");
}

function voidLegacyPerItemTransferExpenses(batchId: number): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE transactions
     SET status = 'void', updated_at = ?
     WHERE reference_no IN (
       SELECT 'BATCH-ITEM-' || CAST(id AS TEXT)
       FROM batch_items
       WHERE batch_id = ?
     )
       AND status != 'void'`,
  ).run(now, batchId);
}

function upsertExpenseTransaction(
  ref: string,
  categoryId: number,
  amount: number,
  txnDate: string,
  serviceLabel: string,
  notes: string,
  now: string,
): void {
  const existing = db
    .prepare(
      "SELECT id FROM transactions WHERE reference_no = ? ORDER BY id DESC LIMIT 1",
    )
    .get(ref) as { id: number } | undefined;

  if (amount <= 0) {
    if (existing?.id) {
      db.prepare(
        "UPDATE transactions SET status = 'void', updated_at = ? WHERE id = ?",
      ).run(now, existing.id);
    }
    return;
  }

  if (existing?.id) {
    db.prepare(
      `UPDATE transactions
       SET type = 'expense', sub_type = 'expense', category_id = ?, amount = ?, txn_date = ?, payment_method = 'transfer', service_label = ?, status = 'posted', notes = ?, updated_at = ?
       WHERE id = ?`,
    ).run(categoryId, amount, txnDate, serviceLabel, notes, now, existing.id);
    return;
  }

  db.prepare(
    `INSERT INTO transactions
    (type, sub_type, party_id, category_id, account_id, amount, txn_date, payment_method, service_label, reference_no, status, notes, created_by, approved_by, approved_at, created_at, updated_at)
    VALUES ('expense', 'expense', NULL, ?, NULL, ?, ?, 'transfer', ?, ?, 'posted', ?, NULL, NULL, NULL, ?, ?)`,
  ).run(categoryId, amount, txnDate, serviceLabel, ref, notes, now, now);
}

function syncBatchTransferExpense(batchId: number): void {
  const summary = db
    .prepare(
      `SELECT
         b.id,
         b.name AS batch_name,
         b.description AS batch_description,
         COALESCE(SUM(CASE WHEN bi.transfer_status = 'done' THEN bi.amount ELSE 0 END), 0) AS total_amount,
         COALESCE(SUM(CASE WHEN bi.transfer_status = 'done' THEN bi.transfer_fee ELSE 0 END), 0) AS total_fee,
         COALESCE(SUM(CASE WHEN bi.transfer_status = 'done' THEN 1 ELSE 0 END), 0) AS done_count,
         MAX(CASE WHEN bi.transfer_status = 'done' THEN bi.transfer_at ELSE NULL END) AS latest_transfer_at
       FROM batches b
       LEFT JOIN batch_items bi ON bi.batch_id = b.id
       WHERE b.id = ?
       GROUP BY b.id`,
    )
    .get(batchId) as
    | {
        id: number;
        batch_name: string | null;
        batch_description: string | null;
        total_amount: number;
        total_fee: number;
        done_count: number;
        latest_transfer_at: string | null;
      }
    | undefined;
  if (!summary) return;

  voidLegacyPerItemTransferExpenses(batchId);

  const now = new Date().toISOString();
  const txnDate = (summary.latest_transfer_at || now).slice(0, 10);

  // 1) Bantuan Sosial (transfer amounts)
  const refAmount = `BATCH-${batchId}`;
  const categoryId = ensureExpenseCategoryId("Bantuan Sosial");
  const serviceLabel = buildBatchExpenseLabel(
    summary.batch_name,
    summary.batch_description,
  );
  const notesAmount = `[AUTO_BATCH_TRANSFER] ${summary.done_count} transfer pada batch ${summary.batch_name || `#${batchId}`}`;

  if (summary.done_count <= 0 || summary.total_amount <= 0) {
    // Void both if no done transfers
    const existingAmount = db
      .prepare(
        "SELECT id FROM transactions WHERE reference_no = ? ORDER BY id DESC LIMIT 1",
      )
      .get(refAmount) as { id: number } | undefined;
    if (existingAmount?.id) {
      db.prepare(
        "UPDATE transactions SET status = 'void', updated_at = ? WHERE id = ?",
      ).run(now, existingAmount.id);
    }
    const refFee = `BATCH-${batchId}-FEE`;
    const existingFee = db
      .prepare(
        "SELECT id FROM transactions WHERE reference_no = ? ORDER BY id DESC LIMIT 1",
      )
      .get(refFee) as { id: number } | undefined;
    if (existingFee?.id) {
      db.prepare(
        "UPDATE transactions SET status = 'void', updated_at = ? WHERE id = ?",
      ).run(now, existingFee.id);
    }
    return;
  }

  upsertExpenseTransaction(
    refAmount,
    categoryId,
    summary.total_amount,
    txnDate,
    serviceLabel,
    notesAmount,
    now,
  );

  // 2) Biaya Transfer Bank (separate line)
  const refFee = `BATCH-${batchId}-FEE`;
  const feeCategoryId = ensureExpenseCategoryId("Biaya Transfer Bank");
  const feeServiceLabel = `Biaya Transfer Bank \u2022 ${serviceLabel}`;
  const notesFee = `[AUTO_BATCH_TRANSFER] Biaya transfer ${summary.done_count} transaksi pada batch ${summary.batch_name || `#${batchId}`}`;

  upsertExpenseTransaction(
    refFee,
    feeCategoryId,
    summary.total_fee,
    txnDate,
    feeServiceLabel,
    notesFee,
    now,
  );
}

function capAttendance(value: number): number {
  return Math.min(4, Math.max(0, Math.round(Number(value) || 0)));
}

function syncBatchAttendanceToBatchItems(batchId: number, batch?: Batch): number {
  const targetBatch =
    batch ??
    (selectBatchById.get(batchId) as Batch | undefined);
  if (!targetBatch || targetBatch.type === "special") return 0;

  const rows = selectAttendanceCountsByBatch.all(batchId) as Array<{
    batch_item_id: number;
    recipient_id: number;
    zoom_type: ZoomType;
    custom_zoom_amount: number;
    saturday_count: number;
    wednesday_count: number;
  }>;

  const now = new Date().toISOString();
  let count = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const saturdaysAttended = capAttendance(row.saturday_count);
      const wednesdaysAttended = capAttendance(row.wednesday_count);
      const amount = calculateAmount(
        saturdaysAttended,
        targetBatch.transport_rate,
        row.zoom_type,
        targetBatch.zoom_single_rate,
        targetBatch.zoom_family_rate,
        row.custom_zoom_amount,
      );
      const result = db
        .prepare(
          `UPDATE batch_items
           SET saturdays_attended = ?, wednesdays_attended = ?, amount = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          saturdaysAttended,
          wednesdaysAttended,
          amount,
          now,
          row.batch_item_id,
        );
      count += result.changes;
    }
  });
  tx();
  syncBatchTransferExpense(batchId);
  return count;
}

function voidBatchTransferExpense(batchId: number): void {
  const now = new Date().toISOString();
  const ref = `BATCH-${batchId}`;
  const refFee = `BATCH-${batchId}-FEE`;
  db.prepare(
    "UPDATE transactions SET status = 'void', updated_at = ? WHERE reference_no IN (?, ?) AND status != 'void'",
  ).run(now, ref, refFee);
  voidLegacyPerItemTransferExpenses(batchId);
}

function countProofUsage(filename: string, excludeItemIds: number[] = []): number {
  if (!filename) return 0;
  const normalizedExcludes = Array.from(
    new Set(excludeItemIds.filter((id) => Number.isInteger(id) && id > 0)),
  );
  if (normalizedExcludes.length === 0) {
    const row = db
      .prepare(
        "SELECT COUNT(1) as count FROM batch_items WHERE transfer_proof = ?",
      )
      .get(filename) as { count: number } | undefined;
    return Number(row?.count || 0);
  }
  const placeholders = normalizedExcludes.map(() => "?").join(",");
  const row = db
    .prepare(
      `SELECT COUNT(1) as count
       FROM batch_items
       WHERE transfer_proof = ?
         AND id NOT IN (${placeholders})`,
    )
    .get(filename, ...normalizedExcludes) as { count: number } | undefined;
  return Number(row?.count || 0);
}

function cleanupProofFileIfUnused(
  filename?: string | null,
  excludeItemIds: number[] = [],
): void {
  if (!filename || filename.startsWith("data:")) return;
  const usage = countProofUsage(filename, excludeItemIds);
  if (usage === 0) {
    deleteProofFile(filename);
  }
}

export const batchItemDb = {
  getByBatchId: (batchId: number): BatchItem[] => {
    return (selectBatchItems.all(batchId) as BatchItem[]).map((item) => ({
      ...item,
      wednesdays_attended: Math.max(
        0,
        Math.round(Number(item.wednesdays_attended) || 0),
      ),
      payment_method: normalizeBatchPaymentMethod(item.payment_method),
    }));
  },

  getById: (id: number): BatchItem | undefined => {
    const item = selectBatchItemById.get(id) as BatchItem | undefined;
    if (!item) return undefined;
    return {
      ...item,
      wednesdays_attended: Math.max(
        0,
        Math.round(Number(item.wednesdays_attended) || 0),
      ),
      payment_method: normalizeBatchPaymentMethod(item.payment_method),
    };
  },

  create: (
    batchId: number,
    recipientId: number,
    amount: number,
    saturdaysAttended: number = 0,
    wednesdaysAttended: number = 0,
    zoomType: ZoomType = "none",
    customZoomAmount: number = 0,
    transferFee: number = 0,
  ): BatchItem | null => {
    const exists = checkBatchItemExists.get(batchId, recipientId);
    if (exists) return null;
    const now = new Date().toISOString();
    const result = insertBatchItem.run(
      batchId,
      recipientId,
      amount,
      "transfer",
      saturdaysAttended,
      wednesdaysAttended,
      zoomType,
      Math.max(0, Math.round(customZoomAmount || 0)),
      transferFee,
      now,
      now,
    );
    return {
      id: result.lastInsertRowid as number,
      batch_id: batchId,
      recipient_id: recipientId,
      amount,
      payment_method: "transfer",
      saturdays_attended: saturdaysAttended,
      wednesdays_attended: wednesdaysAttended,
      zoom_type: zoomType,
      custom_zoom_amount: Math.max(0, Math.round(customZoomAmount || 0)),
      transfer_fee: transferFee,
      transfer_status: "pending",
      notify_status: "pending",
      created_at: now,
      updated_at: now,
    };
  },

  update: (id: number, data: Partial<BatchItem>): boolean => {
    const existing = selectBatchItemById.get(id) as BatchItem | undefined;
    if (!existing) return false;
    const now = new Date().toISOString();
    const updated = { ...existing, ...data };
    updated.saturdays_attended = Math.max(
      0,
      Math.round(Number(updated.saturdays_attended ?? 0) || 0),
    );
    updated.wednesdays_attended = Math.max(
      0,
      Math.round(Number(updated.wednesdays_attended ?? 0) || 0),
    );
    const normalizedPaymentMethod = normalizeBatchPaymentMethod(
      updated.payment_method,
    );
    updated.payment_method = normalizedPaymentMethod;
    if (normalizedPaymentMethod === "cash") {
      updated.transfer_fee = 0;
      updated.transfer_proof = null;
    }
    const proofValue =
      normalizedPaymentMethod === "cash"
        ? null
        : data.transfer_proof !== undefined
          ? updated.transfer_proof
          : (existing.transfer_proof ?? null);
    const result = updateBatchItem.run(
      updated.amount,
      normalizedPaymentMethod,
      updated.saturdays_attended,
      updated.wednesdays_attended,
      updated.zoom_type,
      Math.max(0, Math.round(updated.custom_zoom_amount || 0)),
      updated.transfer_fee ?? 0,
      updated.transfer_status,
      updated.notify_status,
      updated.transfer_at || null,
      updated.notified_at || null,
      updated.notes || null,
      proofValue,
      now,
      id,
    );
    const changed = result.changes > 0;
    if (
      changed &&
      (data.transfer_status !== undefined ||
        data.transfer_at !== undefined ||
        data.amount !== undefined ||
        data.transfer_fee !== undefined ||
        data.payment_method !== undefined)
    ) {
      syncBatchTransferExpense(existing.batch_id);
    }
    return changed;
  },

  delete: (id: number): boolean => {
    const existing = selectBatchItemById.get(id) as BatchItem | undefined;
    const result = deleteBatchItem.run(id);
    if (existing?.batch_id) {
      syncBatchTransferExpense(existing.batch_id);
    }
    return result.changes > 0;
  },

  populate: (batchId: number, batch: Batch): number => {
    const recipients = recipientDb.getAll();
    let count = 0;
    const now = new Date().toISOString();
    const insertTransaction = db.transaction(() => {
      for (const r of recipients) {
        const exists = checkBatchItemExists.get(batchId, r.id!);
        if (!exists) {
          if (batch.type === "special") {
            insertBatchItem.run(
              batchId,
              r.id!,
              batch.default_amount,
              "transfer",
              0,
              0,
              "none",
              0,
              0,
              now,
              now,
            );
            count++;
            continue;
          }
          // Determine zoom type from recipient data
          let zoomType: ZoomType = "none";
          if (r.zoom_eligible) {
            zoomType = r.family_group_id ? "family" : "single";
          }
          // Default: 0 saturdays attended (user fills in attendance)
          const amount = calculateAmount(
            0,
            batch.transport_rate,
            zoomType,
            batch.zoom_single_rate,
            batch.zoom_family_rate,
            0,
          );
          insertBatchItem.run(
            batchId,
            r.id!,
            amount,
            "transfer",
            0,
            0,
            zoomType,
            0,
            0,
            now,
            now,
          );
          count++;
        }
      }
    });
    insertTransaction();
    return count;
  },

  getProof: (id: number): string | null => {
    const row = db
      .prepare("SELECT transfer_proof FROM batch_items WHERE id = ?")
      .get(id) as { transfer_proof: string | null } | undefined;
    return row?.transfer_proof ?? null;
  },

  setProof: (id: number, filename: string | null): boolean => {
    const existing = db
      .prepare("SELECT batch_id, transfer_proof FROM batch_items WHERE id = ?")
      .get(id) as
      | { batch_id: number; transfer_proof: string | null }
      | undefined;
    if (!existing) return false;

    const oldProof = existing.transfer_proof ?? null;
    const now = new Date().toISOString();
    const result = db
      .prepare(
        "UPDATE batch_items SET transfer_proof = ?, payment_method = 'transfer', transfer_status = ?, transfer_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        filename,
        filename ? "done" : "pending",
        filename ? now : null,
        now,
        id,
      );
    const changed = result.changes > 0;
    if (changed) {
      if (oldProof && oldProof !== filename) {
        cleanupProofFileIfUnused(oldProof, [id]);
      }
      syncBatchTransferExpense(existing.batch_id);
    }
    return changed;
  },

  setProofForGroup: (
    itemIds: number[],
    filename: string | null,
    opts?: {
      transferAt?: string | null;
      groupTransferFee?: number;
      leadItemId?: number | null;
    },
  ): number => {
    const uniqueIds = Array.from(
      new Set(
        itemIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
    if (uniqueIds.length === 0) return 0;

    const now = new Date().toISOString();
    const transferAt =
      opts?.transferAt === undefined
        ? now
        : opts.transferAt
          ? opts.transferAt
          : null;
    const sanitizedGroupFee = Math.max(
      0,
      Math.round(Number(opts?.groupTransferFee) || 0),
    );
    const leadItemId =
      opts?.leadItemId && uniqueIds.includes(Number(opts.leadItemId))
        ? Number(opts.leadItemId)
        : uniqueIds[0];
    const oldProofs = db
      .prepare(
        `SELECT id, batch_id, transfer_proof
         FROM batch_items
         WHERE id IN (${uniqueIds.map(() => "?").join(",")})`,
      )
      .all(...uniqueIds) as Array<{
      id: number;
      batch_id: number;
      transfer_proof: string | null;
    }>;

    if (oldProofs.length === 0) return 0;

    let count = 0;
    const tx = db.transaction(() => {
      for (const row of oldProofs) {
        const fee = row.id === leadItemId ? sanitizedGroupFee : 0;
        const result = db
          .prepare(
            "UPDATE batch_items SET transfer_proof = ?, payment_method = 'transfer', transfer_status = ?, transfer_at = ?, transfer_fee = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            filename,
            filename ? "done" : "pending",
            filename ? transferAt : null,
            fee,
            now,
            row.id,
          );
        count += result.changes;
      }
    });
    tx();

    for (const row of oldProofs) {
      if (!row.transfer_proof || row.transfer_proof === filename) continue;
      cleanupProofFileIfUnused(row.transfer_proof, [row.id]);
    }

    const batchIds = Array.from(new Set(oldProofs.map((row) => row.batch_id)));
    for (const batchId of batchIds) {
      syncBatchTransferExpense(batchId);
    }

    return count;
  },

  bulkUpdateTransfer: (
    itemIds: number[],
    status: "pending" | "done",
  ): number => {
    const now = new Date().toISOString();
    let count = 0;
    const updateTransaction = db.transaction(() => {
      for (const id of itemIds) {
        const result = db
          .prepare(
            "UPDATE batch_items SET transfer_status = ?, transfer_at = ?, updated_at = ? WHERE id = ?",
          )
          .run(status, status === "done" ? now : null, now, id);
        count += result.changes;
      }
    });
    updateTransaction();
    if (itemIds.length === 0) return count;
    const batchIds = db
      .prepare(
        `SELECT DISTINCT batch_id
         FROM batch_items
         WHERE id IN (${itemIds.map(() => "?").join(",")})`,
      )
      .all(...itemIds) as Array<{ batch_id: number }>;
    for (const row of batchIds) {
      syncBatchTransferExpense(row.batch_id);
    }
    return count;
  },

  bulkUpdateNotify: (
    itemIds: number[],
    status: "pending" | "sent" | "skipped",
  ): number => {
    const now = new Date().toISOString();
    let count = 0;
    const updateTransaction = db.transaction(() => {
      for (const id of itemIds) {
        const result = db
          .prepare(
            "UPDATE batch_items SET notify_status = ?, notified_at = ?, updated_at = ? WHERE id = ?",
          )
          .run(status, status === "sent" ? now : null, now, id);
        count += result.changes;
      }
    });
    updateTransaction();
    return count;
  },

  bulkUpdateSaturdays: (
    batchId: number,
    saturdays: number,
    batch: Batch,
  ): number => {
    const now = new Date().toISOString();
    const items = selectBatchItems.all(batchId) as BatchItem[];
    let count = 0;
    const updateTransaction = db.transaction(() => {
      for (const item of items) {
        const amount = calculateAmount(
          saturdays,
          batch.transport_rate,
          item.zoom_type,
          batch.zoom_single_rate,
          batch.zoom_family_rate,
          item.custom_zoom_amount,
        );
        const result = db
          .prepare(
            "UPDATE batch_items SET saturdays_attended = ?, amount = ?, updated_at = ? WHERE id = ?",
          )
          .run(saturdays, amount, now, item.id);
        count += result.changes;
      }
    });
    updateTransaction();
    syncBatchTransferExpense(batchId);
    return count;
  },
};

export const attendanceDb = {
  getByBatchId: (batchId: number): AttendanceRecord[] => {
    return selectAttendanceRecordsByBatch.all(batchId) as AttendanceRecord[];
  },

  upsert: (
    batchId: number,
    recipientId: number,
    attendanceType: AttendanceType,
    attendanceDate: string,
    attended: number,
    batch?: Batch,
  ): {
    recipient_id: number;
    saturdays_attended: number;
    wednesdays_attended: number;
    amount: number;
  } | null => {
    const now = new Date().toISOString();
    upsertAttendanceRecord.run(
      batchId,
      recipientId,
      attendanceType,
      attendanceDate,
      attended ? 1 : 0,
      now,
      now,
    );
    syncBatchAttendanceToBatchItems(batchId, batch);
    return (selectBatchItemAttendanceByRecipient.get(batchId, recipientId) as {
      recipient_id: number;
      saturdays_attended: number;
      wednesdays_attended: number;
      amount: number;
    }) ?? null;
  },

  syncToBatchItems: (batchId: number, batch?: Batch): number => {
    return syncBatchAttendanceToBatchItems(batchId, batch);
  },
};

export const financeCategoryDb = {
  getAll: (kind?: "income" | "expense"): FinanceCategory[] => {
    if (kind) {
      return db
        .prepare(
          "SELECT * FROM categories WHERE kind = ? AND is_active = 1 ORDER BY name",
        )
        .all(kind) as FinanceCategory[];
    }
    return db
      .prepare(
        "SELECT * FROM categories WHERE is_active = 1 ORDER BY kind, name",
      )
      .all() as FinanceCategory[];
  },

  getById: (id: number): FinanceCategory | undefined => {
    return db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as
      | FinanceCategory
      | undefined;
  },

  create: (data: {
    name: string;
    kind: "income" | "expense";
    parent_id?: number | null;
  }): FinanceCategory => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        "INSERT INTO categories (name, kind, parent_id, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
      )
      .run(data.name, data.kind, data.parent_id ?? null, now, now);
    return {
      id: result.lastInsertRowid as number,
      name: data.name,
      kind: data.kind,
      parent_id: data.parent_id ?? null,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };
  },

  update: (
    id: number,
    data: Partial<
      Pick<FinanceCategory, "name" | "kind" | "parent_id" | "is_active">
    >,
  ): boolean => {
    const existing = financeCategoryDb.getById(id);
    if (!existing) return false;
    const now = new Date().toISOString();
    const updated = { ...existing, ...data };
    const result = db
      .prepare(
        "UPDATE categories SET name = ?, kind = ?, parent_id = ?, is_active = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        updated.name,
        updated.kind,
        updated.parent_id ?? null,
        updated.is_active ?? 1,
        now,
        id,
      );
    return result.changes > 0;
  },

  softDelete: (id: number): boolean => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        "UPDATE categories SET is_active = 0, updated_at = ? WHERE id = ?",
      )
      .run(now, id);
    return result.changes > 0;
  },
};

export const financePartyDb = {
  getAll: (partyType?: FinanceParty["party_type"]): FinanceParty[] => {
    if (partyType) {
      return db
        .prepare(
          "SELECT * FROM parties WHERE party_type = ? AND is_active = 1 ORDER BY name",
        )
        .all(partyType) as FinanceParty[];
    }
    return db
      .prepare("SELECT * FROM parties WHERE is_active = 1 ORDER BY name")
      .all() as FinanceParty[];
  },

  getById: (id: number): FinanceParty | undefined => {
    return db.prepare("SELECT * FROM parties WHERE id = ?").get(id) as
      | FinanceParty
      | undefined;
  },

  create: (data: {
    name: string;
    party_type: FinanceParty["party_type"];
    whatsapp?: string;
    email?: string;
    notes?: string;
  }): FinanceParty => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        "INSERT INTO parties (name, party_type, whatsapp, email, notes, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
      )
      .run(
        data.name,
        data.party_type,
        data.whatsapp ?? null,
        data.email ?? null,
        data.notes ?? null,
        now,
        now,
      );
    return {
      id: result.lastInsertRowid as number,
      name: data.name,
      party_type: data.party_type,
      whatsapp: data.whatsapp,
      email: data.email,
      notes: data.notes,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };
  },

  update: (
    id: number,
    data: Partial<
      Pick<
        FinanceParty,
        "name" | "party_type" | "whatsapp" | "email" | "notes" | "is_active"
      >
    >,
  ): boolean => {
    const existing = financePartyDb.getById(id);
    if (!existing) return false;
    const now = new Date().toISOString();
    const updated = { ...existing, ...data };
    const result = db
      .prepare(
        "UPDATE parties SET name = ?, party_type = ?, whatsapp = ?, email = ?, notes = ?, is_active = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        updated.name,
        updated.party_type,
        updated.whatsapp ?? null,
        updated.email ?? null,
        updated.notes ?? null,
        updated.is_active ?? 1,
        now,
        id,
      );
    return result.changes > 0;
  },

  softDelete: (id: number): boolean => {
    const now = new Date().toISOString();
    const result = db
      .prepare("UPDATE parties SET is_active = 0, updated_at = ? WHERE id = ?")
      .run(now, id);
    return result.changes > 0;
  },
};

export const financeAccountDb = {
  getAll: (): FinanceAccount[] => {
    return db
      .prepare("SELECT * FROM accounts WHERE is_active = 1 ORDER BY name")
      .all() as FinanceAccount[];
  },

  getById: (id: number): FinanceAccount | undefined => {
    return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as
      | FinanceAccount
      | undefined;
  },

  findByAccountNumber: (accountNumber?: string | null): FinanceAccount | undefined => {
    const normalized = String(accountNumber || "").replace(/\D/g, "");
    if (!normalized) return undefined;
    const accounts = db
      .prepare("SELECT * FROM accounts WHERE is_active = 1 AND account_number IS NOT NULL")
      .all() as FinanceAccount[];
    return accounts.find(
      (account) =>
        String(account.account_number || "").replace(/\D/g, "") === normalized,
    );
  },

  create: (data: {
    name: string;
    account_type: FinanceAccount["account_type"];
    bank_name?: string;
    account_number?: string;
    holder_name?: string;
    opening_balance?: number;
  }): FinanceAccount => {
    const now = new Date().toISOString();
    const openingBalance = Math.max(0, data.opening_balance ?? 0);
    const result = db
      .prepare(
        "INSERT INTO accounts (name, account_type, bank_name, account_number, holder_name, opening_balance, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
      )
      .run(
        data.name,
        data.account_type,
        data.bank_name ?? null,
        data.account_number ?? null,
        data.holder_name ?? null,
        openingBalance,
        now,
        now,
      );
    const created = {
      id: result.lastInsertRowid as number,
      name: data.name,
      account_type: data.account_type,
      bank_name: data.bank_name,
      account_number: data.account_number,
      holder_name: data.holder_name,
      opening_balance: openingBalance,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };
    remapReconciliationData();
    return created;
  },

  update: (
    id: number,
    data: Partial<
      Pick<
        FinanceAccount,
        | "name"
        | "account_type"
        | "bank_name"
        | "account_number"
        | "holder_name"
        | "opening_balance"
        | "is_active"
      >
    >,
  ): boolean => {
    const existing = financeAccountDb.getById(id);
    if (!existing) return false;
    const now = new Date().toISOString();
    const updated = { ...existing, ...data };
    const result = db
      .prepare(
        "UPDATE accounts SET name = ?, account_type = ?, bank_name = ?, account_number = ?, holder_name = ?, opening_balance = ?, is_active = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        updated.name,
        updated.account_type,
        updated.bank_name ?? null,
        updated.account_number ?? null,
        updated.holder_name ?? null,
        Math.max(0, updated.opening_balance ?? 0),
        updated.is_active ?? 1,
        now,
        id,
      );
    if (result.changes > 0) {
      remapReconciliationData();
      return true;
    }
    return false;
  },

  softDelete: (id: number): boolean => {
    const now = new Date().toISOString();
    const result = db
      .prepare("UPDATE accounts SET is_active = 0, updated_at = ? WHERE id = ?")
      .run(now, id);
    return result.changes > 0;
  },
};

export const financeTransactionDb = {
  getAll: (filters?: {
    type?: "income" | "expense";
    sub_type?: "tithe" | "offering" | "other_income" | "expense";
    status?: "draft" | "pending_approval" | "approved" | "posted" | "void";
    from?: string;
    to?: string;
    category_id?: number;
    party_id?: number;
    q?: string;
  }): FinanceTransaction[] => {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filters?.type) {
      where.push("t.type = ?");
      params.push(filters.type);
    }
    if (filters?.sub_type) {
      where.push("t.sub_type = ?");
      params.push(filters.sub_type);
    }
    if (filters?.status) {
      where.push("t.status = ?");
      params.push(filters.status);
    }
    if (filters?.from) {
      where.push("date(t.txn_date) >= date(?)");
      params.push(filters.from);
    }
    if (filters?.to) {
      where.push("date(t.txn_date) <= date(?)");
      params.push(filters.to);
    }
    if (filters?.category_id) {
      where.push("t.category_id = ?");
      params.push(filters.category_id);
    }
    if (filters?.party_id) {
      where.push("t.party_id = ?");
      params.push(filters.party_id);
    }
    if (filters?.q) {
      where.push(
        "(COALESCE(p.name, '') LIKE ? OR COALESCE(t.notes, '') LIKE ? OR COALESCE(t.reference_no, '') LIKE ?)",
      );
      const qTerm = `%${filters.q}%`;
      params.push(qTerm, qTerm, qTerm);
    }

    const sql = `
      SELECT
        t.*,
        COALESCE(t.account_id, bi.linked_account_id, fallback_a.id) AS resolved_account_id,
        COALESCE(bi.linked_account_id, fallback_a.id) AS source_linked_account_id,
        bi.account_no AS source_account_number,
        COALESCE(ba.name, fallback_a.name) AS source_account_name,
        COALESCE(ba.bank_name, fallback_a.bank_name) AS source_account_bank_name
      FROM transactions t
      LEFT JOIN parties p ON p.id = t.party_id
      LEFT JOIN bank_statement_imports bi
        ON t.reference_no LIKE 'BANK:%'
       AND CAST(
            substr(
              t.reference_no,
              6,
              instr(substr(t.reference_no, 6), ':') - 1
            ) AS INTEGER
          ) = bi.id
      LEFT JOIN accounts ba ON ba.id = bi.linked_account_id
      LEFT JOIN accounts fallback_a
        ON bi.linked_account_id IS NULL
       AND fallback_a.is_active = 1
       AND fallback_a.account_number IS NOT NULL
       AND ${normalizeAccountNumberSql("fallback_a.account_number")} = ${normalizeAccountNumberSql("bi.account_no")}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY t.txn_date DESC, t.id DESC
    `;

    return db.prepare(sql).all(...params) as FinanceTransaction[];
  },

  getById: (id: number): FinanceTransaction | undefined => {
    return db
      .prepare(
        `SELECT
           t.*,
           COALESCE(t.account_id, bi.linked_account_id, fallback_a.id) AS resolved_account_id,
           COALESCE(bi.linked_account_id, fallback_a.id) AS source_linked_account_id,
           bi.account_no AS source_account_number,
           COALESCE(ba.name, fallback_a.name) AS source_account_name,
           COALESCE(ba.bank_name, fallback_a.bank_name) AS source_account_bank_name
         FROM transactions t
         LEFT JOIN bank_statement_imports bi
           ON t.reference_no LIKE 'BANK:%'
          AND CAST(
               substr(
                 t.reference_no,
                 6,
                 instr(substr(t.reference_no, 6), ':') - 1
               ) AS INTEGER
             ) = bi.id
         LEFT JOIN accounts ba ON ba.id = bi.linked_account_id
         LEFT JOIN accounts fallback_a
           ON bi.linked_account_id IS NULL
          AND fallback_a.is_active = 1
          AND fallback_a.account_number IS NOT NULL
          AND ${normalizeAccountNumberSql("fallback_a.account_number")} = ${normalizeAccountNumberSql("bi.account_no")}
         WHERE t.id = ?`,
      )
      .get(id) as FinanceTransaction | undefined;
  },

  create: (data: {
    type: "income" | "expense";
    sub_type: "tithe" | "offering" | "other_income" | "expense";
    party_id?: number | null;
    category_id: number;
    account_id?: number | null;
    amount: number;
    txn_date: string;
    payment_method?: string;
    service_label?: string;
    reference_no?: string;
    status?: "draft" | "pending_approval" | "approved" | "posted" | "void";
    notes?: string;
    created_by?: number | null;
    approved_by?: number | null;
    approved_at?: string | null;
  }): FinanceTransaction => {
    const now = new Date().toISOString();
    const amount = Math.max(0, Math.round(data.amount || 0));
    const status =
      data.status ?? (data.type === "expense" ? "pending_approval" : "posted");
    const result = db
      .prepare(
        `INSERT INTO transactions
        (type, sub_type, party_id, category_id, account_id, amount, txn_date, payment_method, service_label, reference_no, status, notes, created_by, approved_by, approved_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.type,
        data.sub_type,
        data.party_id ?? null,
        data.category_id,
        data.account_id ?? null,
        amount,
        data.txn_date,
        data.payment_method ?? null,
        data.service_label ?? null,
        data.reference_no ?? null,
        status,
        data.notes ?? null,
        data.created_by ?? null,
        data.approved_by ?? null,
        data.approved_at ?? null,
        now,
        now,
      );

    return {
      id: result.lastInsertRowid as number,
      type: data.type,
      sub_type: data.sub_type,
      party_id: data.party_id ?? null,
      category_id: data.category_id,
      account_id: data.account_id ?? null,
      amount,
      txn_date: data.txn_date,
      payment_method: data.payment_method,
      service_label: data.service_label,
      reference_no: data.reference_no,
      status,
      notes: data.notes,
      created_by: data.created_by ?? null,
      approved_by: data.approved_by ?? null,
      approved_at: data.approved_at ?? null,
      created_at: now,
      updated_at: now,
    };
  },

  update: (id: number, data: Partial<FinanceTransaction>): boolean => {
    const existing = financeTransactionDb.getById(id);
    if (!existing) return false;
    const now = new Date().toISOString();
    const updated = { ...existing, ...data };
    const result = db
      .prepare(
        `UPDATE transactions
         SET type = ?, sub_type = ?, party_id = ?, category_id = ?, account_id = ?, amount = ?, txn_date = ?, payment_method = ?, service_label = ?, reference_no = ?, status = ?, notes = ?, created_by = ?, approved_by = ?, approved_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.type,
        updated.sub_type,
        updated.party_id ?? null,
        updated.category_id,
        updated.account_id ?? null,
        Math.max(0, Math.round(updated.amount || 0)),
        updated.txn_date,
        updated.payment_method ?? null,
        updated.service_label ?? null,
        updated.reference_no ?? null,
        updated.status,
        updated.notes ?? null,
        updated.created_by ?? null,
        updated.approved_by ?? null,
        updated.approved_at ?? null,
        now,
        id,
      );
    return result.changes > 0;
  },

  updateIncomeWithPolicy: (
    id: number,
    data: Partial<FinanceTransaction>,
    options?: { reason?: string; actor_id?: number | null; actor_email?: string | null },
  ): { success: boolean; status: number; error?: string; item?: FinanceTransaction } => {
    const existing = financeTransactionDb.getById(id);
    if (!existing) {
      return { success: false, status: 404, error: "Income transaction not found" };
    }
    if (existing.type !== "income") {
      return { success: false, status: 400, error: "Only income transaction can be edited here" };
    }

    const reason = String(options?.reason || "").trim();
    if (!reason) {
      return { success: false, status: 400, error: "Alasan perubahan wajib diisi" };
    }

    const now = new Date().toISOString();
    const updated = { ...existing, ...data };

    const changedFields: string[] = [];
    const compareKeys: Array<keyof FinanceTransaction> = [
      "sub_type",
      "party_id",
      "category_id",
      "account_id",
      "amount",
      "txn_date",
      "payment_method",
      "service_label",
      "reference_no",
      "notes",
    ];
    for (const key of compareKeys) {
      if ((existing[key] ?? null) !== (updated[key] ?? null)) {
        changedFields.push(String(key));
      }
    }

    if (changedFields.length === 0) {
      return { success: true, status: 200, item: existing };
    }

    const tagRef = String(existing.reference_no || "").toUpperCase();
    const tagNotes = String(existing.notes || "").toUpperCase();
    const hasSystemTag =
      tagRef.startsWith("BANK:") || tagNotes.includes("[BANK_RECON_IMPORT]");
    const reconRow = db
      .prepare(
        `SELECT i.status AS import_status
         FROM bank_statement_lines l
         JOIN bank_statement_imports i ON i.id = l.import_id
         WHERE l.matched_txn_id = ?
         LIMIT 1`,
      )
      .get(id) as { import_status?: "open" | "in_review" | "closed" } | undefined;
    const isReconciled = hasSystemTag || Boolean(reconRow);
    const isClosedPeriod = reconRow?.import_status === "closed";

    const protectedFields = new Set(["sub_type", "amount", "txn_date", "account_id"]);
    const touchingProtected = changedFields.filter((field) =>
      protectedFields.has(field),
    );
    if (isReconciled && touchingProtected.length > 0) {
      return {
        success: false,
        status: 409,
        error:
          "Transaksi ini sudah cocok dengan mutasi bank. Jenis, nominal, tanggal, dan akun sumber dana tidak bisa diubah langsung. Buat jurnal penyesuaian jika perlu koreksi.",
      };
    }

    const result = db
      .prepare(
        `UPDATE transactions
         SET type = ?, sub_type = ?, party_id = ?, category_id = ?, account_id = ?, amount = ?, txn_date = ?, payment_method = ?, service_label = ?, reference_no = ?, status = ?, notes = ?, created_by = ?, approved_by = ?, approved_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.type,
        updated.sub_type,
        updated.party_id ?? null,
        updated.category_id,
        updated.account_id ?? null,
        Math.max(0, Math.round(updated.amount || 0)),
        updated.txn_date,
        updated.payment_method ?? null,
        updated.service_label ?? null,
        updated.reference_no ?? null,
        updated.status,
        updated.notes ?? null,
        updated.created_by ?? null,
        updated.approved_by ?? null,
        updated.approved_at ?? null,
        now,
        id,
      );

    if (result.changes <= 0) {
      return { success: false, status: 500, error: "Gagal menyimpan perubahan income" };
    }

    const after = financeTransactionDb.getById(id);
    db.prepare(
      `INSERT INTO audit_logs (actor_id, entity, entity_id, action, before_json, after_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      options?.actor_id ?? null,
      "transaction",
      id,
      "income_update",
      JSON.stringify(existing),
      JSON.stringify({
        transaction: after ?? updated,
        _meta: {
          reason,
          actor_email: options?.actor_email ?? null,
          changed_fields: changedFields,
          reconciled: isReconciled,
          closed_period: isClosedPeriod,
        },
      }),
      now,
    );

    return { success: true, status: 200, item: after ?? undefined };
  },

  softVoid: (id: number): boolean => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        "UPDATE transactions SET status = 'void', updated_at = ? WHERE id = ?",
      )
      .run(now, id);
    return result.changes > 0;
  },

  approve: (
    id: number,
    approvedBy?: number | null,
    approvalNote?: string,
  ): boolean => {
    const existing = financeTransactionDb.getById(id);
    if (!existing) return false;
    const now = new Date().toISOString();
    const noteLine = approvalNote?.trim()
      ? `[APPROVAL ${new Date(now).toLocaleString("id-ID")}]: ${approvalNote.trim()}`
      : "";
    const mergedNotes = noteLine
      ? existing.notes
        ? `${existing.notes}\n${noteLine}`
        : noteLine
      : existing.notes;
    const result = db
      .prepare(
        "UPDATE transactions SET status = 'approved', approved_by = ?, approved_at = ?, notes = ?, updated_at = ? WHERE id = ?",
      )
      .run(approvedBy ?? null, now, mergedNotes ?? null, now, id);
    return result.changes > 0;
  },

  markPaid: (id: number): boolean => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        "UPDATE transactions SET status = 'posted', updated_at = ? WHERE id = ?",
      )
      .run(now, id);
    return result.changes > 0;
  },

  getMonthlySummary: (
    month: string,
  ): {
    month: string;
    income_total: number;
    expense_total: number;
    net_total: number;
    pending_approvals: number;
    expense_by_category: Array<{ category: string; total: number }>;
  } => {
    const monthPattern = `${month}%`;
    const incomeRow = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income' AND status != 'void' AND txn_date LIKE ?",
      )
      .get(monthPattern) as { total: number };
    const expenseRow = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense' AND status != 'void' AND txn_date LIKE ?",
      )
      .get(monthPattern) as { total: number };
    const pendingRow = db
      .prepare(
        "SELECT COUNT(*) as count FROM transactions WHERE type = 'expense' AND status = 'pending_approval' AND txn_date LIKE ?",
      )
      .get(monthPattern) as { count: number };
    const expenseByCategory = db
      .prepare(
        `SELECT c.name as category, COALESCE(SUM(t.amount), 0) as total
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.type = 'expense' AND t.status != 'void' AND t.txn_date LIKE ?
         GROUP BY t.category_id
         ORDER BY total DESC`,
      )
      .all(monthPattern) as Array<{ category: string; total: number }>;

    return {
      month,
      income_total: incomeRow.total,
      expense_total: expenseRow.total,
      net_total: incomeRow.total - expenseRow.total,
      pending_approvals: pendingRow.count,
      expense_by_category: expenseByCategory,
    };
  },

  getCashflow: (params: {
    date_from: string;
    date_to: string;
    group_by?: "day" | "week" | "month";
  }): {
    date_from: string;
    date_to: string;
    group_by: "day" | "week" | "month";
    income_total: number;
    expense_total: number;
    net_total: number;
    points: Array<{
      period: string;
      income_total: number;
      expense_total: number;
      net_total: number;
      cumulative_net: number;
    }>;
  } => {
    const groupBy = params.group_by ?? "day";
    const rows = db
      .prepare(
        `SELECT txn_date, type, amount
         FROM transactions
         WHERE status != 'void'
           AND txn_date BETWEEN ? AND ?
         ORDER BY txn_date ASC, id ASC`,
      )
      .all(params.date_from, params.date_to) as Array<{
      txn_date: string;
      type: "income" | "expense";
      amount: number;
    }>;

    const toDateKey = (d: Date): string => d.toISOString().slice(0, 10);
    const bucketFor = (dateStr: string): string => {
      if (groupBy === "day") return dateStr;
      if (groupBy === "month") return dateStr.slice(0, 7);
      const d = new Date(`${dateStr}T00:00:00.000Z`);
      const weekdayFromMonday = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - weekdayFromMonday);
      return toDateKey(d);
    };

    const buckets = new Map<
      string,
      {
        period: string;
        income_total: number;
        expense_total: number;
      }
    >();
    let incomeTotal = 0;
    let expenseTotal = 0;

    for (const row of rows) {
      const period = bucketFor(row.txn_date);
      let bucket = buckets.get(period);
      if (!bucket) {
        bucket = { period, income_total: 0, expense_total: 0 };
        buckets.set(period, bucket);
      }

      if (row.type === "income") {
        bucket.income_total += row.amount;
        incomeTotal += row.amount;
      } else if (row.type === "expense") {
        bucket.expense_total += row.amount;
        expenseTotal += row.amount;
      }
    }

    const points = Array.from(buckets.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((item) => ({
        period: item.period,
        income_total: item.income_total,
        expense_total: item.expense_total,
        net_total: item.income_total - item.expense_total,
        cumulative_net: 0,
      }));

    let runningNet = 0;
    for (const point of points) {
      runningNet += point.net_total;
      point.cumulative_net = runningNet;
    }

    return {
      date_from: params.date_from,
      date_to: params.date_to,
      group_by: groupBy,
      income_total: incomeTotal,
      expense_total: expenseTotal,
      net_total: incomeTotal - expenseTotal,
      points,
    };
  },

  getAllocationSummary: (params: {
    date_from: string;
    date_to: string;
    type?: "income" | "expense" | "all";
  }): {
    date_from: string;
    date_to: string;
    type: "income" | "expense" | "all";
    grand_total: number;
    groups: Array<{
      destination: string;
      total: number;
      tx_count: number;
      percent_of_total: number;
      sub_breakdown: Array<{
        sub_type: string;
        total: number;
        tx_count: number;
      }>;
    }>;
  } => {
    const type = params.type ?? "income";
    const where: string[] = ["status != 'void'", "txn_date BETWEEN ? AND ?"];
    const queryParams: Array<string> = [params.date_from, params.date_to];
    if (type !== "all") {
      where.push("type = ?");
      queryParams.push(type);
    }

    const rows = db
      .prepare(
        `SELECT
            COALESCE(NULLIF(TRIM(service_label), ''), 'Tanpa Tujuan') as destination,
            sub_type,
            amount
         FROM transactions
         WHERE ${where.join(" AND ")}
         ORDER BY destination ASC`,
      )
      .all(...queryParams) as Array<{
      destination: string;
      sub_type: string;
      amount: number;
    }>;

    const groupsMap = new Map<
      string,
      {
        destination: string;
        total: number;
        tx_count: number;
        subMap: Map<
          string,
          { sub_type: string; total: number; tx_count: number }
        >;
      }
    >();
    let grandTotal = 0;

    for (const row of rows) {
      grandTotal += row.amount;
      let group = groupsMap.get(row.destination);
      if (!group) {
        group = {
          destination: row.destination,
          total: 0,
          tx_count: 0,
          subMap: new Map(),
        };
        groupsMap.set(row.destination, group);
      }

      group.total += row.amount;
      group.tx_count += 1;

      const subType = row.sub_type || "unknown";
      const sub = group.subMap.get(subType) ?? {
        sub_type: subType,
        total: 0,
        tx_count: 0,
      };
      sub.total += row.amount;
      sub.tx_count += 1;
      group.subMap.set(subType, sub);
    }

    const groups = Array.from(groupsMap.values())
      .sort((a, b) => b.total - a.total)
      .map((group) => ({
        destination: group.destination,
        total: group.total,
        tx_count: group.tx_count,
        percent_of_total:
          grandTotal > 0
            ? Number(((group.total / grandTotal) * 100).toFixed(2))
            : 0,
        sub_breakdown: Array.from(group.subMap.values()).sort(
          (a, b) => b.total - a.total,
        ),
      }));

    return {
      date_from: params.date_from,
      date_to: params.date_to,
      type,
      grand_total: grandTotal,
      groups,
    };
  },
};

type BankImportCreateInput = {
  account_no: string;
  ccy?: string | null;
  file_name: string;
  file_hash: string;
  period_from?: string | null;
  period_to?: string | null;
  opening_balance?: number | null;
  closing_balance?: number | null;
  total_credit: number;
  total_debit: number;
  line_count: number;
  linked_account_id?: number | null;
  lines: Array<{
    line_no: number;
    post_date: string;
    remarks?: string | null;
    additional_desc?: string | null;
    credit_amount: number;
    debit_amount: number;
    signed_amount: number;
    close_balance?: number | null;
    line_hash: string;
  }>;
};

type ReconLineWithHints = {
  id: number;
  import_id: number;
  line_no: number;
  post_date: string;
  remarks: string | null;
  additional_desc: string | null;
  description_norm: string | null;
  credit_amount: number;
  debit_amount: number;
  signed_amount: number;
  close_balance: number | null;
  line_hash: string;
  match_status: "unmatched" | "suggested" | "matched" | "ignored";
  suggested_txn_id: number | null;
  suggestion_score: number;
  matched_txn_id: number | null;
  match_confidence: number;
  matched_type: string | null;
  matched_amount: number | null;
  matched_txn_date: string | null;
  matched_reference_no: string | null;
  matched_service_label: string | null;
  suggested_type: string | null;
  suggested_amount: number | null;
  suggested_txn_date: string | null;
  suggested_reference_no: string | null;
  suggested_service_label: string | null;
};

function normalizeReconText(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDateOnly(value: string): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function addDays(dateOnly: string, delta: number): string {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function dateDiffDays(left: string, right: string): number {
  const l = new Date(`${left}T00:00:00.000Z`).getTime();
  const r = new Date(`${right}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(l) || !Number.isFinite(r)) return 99;
  return Math.abs(Math.round((l - r) / 86400000));
}

function scoreTextSimilarity(lineText: string, txnText: string): number {
  if (!lineText || !txnText) return 0;
  const tokens = Array.from(
    new Set(lineText.split(" ").filter((t) => t.length >= 4)),
  );
  if (tokens.length === 0) return 0;
  let overlap = 0;
  for (const token of tokens) {
    if (txnText.includes(token)) overlap += 1;
  }
  return Math.min(20, overlap * 4);
}

function scoreAmount(expected: number, actual: number): number {
  const diff = Math.abs(expected - actual);
  if (diff < 0.01) return 60;
  if (diff <= 1) return 55;
  if (diff <= 50) return 42;
  if (diff <= 500) return 24;
  if (diff <= 2500) return 12;
  return 0;
}

function scoreDate(distance: number): number {
  if (distance === 0) return 25;
  if (distance === 1) return 18;
  if (distance === 2) return 10;
  return 0;
}

function pickBestTxnCandidate(
  line: {
    signed_amount: number;
    post_date: string;
    description_norm: string | null;
  },
  candidates: Array<{
    id: number;
    amount: number;
    txn_date: string;
    reference_no: string | null;
    service_label: string | null;
    notes: string | null;
  }>,
): { txn_id: number; score: number } | null {
  const expected = Math.abs(Number(line.signed_amount || 0));
  const lineDate = toDateOnly(line.post_date);
  const lineText = line.description_norm || "";

  let best: { txn_id: number; score: number } | null = null;
  for (const c of candidates) {
    const amountScore = scoreAmount(expected, Math.abs(c.amount || 0));
    const dayDistance = dateDiffDays(lineDate, toDateOnly(c.txn_date));
    const dateScore = scoreDate(dayDistance);
    const txnText = normalizeReconText(
      `${c.service_label || ""} ${c.reference_no || ""} ${c.notes || ""}`,
    );
    const textScore = scoreTextSimilarity(lineText, txnText);
    const score = Math.min(100, amountScore + dateScore + textScore);
    if (!best || score > best.score) {
      best = { txn_id: c.id, score };
    }
  }
  return best;
}

function ensureImportInReview(importId: number): void {
  db.prepare(
    `UPDATE bank_statement_imports
     SET status = CASE WHEN status = 'open' THEN 'in_review' ELSE status END,
         updated_at = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), importId);
}

export const financeReconciliationDb = {
  getImports: () => {
    return db
      .prepare(
        `SELECT i.*,
            a.name AS linked_account_name,
            a.bank_name AS linked_account_bank_name,
            a.account_number AS linked_account_number,
            COALESCE(SUM(CASE WHEN l.match_status = 'matched' THEN 1 ELSE 0 END), 0) AS matched_count,
            COALESCE(SUM(CASE WHEN l.match_status = 'suggested' THEN 1 ELSE 0 END), 0) AS suggested_count,
            COALESCE(SUM(CASE WHEN l.match_status = 'unmatched' THEN 1 ELSE 0 END), 0) AS unmatched_count,
            COALESCE(SUM(CASE WHEN l.match_status = 'ignored' THEN 1 ELSE 0 END), 0) AS ignored_count
         FROM bank_statement_imports i
         LEFT JOIN accounts a ON a.id = i.linked_account_id
         LEFT JOIN bank_statement_lines l ON l.import_id = i.id
         GROUP BY i.id
         ORDER BY COALESCE(i.period_from, i.created_at) DESC, i.id DESC`,
      )
      .all();
  },

  getImportById: (id: number) => {
    return db
      .prepare(
        `SELECT i.*,
            a.name AS linked_account_name,
            a.bank_name AS linked_account_bank_name,
            a.account_number AS linked_account_number,
            COALESCE(SUM(CASE WHEN l.match_status = 'matched' THEN 1 ELSE 0 END), 0) AS matched_count,
            COALESCE(SUM(CASE WHEN l.match_status = 'suggested' THEN 1 ELSE 0 END), 0) AS suggested_count,
            COALESCE(SUM(CASE WHEN l.match_status = 'unmatched' THEN 1 ELSE 0 END), 0) AS unmatched_count,
            COALESCE(SUM(CASE WHEN l.match_status = 'ignored' THEN 1 ELSE 0 END), 0) AS ignored_count
         FROM bank_statement_imports i
         LEFT JOIN accounts a ON a.id = i.linked_account_id
         LEFT JOIN bank_statement_lines l ON l.import_id = i.id
         WHERE i.id = ?
         GROUP BY i.id`,
      )
      .get(id);
  },

  getImportByFileHash: (fileHash: string) => {
    return db
      .prepare("SELECT * FROM bank_statement_imports WHERE file_hash = ? LIMIT 1")
      .get(fileHash);
  },

  getLineById: (lineId: number) => {
    return db
      .prepare("SELECT * FROM bank_statement_lines WHERE id = ?")
      .get(lineId);
  },

  createImport: (input: BankImportCreateInput): number => {
    const now = new Date().toISOString();
    const resolvedLinkedAccountId =
      input.linked_account_id ??
      financeAccountDb.findByAccountNumber(input.account_no)?.id ??
      null;
    const tx = db.transaction(() => {
      const importResult = db
        .prepare(
          `INSERT INTO bank_statement_imports
          (account_no, ccy, file_name, file_hash, period_from, period_to, opening_balance, closing_balance, total_credit, total_debit, line_count, linked_account_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
        )
        .run(
          input.account_no,
          input.ccy ?? null,
          input.file_name,
          input.file_hash,
          input.period_from ?? null,
          input.period_to ?? null,
          input.opening_balance ?? null,
          input.closing_balance ?? null,
          input.total_credit,
          input.total_debit,
          input.line_count,
          resolvedLinkedAccountId,
          now,
          now,
        );
      const importId = Number(importResult.lastInsertRowid);
      const insertLine = db.prepare(
        `INSERT INTO bank_statement_lines
         (import_id, line_no, post_date, remarks, additional_desc, description_norm, credit_amount, debit_amount, signed_amount, close_balance, line_hash, match_status, suggestion_score, match_confidence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unmatched', 0, 0, ?, ?)`,
      );
      for (const line of input.lines) {
        insertLine.run(
          importId,
          line.line_no,
          line.post_date,
          line.remarks ?? null,
          line.additional_desc ?? null,
          normalizeReconText(`${line.remarks || ""} ${line.additional_desc || ""}`),
          Number(line.credit_amount || 0),
          Number(line.debit_amount || 0),
          Number(line.signed_amount || 0),
          line.close_balance ?? null,
          line.line_hash,
          now,
          now,
        );
      }
      return importId;
    });
    const importId = tx();
    financeReconciliationDb.refreshSuggestions(importId, false);
    return importId;
  },

  getLines: (
    importId: number,
    status?: "unmatched" | "suggested" | "matched" | "ignored",
  ): ReconLineWithHints[] => {
    const where: string[] = ["l.import_id = ?"];
    const params: unknown[] = [importId];
    if (status) {
      where.push("l.match_status = ?");
      params.push(status);
    }
    return db
      .prepare(
        `SELECT
            l.*,
            mt.type AS matched_type,
            mt.amount AS matched_amount,
            mt.txn_date AS matched_txn_date,
            mt.reference_no AS matched_reference_no,
            mt.service_label AS matched_service_label,
            st.type AS suggested_type,
            st.amount AS suggested_amount,
            st.txn_date AS suggested_txn_date,
            st.reference_no AS suggested_reference_no,
            st.service_label AS suggested_service_label
         FROM bank_statement_lines l
         LEFT JOIN transactions mt ON mt.id = l.matched_txn_id
         LEFT JOIN transactions st ON st.id = l.suggested_txn_id
         WHERE ${where.join(" AND ")}
         ORDER BY datetime(l.post_date) ASC, l.line_no ASC, l.id ASC`,
      )
      .all(...params) as ReconLineWithHints[];
  },

  refreshSuggestions: (importId: number, autoMatch = false): number => {
    const lines = db
      .prepare(
        `SELECT id, import_id, post_date, signed_amount, description_norm
         FROM bank_statement_lines
         WHERE import_id = ? AND match_status IN ('unmatched', 'suggested')`,
      )
      .all(importId) as Array<{
      id: number;
      import_id: number;
      post_date: string;
      signed_amount: number;
      description_norm: string | null;
    }>;
    const now = new Date().toISOString();
    let changed = 0;

    for (const line of lines) {
      const expectedType = line.signed_amount >= 0 ? "income" : "expense";
      const lineDate = toDateOnly(line.post_date);
      const from = addDays(lineDate, -2);
      const to = addDays(lineDate, 2);

      const candidates = db
        .prepare(
          `SELECT id, amount, txn_date, reference_no, service_label, notes
           FROM transactions
           WHERE status != 'void'
             AND type = ?
             AND date(txn_date) BETWEEN date(?) AND date(?)
           ORDER BY txn_date DESC, id DESC
           LIMIT 80`,
        )
        .all(expectedType, from, to) as Array<{
        id: number;
        amount: number;
        txn_date: string;
        reference_no: string | null;
        service_label: string | null;
        notes: string | null;
      }>;

      const best = pickBestTxnCandidate(line, candidates);
      if (!best || best.score < 60) {
        const result = db
          .prepare(
            `UPDATE bank_statement_lines
             SET match_status = 'unmatched',
                 suggested_txn_id = NULL,
                 suggestion_score = 0,
                 updated_at = ?
             WHERE id = ?`,
          )
          .run(now, line.id);
        changed += result.changes;
        continue;
      }

      if (autoMatch && best.score >= 95) {
        const alreadyUsed = db
          .prepare(
            `SELECT id FROM bank_statement_lines
             WHERE import_id = ? AND match_status = 'matched' AND matched_txn_id = ? LIMIT 1`,
          )
          .get(importId, best.txn_id) as { id: number } | undefined;
        if (!alreadyUsed) {
          const result = db
            .prepare(
              `UPDATE bank_statement_lines
               SET match_status = 'matched',
                   matched_txn_id = ?,
                   match_confidence = ?,
                   suggested_txn_id = ?,
                   suggestion_score = ?,
                   updated_at = ?
               WHERE id = ?`,
            )
            .run(best.txn_id, best.score, best.txn_id, best.score, now, line.id);
          changed += result.changes;
          db.prepare(
            `INSERT INTO bank_reconciliation_matches (import_id, line_id, txn_id, action, confidence, note, created_at)
             VALUES (?, ?, ?, 'auto_match', ?, NULL, ?)`,
          ).run(importId, line.id, best.txn_id, best.score, now);
          ensureImportInReview(importId);
          continue;
        }
      }

      const result = db
        .prepare(
          `UPDATE bank_statement_lines
           SET match_status = 'suggested',
               suggested_txn_id = ?,
               suggestion_score = ?,
               updated_at = ?
           WHERE id = ?`,
        )
        .run(best.txn_id, best.score, now, line.id);
      changed += result.changes;
    }

    return changed;
  },

  matchLine: (lineId: number, txnId: number, note?: string): boolean => {
    const line = db
      .prepare(
        "SELECT id, import_id, suggested_txn_id, suggestion_score FROM bank_statement_lines WHERE id = ?",
      )
      .get(lineId) as
      | {
          id: number;
          import_id: number;
          suggested_txn_id: number | null;
          suggestion_score: number;
        }
      | undefined;
    if (!line) return false;
    const now = new Date().toISOString();
    const confidence =
      line.suggested_txn_id === txnId ? line.suggestion_score || 90 : 100;
    const result = db
      .prepare(
        `UPDATE bank_statement_lines
         SET match_status = 'matched',
             matched_txn_id = ?,
             match_confidence = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(txnId, confidence, now, lineId);
    if (result.changes > 0) {
      db.prepare(
        `INSERT INTO bank_reconciliation_matches (import_id, line_id, txn_id, action, confidence, note, created_at)
         VALUES (?, ?, ?, 'manual_match', ?, ?, ?)`,
      ).run(line.import_id, lineId, txnId, confidence, note?.trim() || null, now);
      ensureImportInReview(line.import_id);
    }
    return result.changes > 0;
  },

  ignoreLine: (lineId: number, note?: string): boolean => {
    const line = db
      .prepare("SELECT id, import_id FROM bank_statement_lines WHERE id = ?")
      .get(lineId) as { id: number; import_id: number } | undefined;
    if (!line) return false;
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `UPDATE bank_statement_lines
         SET match_status = 'ignored',
             suggested_txn_id = NULL,
             suggestion_score = 0,
             matched_txn_id = NULL,
             match_confidence = 0,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(now, lineId);
    if (result.changes > 0) {
      db.prepare(
        `INSERT INTO bank_reconciliation_matches (import_id, line_id, txn_id, action, confidence, note, created_at)
         VALUES (?, ?, NULL, 'ignore', NULL, ?, ?)`,
      ).run(line.import_id, lineId, note?.trim() || null, now);
      ensureImportInReview(line.import_id);
    }
    return result.changes > 0;
  },

  unmatchLine: (lineId: number, note?: string): boolean => {
    const line = db
      .prepare(
        "SELECT id, import_id, matched_txn_id FROM bank_statement_lines WHERE id = ?",
      )
      .get(lineId) as
      | { id: number; import_id: number; matched_txn_id: number | null }
      | undefined;
    if (!line) return false;
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `UPDATE bank_statement_lines
         SET match_status = 'unmatched',
             matched_txn_id = NULL,
             match_confidence = 0,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(now, lineId);
    if (result.changes > 0) {
      db.prepare(
        `INSERT INTO bank_reconciliation_matches (import_id, line_id, txn_id, action, confidence, note, created_at)
         VALUES (?, ?, ?, 'unmatch', NULL, ?, ?)`,
      ).run(
        line.import_id,
        lineId,
        line.matched_txn_id ?? null,
        note?.trim() || null,
        now,
      );
      ensureImportInReview(line.import_id);
      financeReconciliationDb.refreshSuggestions(line.import_id, false);
    }
    return result.changes > 0;
  },

  createTransactionForLine: (lineId: number): FinanceTransaction | null => {
    const line = db
      .prepare(
        `SELECT l.*, i.linked_account_id
         FROM bank_statement_lines l
         JOIN bank_statement_imports i ON i.id = l.import_id
         WHERE l.id = ?`,
      )
      .get(lineId) as
      | (Record<string, unknown> & {
          id: number;
          import_id: number;
          line_no: number;
          post_date: string;
          signed_amount: number;
          remarks: string | null;
          additional_desc: string | null;
          description_norm: string | null;
          linked_account_id: number | null;
        })
      | undefined;
    if (!line) return null;

    const expected = Math.max(0, Math.round(Math.abs(line.signed_amount || 0)));
    if (expected <= 0) return null;
    const descNorm = line.description_norm || "";
    const rawDesc = `${line.remarks || ""} ${line.additional_desc || ""}`.trim();
    const txnDate = line.post_date;
    const referenceNo = `BANK:${line.import_id}:${line.line_no}`;
    const notes = `[BANK_RECON_IMPORT] ${rawDesc}`.trim();

    let created: FinanceTransaction;
    if (line.signed_amount >= 0) {
      const isTithe =
        descNorm.includes("persepuluhan") || descNorm.includes("perpuluhan");
      const isOffering = descNorm.includes("persembahan");
      const subType = isTithe
        ? "tithe"
        : isOffering
          ? "offering"
          : "other_income";
      const categoryName = isTithe
        ? "Persepuluhan"
        : isOffering
          ? "Persembahan"
          : "Donasi";
      const categoryId = ensureIncomeCategoryId(categoryName);
      created = financeTransactionDb.create({
        type: "income",
        sub_type: subType,
        category_id: categoryId,
        account_id: line.linked_account_id ?? null,
        amount: expected,
        txn_date: txnDate,
        payment_method: "transfer",
        service_label: rawDesc.slice(0, 120) || "Bank Statement Import",
        reference_no: referenceNo,
        status: "posted",
        notes,
      });
    } else {
      const isBankFee =
        descNorm.includes("biaya adm") ||
        descNorm.includes("pajak") ||
        descNorm.includes("transfer fee");
      const categoryId = ensureExpenseCategoryId(
        isBankFee ? "Biaya Transfer Bank" : "Operasional Gereja",
      );
      created = financeTransactionDb.create({
        type: "expense",
        sub_type: "expense",
        category_id: categoryId,
        account_id: line.linked_account_id ?? null,
        amount: expected,
        txn_date: txnDate,
        payment_method: "transfer",
        service_label: rawDesc.slice(0, 120) || "Imported Expense",
        reference_no: referenceNo,
        status: "posted",
        notes,
      });
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE bank_statement_lines
       SET match_status = 'matched',
           matched_txn_id = ?,
           match_confidence = 100,
           updated_at = ?
       WHERE id = ?`,
    ).run(created.id, now, lineId);
    db.prepare(
      `INSERT INTO bank_reconciliation_matches (import_id, line_id, txn_id, action, confidence, note, created_at)
       VALUES (?, ?, ?, 'create_txn', 100, ?, ?)`,
    ).run(line.import_id, lineId, created.id, "Created from bank line", now);
    ensureImportInReview(line.import_id);
    return created;
  },

  closeImport: (importId: number, note?: string): { success: boolean; reason?: string } => {
    const pending = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM bank_statement_lines
         WHERE import_id = ? AND match_status IN ('unmatched', 'suggested')`,
      )
      .get(importId) as { count: number };
    if (pending.count > 0) {
      return {
        success: false,
        reason: `Masih ada ${pending.count} baris yang belum direkonsiliasi`,
      };
    }
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `UPDATE bank_statement_imports
         SET status = 'closed',
             close_note = ?,
             closed_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(note?.trim() || null, now, now, importId);
    if (result.changes > 0) {
      db.prepare(
        `INSERT INTO bank_reconciliation_matches (import_id, line_id, txn_id, action, confidence, note, created_at)
         VALUES (?, NULL, NULL, 'close', NULL, ?, ?)`,
      ).run(importId, note?.trim() || null, now);
      return { success: true };
    }
    return { success: false, reason: "Import tidak ditemukan" };
  },

  reopenImport: (importId: number, note?: string): boolean => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `UPDATE bank_statement_imports
         SET status = 'in_review',
             updated_at = ?
         WHERE id = ?`,
      )
      .run(now, importId);
    if (result.changes > 0) {
      db.prepare(
        `INSERT INTO bank_reconciliation_matches (import_id, line_id, txn_id, action, confidence, note, created_at)
         VALUES (?, NULL, NULL, 'reopen', NULL, ?, ?)`,
      ).run(importId, note?.trim() || null, now);
      return true;
    }
    return false;
  },

  getReportRows: (importId: number) => {
    return db
      .prepare(
        `SELECT
            i.account_no,
            i.period_from,
            i.period_to,
            i.status AS import_status,
            l.line_no,
            l.post_date,
            l.remarks,
            l.additional_desc,
            l.credit_amount,
            l.debit_amount,
            l.signed_amount,
            l.close_balance,
            l.match_status,
            l.suggestion_score,
            l.match_confidence,
            t.id AS txn_id,
            t.type AS txn_type,
            t.sub_type AS txn_sub_type,
            t.amount AS txn_amount,
            t.txn_date,
            t.reference_no,
            t.service_label
         FROM bank_statement_lines l
         JOIN bank_statement_imports i ON i.id = l.import_id
         LEFT JOIN transactions t ON t.id = l.matched_txn_id
         WHERE l.import_id = ?
         ORDER BY datetime(l.post_date) ASC, l.line_no ASC`,
      )
      .all(importId);
  },
};

// Seed data on first run
const recipientCount = db
  .prepare("SELECT COUNT(*) as count FROM recipients")
  .get() as { count: number };
if (recipientCount.count === 0) {
  const now = new Date().toISOString();

  // First pass: insert all recipients without transfer_to_id
  const insertTransaction = db.transaction(() => {
    for (const r of seedRecipients) {
      insertRecipient.run(
        r.name,
        r.bank_name,
        r.account_number,
        r.whatsapp,
        r.keterangan,
        null, // transfer_to_id set in second pass
        null, // family_group_id
        1, // zoom_eligible default
        1,
        now,
        now,
      );
    }
  });
  insertTransaction();

  // Second pass: set transfer_to_id for those with transfer_to_name
  const updateTransferTo = db.transaction(() => {
    for (const r of seedRecipients) {
      if (r.transfer_to_name) {
        const target = recipientDb.findByName(r.transfer_to_name);
        const source = recipientDb.findByName(r.name);
        if (target && source) {
          db.prepare(
            "UPDATE recipients SET transfer_to_id = ? WHERE id = ?",
          ).run(target.id, source.id);
        }
      }
    }
  });
  updateTransferTo();

  // Third pass: set up family groups for recipients that transfer to each other
  // (e.g., Oreza→Anita means they are family; Hellena→Tirto means they are family)
  const setupFamilyGroups = db.transaction(() => {
    let groupId = 1;
    const processed = new Set<number>();
    const allRecipients = recipientDb.getAll();
    for (const r of allRecipients) {
      if (processed.has(r.id!)) continue;
      if (r.transfer_to_id) {
        // This recipient transfers to someone — they are family
        if (!processed.has(r.id!) && !processed.has(r.transfer_to_id)) {
          db.prepare(
            "UPDATE recipients SET family_group_id = ? WHERE id = ?",
          ).run(groupId, r.id);
          db.prepare(
            "UPDATE recipients SET family_group_id = ? WHERE id = ?",
          ).run(groupId, r.transfer_to_id);
          processed.add(r.id!);
          processed.add(r.transfer_to_id);
          groupId++;
        }
      }
    }
  });
  setupFamilyGroups();

  console.log(`Seeded ${seedRecipients.length} recipients`);
}

// Seed default finance categories on first run
const categoryCount = db
  .prepare("SELECT COUNT(*) as count FROM categories")
  .get() as { count: number };
if (categoryCount.count === 0) {
  const now = new Date().toISOString();
  const defaults: Array<{ name: string; kind: "income" | "expense" }> = [
    { name: "Persepuluhan", kind: "income" },
    { name: "Persembahan", kind: "income" },
    { name: "Donasi", kind: "income" },
    { name: "Operasional Gereja", kind: "expense" },
    { name: "Bantuan Sosial", kind: "expense" },
    { name: "Kegiatan Pelayanan", kind: "expense" },
  ];

  const tx = db.transaction(() => {
    for (const item of defaults) {
      db.prepare(
        "INSERT INTO categories (name, kind, parent_id, is_active, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, ?)",
      ).run(item.name, item.kind, now, now);
    }
  });
  tx();
}

// Keep finance expense ledger aligned with batch transfer statuses.
const batchIdsForSync = db.prepare("SELECT id FROM batches").all() as {
  id: number;
}[];
for (const row of batchIdsForSync) {
  syncBatchTransferExpense(row.id);
}

// Migrate existing base64 proofs to files
const base64Proofs = db
  .prepare(
    "SELECT id, transfer_proof FROM batch_items WHERE transfer_proof IS NOT NULL AND transfer_proof LIKE 'data:%'",
  )
  .all() as { id: number; transfer_proof: string }[];
if (base64Proofs.length > 0) {
  console.log(`Migrating ${base64Proofs.length} base64 proofs to files...`);
  for (const row of base64Proofs) {
    try {
      const match = row.transfer_proof.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        const buffer = Buffer.from(match[2], "base64");
        const filename = saveProofFile(row.id, buffer, ext);
        db.prepare(
          "UPDATE batch_items SET transfer_proof = ? WHERE id = ?",
        ).run(filename, row.id);
        console.log(
          `  Migrated item ${row.id}: ${buffer.length} bytes → ${filename}`,
        );
      }
    } catch (err) {
      console.error(`  Failed to migrate proof for item ${row.id}:`, err);
    }
  }
}
