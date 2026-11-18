/**
 * Schema for the monthly "Laporan Keuangan GMAHK Konferens DKI Jakarta &
 * Sekitarnya" form.
 *
 * Kept in one place so the app (src/lib/server/db.ts) and the standalone
 * backfill/maintenance scripts apply exactly the same DDL — no drift.
 *
 * The form is receipt-driven: every kwitansi is split across five allocation
 * columns, grouped into Dana Mission Sedunia (remitted to Konferens) and Dana
 * Jemaat (retained locally).
 */

/** Every statement is idempotent, so this is safe to run on each boot. */
export const KONFERENS_SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_no TEXT,
    receipt_date TEXT NOT NULL,
    month_key TEXT NOT NULL,
    giver_name TEXT NOT NULL,
    party_id INTEGER,
    kind TEXT NOT NULL CHECK (kind IN ('perpuluhan', 'terpadu', 'khusus_jemaat', 'khusus_mission', 'mixed')),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    account_id INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'void')),
    void_reason TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  )`,

  `CREATE TABLE IF NOT EXISTS receipt_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL,
    bucket TEXT NOT NULL CHECK (bucket IN ('perpuluhan', 'khusus_mission', 'terpadu_konferens', 'terpadu_jemaat', 'khusus_jemaat')),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    created_at TEXT NOT NULL,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
    UNIQUE (receipt_id, bucket)
  )`,

  // Per-giver detail beneath a kwitansi. A weekly terpadu collection is issued
  // one receipt number but arrives as many named envelopes (or transfers noted
  // "persembahan"), so the form prints the aggregate while the giving units,
  // and per-member giving statements, come from these lines.
  `CREATE TABLE IF NOT EXISTS receipt_givers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL,
    giver_name TEXT NOT NULL,
    party_id INTEGER,
    bucket TEXT NOT NULL CHECK (bucket IN ('perpuluhan', 'terpadu', 'khusus_jemaat', 'khusus_mission')),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    method TEXT NOT NULL DEFAULT 'envelope' CHECK (method IN ('envelope', 'transfer', 'cash')),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
    FOREIGN KEY (party_id) REFERENCES parties(id)
  )`,

  // The 18 fixed Dana Jemaat expenditure lines printed on the form.
  `CREATE TABLE IF NOT EXISTS jemaat_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS remittances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_key TEXT NOT NULL UNIQUE,
    sent_date TEXT,
    method TEXT CHECK (method IN ('bank', 'cash')),
    account_id INTEGER,
    reference_no TEXT,
    konferens_received_date TEXT,
    konferens_receipt_no TEXT,
    total_amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'acknowledged')),
    proof TEXT,
    uperpul INTEGER NOT NULL DEFAULT 0,
    uperdu INTEGER NOT NULL DEFAULT 0,
    jutari INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  )`,

  `CREATE TABLE IF NOT EXISTS remittance_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remittance_id INTEGER NOT NULL,
    bucket TEXT NOT NULL CHECK (bucket IN ('perpuluhan', 'khusus_mission', 'terpadu_konferens')),
    amount INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (remittance_id) REFERENCES remittances(id) ON DELETE CASCADE,
    UNIQUE (remittance_id, bucket)
  )`,

  // Locks a month once its report is signed and remitted.
  `CREATE TABLE IF NOT EXISTS period_closes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_key TEXT NOT NULL UNIQUE,
    closed_at TEXT NOT NULL,
    closed_by TEXT,
    jemaat_opening_balance INTEGER NOT NULL DEFAULT 0,
    jemaat_closing_balance INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS idx_receipts_month ON receipts(month_key, receipt_date)`,
  `CREATE INDEX IF NOT EXISTS idx_receipts_no ON receipts(receipt_no)`,
  `CREATE INDEX IF NOT EXISTS idx_receipt_allocations_receipt ON receipt_allocations(receipt_id)`,
  `CREATE INDEX IF NOT EXISTS idx_receipt_allocations_bucket ON receipt_allocations(bucket)`,
  `CREATE INDEX IF NOT EXISTS idx_receipt_givers_receipt ON receipt_givers(receipt_id)`,
  `CREATE INDEX IF NOT EXISTS idx_receipt_givers_name ON receipt_givers(giver_name)`,
  `CREATE INDEX IF NOT EXISTS idx_receipt_givers_party ON receipt_givers(party_id, bucket)`,
];

/**
 * The Dana Jemaat chart of accounts is fixed by the Konferens form. Names are
 * reproduced exactly as printed so the report is a straight copy-out.
 */
export const JEMAAT_ACCOUNT_SEED: Array<{ code: string; name: string }> = [
  { code: "telepon_air_listrik", name: "Telepon, Air & Listrik Gereja" },
  { code: "perlawatan_sosial", name: "Perlawatan, Sosial & P. Perorangan" },
  { code: "perbaikan_tempat_kebaktian", name: "Perbaikan Tempat Kebaktian" },
  { code: "kebaktian_kebangunan_rohani", name: "Kebaktian Kebangunan Rohani" },
  { code: "buku_wga_ss", name: "Buku, WGA, SS Dewasa & Anak-anak" },
  { code: "perkemahan_pemuda_advent", name: "Perkemahan & Pemuda Advent" },
  { code: "penataran_seminar", name: "Penataran/Seminar" },
  { code: "apta_bwa_dorkas", name: "APTA, BWA & Dorkas" },
  { code: "roh_nubuat", name: "Roh Nubuat" },
  { code: "diakon_diakones", name: "Diakon dan Diakones" },
  { code: "kesehatan_penataran", name: "Kesehatan dan Penataran" },
  { code: "penatalayanan", name: "Penatalayanan" },
  { code: "pendidikan", name: "Pendidikan" },
  { code: "komunikasi_buletin", name: "Komunikasi & Buletin Gereja" },
  { code: "musik_paduan_suara", name: "Musik & Paduan Suara" },
  { code: "sekertaris_surat", name: "Sekertaris & Surat-surat" },
  { code: "bendahara_ongkos_kirim", name: "Bendahara & Ongkos Kirim Uang" },
  { code: "rumah_tangga", name: "Rumah Tangga" },
];

/** Minimal shape shared by better-sqlite3 and node:sqlite handles. */
// Method syntax on purpose: method parameters are checked bivariantly, so
// better-sqlite3's typed Statement (whose run() takes specific params) fits.
type SqliteLike = {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
};

function hasColumn(db: SqliteLike, table: string, column: string): boolean {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return info.some((entry) => entry.name === column);
}

/**
 * Applies the schema and seeds the Dana Jemaat chart. Idempotent, so both the
 * app boot path and the standalone scripts can call it unconditionally.
 */
export function applyKonferensSchema(db: SqliteLike): void {
  for (const statement of KONFERENS_SCHEMA_SQL) {
    db.exec(statement);
  }

  // Local expenses classify against the official Dana Jemaat chart. Lives here
  // rather than with the app's other migrations so standalone scripts get it.
  if (!hasColumn(db, "transactions", "jemaat_account_id")) {
    db.exec("ALTER TABLE transactions ADD COLUMN jemaat_account_id INTEGER");
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_transactions_jemaat_account ON transactions(jemaat_account_id, txn_date)`,
  );

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO jemaat_accounts (code, name, sort_order, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
  );
  JEMAAT_ACCOUNT_SEED.forEach((account, index) => {
    insert.run(account.code, account.name, index + 1, now, now);
  });
}
