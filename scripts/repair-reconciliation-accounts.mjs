import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = join(process.cwd(), "data", "efata.db");

if (!existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH);

function normalizeAccountNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function tableExists(name) {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(name);
  return Boolean(row);
}

if (!tableExists("accounts") || !tableExists("bank_statement_imports") || !tableExists("transactions")) {
  console.error("Required tables are missing. Aborting repair.");
  process.exit(1);
}

const accounts = db
  .prepare(
    "SELECT id, name, bank_name, account_number FROM accounts WHERE is_active = 1 AND account_number IS NOT NULL ORDER BY id",
  )
  .all();

const accountMap = new Map();
const ambiguousNumbers = new Set();

for (const account of accounts) {
  const normalized = normalizeAccountNumber(account.account_number);
  if (!normalized) continue;
  if (accountMap.has(normalized)) {
    ambiguousNumbers.add(normalized);
    accountMap.delete(normalized);
    continue;
  }
  if (!ambiguousNumbers.has(normalized)) {
    accountMap.set(normalized, account);
  }
}

const imports = db
  .prepare(
    "SELECT id, account_no, linked_account_id FROM bank_statement_imports ORDER BY id",
  )
  .all();

const txns = db
  .prepare(
    `SELECT
       t.id,
       t.reference_no,
       t.account_id,
       i.id AS import_id,
       i.account_no,
       i.linked_account_id
     FROM transactions t
     LEFT JOIN bank_statement_imports i
       ON t.reference_no LIKE 'BANK:%'
      AND CAST(
            substr(
              t.reference_no,
              6,
              instr(substr(t.reference_no, 6), ':') - 1
            ) AS INTEGER
          ) = i.id
     WHERE t.reference_no LIKE 'BANK:%'
     ORDER BY t.id`,
  )
  .all();

const now = new Date().toISOString();
const updateImport = db.prepare(
  "UPDATE bank_statement_imports SET linked_account_id = ?, updated_at = ? WHERE id = ?",
);
const updateTxn = db.prepare(
  "UPDATE transactions SET account_id = ?, updated_at = ? WHERE id = ?",
);

const summary = {
  importsMapped: 0,
  importsAlreadyMapped: 0,
  importsUnmapped: 0,
  importsAmbiguous: 0,
  txnsMapped: 0,
  txnsAlreadyMapped: 0,
  txnsUnmapped: 0,
};

const unmappedImports = [];
const ambiguousImports = [];
const unmappedTxns = [];

const runRepair = db.transaction(() => {
  for (const item of imports) {
    const normalized = normalizeAccountNumber(item.account_no);
    if (!normalized) {
      summary.importsUnmapped += 1;
      unmappedImports.push({ import_id: item.id, account_no: item.account_no, reason: "empty_account_no" });
      continue;
    }
    if (item.linked_account_id) {
      summary.importsAlreadyMapped += 1;
      continue;
    }
    if (ambiguousNumbers.has(normalized)) {
      summary.importsAmbiguous += 1;
      ambiguousImports.push({ import_id: item.id, account_no: item.account_no });
      continue;
    }
    const match = accountMap.get(normalized);
    if (!match) {
      summary.importsUnmapped += 1;
      unmappedImports.push({ import_id: item.id, account_no: item.account_no, reason: "no_matching_account" });
      continue;
    }
    updateImport.run(match.id, now, item.id);
    summary.importsMapped += 1;
  }

  const refreshedImportMap = new Map(
    db
      .prepare("SELECT id, linked_account_id, account_no FROM bank_statement_imports ORDER BY id")
      .all()
      .map((row) => [row.id, row]),
  );

  for (const txn of txns) {
    if (txn.account_id) {
      summary.txnsAlreadyMapped += 1;
      continue;
    }

    const importRow = refreshedImportMap.get(txn.import_id);
    const linkedAccountId = importRow?.linked_account_id ?? null;

    if (!linkedAccountId) {
      summary.txnsUnmapped += 1;
      unmappedTxns.push({
        txn_id: txn.id,
        reference_no: txn.reference_no,
        import_id: txn.import_id,
        account_no: importRow?.account_no ?? txn.account_no ?? null,
      });
      continue;
    }

    updateTxn.run(linkedAccountId, now, txn.id);
    summary.txnsMapped += 1;
  }
});

runRepair();

console.log("Reconciliation account repair completed.");
console.log(JSON.stringify(summary, null, 2));

if (ambiguousImports.length > 0) {
  console.log("\nAmbiguous imports:");
  console.log(JSON.stringify(ambiguousImports, null, 2));
}

if (unmappedImports.length > 0) {
  console.log("\nUnmapped imports:");
  console.log(JSON.stringify(unmappedImports, null, 2));
}

if (unmappedTxns.length > 0) {
  console.log("\nUnmapped BANK transactions:");
  console.log(JSON.stringify(unmappedTxns, null, 2));
}
