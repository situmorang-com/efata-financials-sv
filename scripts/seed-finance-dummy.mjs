import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(join(DATA_DIR, "efata.db"));

const nowIso = new Date().toISOString();
const DUMMY_TAG = "[DUMMY_FINANCE_V1]";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthStart(baseDate, deltaMonths) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + deltaMonths, 1);
}

function pseudo(seed) {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

function ensureFinanceTables() {
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
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
      parent_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
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
    );
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
      updated_at TEXT NOT NULL
    );
  `);
}

function getIdOrInsert({
  table,
  whereSql,
  whereParams,
  insertSql,
  insertParams,
}) {
  const existing = db
    .prepare(`SELECT id FROM ${table} WHERE ${whereSql} LIMIT 1`)
    .get(...whereParams);
  if (existing?.id) return existing.id;
  const res = db.prepare(insertSql).run(...insertParams);
  return Number(res.lastInsertRowid);
}

function ensureCategory(name, kind) {
  return getIdOrInsert({
    table: "categories",
    whereSql: "name = ? AND kind = ?",
    whereParams: [name, kind],
    insertSql:
      "INSERT INTO categories (name, kind, parent_id, is_active, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, ?)",
    insertParams: [name, kind, nowIso, nowIso],
  });
}

function ensureAccount({ name, type, bankName, accountNumber, holderName, openingBalance = 0 }) {
  return getIdOrInsert({
    table: "accounts",
    whereSql: "name = ?",
    whereParams: [name],
    insertSql:
      "INSERT INTO accounts (name, account_type, bank_name, account_number, holder_name, opening_balance, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
    insertParams: [
      name,
      type,
      bankName ?? null,
      accountNumber ?? null,
      holderName ?? null,
      openingBalance,
      nowIso,
      nowIso,
    ],
  });
}

function ensureParty({ name, partyType, whatsapp, email, notes }) {
  return getIdOrInsert({
    table: "parties",
    whereSql: "name = ?",
    whereParams: [name],
    insertSql:
      "INSERT INTO parties (name, party_type, whatsapp, email, notes, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
    insertParams: [
      name,
      partyType,
      whatsapp ?? null,
      email ?? null,
      notes ?? null,
      nowIso,
      nowIso,
    ],
  });
}

function seed() {
  ensureFinanceTables();

  const category = {
    tithe: ensureCategory("Persepuluhan", "income"),
    offering: ensureCategory("Persembahan", "income"),
    otherIncome: ensureCategory("Donasi", "income"),
    ops: ensureCategory("Operasional Gereja", "expense"),
    social: ensureCategory("Bantuan Sosial", "expense"),
    ministry: ensureCategory("Kegiatan Pelayanan", "expense"),
  };

  const accountIds = [
    ensureAccount({
      name: "Kas Gereja",
      type: "cash",
      holderName: "Bendahara EFATA",
      openingBalance: 5_000_000,
    }),
    ensureAccount({
      name: "BCA Operasional EFATA",
      type: "bank",
      bankName: "BCA",
      accountNumber: "1234567890",
      holderName: "GK EFATA",
      openingBalance: 15_000_000,
    }),
    ensureAccount({
      name: "Mandiri Misi EFATA",
      type: "bank",
      bankName: "Mandiri",
      accountNumber: "9876543210",
      holderName: "GK EFATA",
      openingBalance: 8_000_000,
    }),
  ];

  const partyIds = [
    ensureParty({ name: "Jemaat Umum", partyType: "member", notes: DUMMY_TAG }),
    ensureParty({ name: "Keluarga Pelita", partyType: "member", notes: DUMMY_TAG }),
    ensureParty({ name: "Donatur Mitra", partyType: "donor", notes: DUMMY_TAG }),
    ensureParty({ name: "Toko Liturgi Sejahtera", partyType: "vendor", notes: DUMMY_TAG }),
    ensureParty({ name: "Vendor Sound Pelayanan", partyType: "vendor", notes: DUMMY_TAG }),
    ensureParty({ name: "Yayasan Sosial Mitra Kasih", partyType: "other", notes: DUMMY_TAG }),
  ];

  // Reset previous dummy transactions so reruns stay clean.
  db.prepare(
    "DELETE FROM transactions WHERE reference_no LIKE 'DUMMY-%' OR notes LIKE ?",
  ).run(`%${DUMMY_TAG}%`);

  const insertTxn = db.prepare(`
    INSERT INTO transactions
    (type, sub_type, party_id, category_id, account_id, amount, txn_date, payment_method, service_label, reference_no, status, notes, created_by, approved_by, approved_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
  `);

  const offeringPlans = [
    "Local Church Budget",
    "Conference Advance",
    "Union Mission",
    "World Mission",
    "Special Project",
  ];
  const expensePurposes = [
    "Operasional Ibadah",
    "Bantuan Jemaat",
    "Perawatan Gedung",
    "Kegiatan Remaja",
    "Perlengkapan Sekolah Sabat",
    "Dukungan Misi Lokal",
  ];

  let seq = 1;
  const base = new Date();
  const tx = db.transaction(() => {
    for (let m = -5; m <= 0; m++) {
      const start = monthStart(base, m);
      const daysInMonth = new Date(
        start.getFullYear(),
        start.getMonth() + 1,
        0,
      ).getDate();
      const ym = `${start.getFullYear()}${pad2(start.getMonth() + 1)}`;

      // Incomes
      for (let i = 0; i < 28; i++) {
        const r = pseudo(seq * 17 + i + m * 31);
        const day = 1 + Math.floor(r * daysInMonth);
        const date = ymd(new Date(start.getFullYear(), start.getMonth(), day));
        const subtypeRoll = pseudo(seq * 11);
        let subType = "tithe";
        let categoryId = category.tithe;
        let destination = "Storehouse / Conference";

        if (subtypeRoll >= 0.55 && subtypeRoll < 0.88) {
          subType = "offering";
          categoryId = category.offering;
          destination = offeringPlans[Math.floor(pseudo(seq * 13) * offeringPlans.length)];
        } else if (subtypeRoll >= 0.88) {
          subType = "other_income";
          categoryId = category.otherIncome;
          destination = "Sumbangan Kegiatan Khusus";
        }

        const baseAmount =
          subType === "tithe" ? 400_000 : subType === "offering" ? 250_000 : 300_000;
        const variance = Math.floor(pseudo(seq * 19) * 450_000);
        const amount = Math.round((baseAmount + variance) / 1000) * 1000;
        const accountId = accountIds[Math.floor(pseudo(seq * 23) * accountIds.length)];
        const partyId = partyIds[Math.floor(pseudo(seq * 29) * 3)];

        insertTxn.run(
          "income",
          subType,
          partyId,
          categoryId,
          accountId,
          amount,
          date,
          pseudo(seq * 31) > 0.25 ? "transfer" : "cash",
          destination,
          `DUMMY-IN-${ym}-${pad2(i + 1)}`,
          "posted",
          `${DUMMY_TAG} sample income`,
          nowIso,
          nowIso,
        );
        seq++;
      }

      // Expenses
      for (let i = 0; i < 22; i++) {
        const r = pseudo(seq * 37 + i + m * 17);
        const day = 1 + Math.floor(r * daysInMonth);
        const date = ymd(new Date(start.getFullYear(), start.getMonth(), day));
        const catRoll = pseudo(seq * 41);
        const categoryId =
          catRoll < 0.45 ? category.ops : catRoll < 0.72 ? category.social : category.ministry;
        const purpose = expensePurposes[
          Math.floor(pseudo(seq * 43) * expensePurposes.length)
        ];
        const amount = Math.round((180_000 + pseudo(seq * 47) * 1_650_000) / 1000) * 1000;
        const accountId = accountIds[Math.floor(pseudo(seq * 53) * accountIds.length)];
        const partyId = partyIds[3 + Math.floor(pseudo(seq * 59) * 3)];
        const statusRoll = pseudo(seq * 61);
        const status =
          statusRoll < 0.16
            ? "pending_approval"
            : statusRoll < 0.34
              ? "approved"
              : "posted";

        insertTxn.run(
          "expense",
          "expense",
          partyId,
          categoryId,
          accountId,
          amount,
          date,
          pseudo(seq * 67) > 0.18 ? "transfer" : "cash",
          purpose,
          `DUMMY-EX-${ym}-${pad2(i + 1)}`,
          status,
          `${DUMMY_TAG} sample expense`,
          nowIso,
          nowIso,
        );
        seq++;
      }
    }
  });
  tx();

  const summary = db
    .prepare(
      `SELECT
         SUM(CASE WHEN type = 'income' AND status != 'void' THEN amount ELSE 0 END) as income_total,
         SUM(CASE WHEN type = 'expense' AND status != 'void' THEN amount ELSE 0 END) as expense_total,
         SUM(CASE WHEN type = 'expense' AND status = 'pending_approval' THEN 1 ELSE 0 END) as pending_count,
         COUNT(*) as tx_count
       FROM transactions
       WHERE reference_no LIKE 'DUMMY-%' OR notes LIKE ?`,
    )
    .get(`%${DUMMY_TAG}%`);

  console.log("Dummy finance seeding completed.");
  console.log(`Transactions inserted: ${summary.tx_count}`);
  console.log(`Income total: ${summary.income_total}`);
  console.log(`Expense total: ${summary.expense_total}`);
  console.log(`Pending approvals: ${summary.pending_count}`);
}

try {
  seed();
} finally {
  db.close();
}
