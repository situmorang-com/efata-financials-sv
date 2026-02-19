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
    zoom_type TEXT NOT NULL DEFAULT 'none',
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

// --- Migration: add new columns to existing tables if they don't exist ---
function columnExists(table: string, column: string): boolean {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return info.some((col) => col.name === column);
}

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
if (!columnExists("batch_items", "zoom_type")) {
  db.exec(
    "ALTER TABLE batch_items ADD COLUMN zoom_type TEXT NOT NULL DEFAULT 'none'",
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
  INSERT INTO batch_items (batch_id, recipient_id, amount, payment_method, saturdays_attended, zoom_type, transfer_fee, transfer_status, notify_status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)
`);

const updateBatchItem = db.prepare(`
  UPDATE batch_items
  SET amount = ?, payment_method = ?, saturdays_attended = ?, zoom_type = ?, transfer_fee = ?, transfer_status = ?, notify_status = ?, transfer_at = ?, notified_at = ?, notes = ?, transfer_proof = ?, updated_at = ?
  WHERE id = ?
`);

const deleteBatchItem = db.prepare("DELETE FROM batch_items WHERE id = ?");

const selectBatchItems = db.prepare(`
  SELECT
    bi.id, bi.batch_id, bi.recipient_id, bi.amount, bi.payment_method, bi.saturdays_attended,
    bi.zoom_type, bi.transfer_fee, bi.transfer_status, bi.notify_status, bi.transfer_at,
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

function voidBatchTransferExpense(batchId: number): void {
  const now = new Date().toISOString();
  const ref = `BATCH-${batchId}`;
  const refFee = `BATCH-${batchId}-FEE`;
  db.prepare(
    "UPDATE transactions SET status = 'void', updated_at = ? WHERE reference_no IN (?, ?) AND status != 'void'",
  ).run(now, ref, refFee);
  voidLegacyPerItemTransferExpenses(batchId);
}

export const batchItemDb = {
  getByBatchId: (batchId: number): BatchItem[] => {
    return (selectBatchItems.all(batchId) as BatchItem[]).map((item) => ({
      ...item,
      payment_method: normalizeBatchPaymentMethod(item.payment_method),
    }));
  },

  getById: (id: number): BatchItem | undefined => {
    const item = selectBatchItemById.get(id) as BatchItem | undefined;
    if (!item) return undefined;
    return {
      ...item,
      payment_method: normalizeBatchPaymentMethod(item.payment_method),
    };
  },

  create: (
    batchId: number,
    recipientId: number,
    amount: number,
    saturdaysAttended: number = 0,
    zoomType: string = "none",
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
      zoomType,
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
      zoom_type: zoomType as "none" | "single" | "family",
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
      updated.zoom_type,
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
              "none",
              0,
              now,
              now,
            );
            count++;
            continue;
          }
          // Determine zoom type from recipient data
          let zoomType = "none";
          if (r.zoom_eligible) {
            zoomType = r.family_group_id ? "family" : "single";
          }
          // Default: 0 saturdays attended (user fills in attendance)
          const amount = calculateAmount(
            0,
            batch.transport_rate,
            zoomType as "none" | "single" | "family",
            batch.zoom_single_rate,
            batch.zoom_family_rate,
          );
          insertBatchItem.run(
            batchId,
            r.id!,
            amount,
            "transfer",
            0,
            zoomType,
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
    // If clearing proof, delete the old file
    if (!filename) {
      const existing = db
        .prepare("SELECT transfer_proof FROM batch_items WHERE id = ?")
        .get(id) as { transfer_proof: string | null } | undefined;
      if (
        existing?.transfer_proof &&
        !existing.transfer_proof.startsWith("data:")
      ) {
        deleteProofFile(existing.transfer_proof);
      }
    }
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
      const item = selectBatchItemById.get(id) as BatchItem | undefined;
      if (item?.batch_id) {
        syncBatchTransferExpense(item.batch_id);
      }
    }
    return changed;
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
    return {
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
    return result.changes > 0;
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
      SELECT t.*
      FROM transactions t
      LEFT JOIN parties p ON p.id = t.party_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY t.txn_date DESC, t.id DESC
    `;

    return db.prepare(sql).all(...params) as FinanceTransaction[];
  },

  getById: (id: number): FinanceTransaction | undefined => {
    return db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as
      | FinanceTransaction
      | undefined;
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
