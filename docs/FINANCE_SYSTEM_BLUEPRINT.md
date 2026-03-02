# EFATA Financial System Blueprint

This document expands the current `EFATA Transfer` app into a modular church financial system.

## 1. Product Scope

### Existing module
- Transfer Assistance (already built): beneficiary batches, transfer proof, notification status.

### New modules (MVP)
- Income Ledger
  - Tithe
  - Offering
  - Other income
- Expense Ledger
  - Request / approval / payment states
- Reports
  - Monthly summary
  - Income vs expense
  - Category breakdown
- Master Data
  - Members/Donors
  - Financial categories
  - Bank/Cash accounts

## 2. Information Architecture

- `/finance` -> Financial Overview
- `/finance/income` -> Income entries + filters + export
- `/finance/expenses` -> Expense entries + approval state
- `/finance/transfers` -> Existing transfer module
- `/finance/reports` -> Summary and downloadable reports
- `/finance/master-data/parties` -> Members, donors, vendors
- `/finance/master-data/categories` -> Income/expense categories
- `/finance/master-data/accounts` -> Cash/bank account list

## 3. Roles and Access

- `admin`
  - Full access + settings + delete
- `treasurer`
  - Create/update income/expense, approve expenses, run reports
- `viewer`
  - Read-only dashboards and reports

Suggested DB table:
- `users(id, name, email, role, is_active, created_at, updated_at)`

## 4. Core Data Model (MVP)

### 4.1 transactions (unified ledger)
```sql
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
);

CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(type, txn_date);
CREATE INDEX IF NOT EXISTS idx_transactions_sub_type_date ON transactions(sub_type, txn_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
```

### 4.2 parties (members/donors/vendors)
```sql
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

CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(party_type);
CREATE INDEX IF NOT EXISTS idx_parties_active ON parties(is_active);
```

### 4.3 categories
```sql
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  parent_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_kind_name ON categories(kind, name);
```

### 4.4 accounts (cash/bank)
```sql
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
```

### 4.5 audit_logs
```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
```

## 5. API Contract (MVP)

### 5.1 Income
- `GET /api/finance/income?type=tithe|offering|other_income&from=YYYY-MM-DD&to=YYYY-MM-DD&q=`
- `POST /api/finance/income`
  - body: `{ sub_type, party_id?, category_id, account_id?, amount, txn_date, payment_method?, service_label?, reference_no?, notes? }`
- `PUT /api/finance/income/:id`
- `DELETE /api/finance/income/:id` (soft-void)

### 5.2 Expenses
- `GET /api/finance/expenses?status=&from=&to=&category_id=`
- `POST /api/finance/expenses`
- `PUT /api/finance/expenses/:id`
- `POST /api/finance/expenses/:id/approve`
- `POST /api/finance/expenses/:id/mark-paid`
- `POST /api/finance/expenses/:id/void`

### 5.3 Reports
- `GET /api/finance/reports/summary?month=YYYY-MM`
- `GET /api/finance/reports/cashflow?from=YYYY-MM-DD&to=YYYY-MM-DD&group_by=day|week|month`
- `GET /api/finance/reports/export.csv?...`
- `GET /api/finance/reports/export.pdf?...`

### 5.4 Master data
- `GET/POST/PUT/DELETE /api/finance/parties`
- `GET/POST/PUT/DELETE /api/finance/categories`
- `GET/POST/PUT/DELETE /api/finance/accounts`

## 6. UI Blueprint (MVP)

### 6.1 `/finance` (Overview)
- Top cards:
  - Cash In (month)
  - Cash Out (month)
  - Net
  - Pending Approvals
- Charts:
  - Monthly trend (last 6 months)
  - Expense by category
- Quick actions:
  - Add Tithe
  - Add Offering
  - Add Expense
  - Open Transfers

### 6.2 `/finance/income`
- Tabs: Tithe / Offering / Other
- Table columns:
  - Date, Person, Category, Method, Amount, Notes, Actions

### 6.3 `/finance/expenses`
- Status filters: Draft / Pending Approval / Approved / Paid / Void
- Table columns:
  - Date, Category, Requester, Amount, Status, Approver, Actions

### 6.4 `/finance/reports`
- Period selector
- KPI summary
- Category tables
- Export buttons (CSV/PDF)

## 7. Implementation Plan (Execution Order)

1. Schema + migration utilities in `src/lib/server/db.ts`
2. Types for new finance entities in `src/lib/types.ts`
3. API routes under `src/routes/api/finance/**`
4. Finance shell pages under `src/routes/finance/**`
5. Overview dashboard widgets
6. Income module
7. Expense module + approvals
8. Reports + export
9. Audit log wiring

## 8. Non-Goals for MVP

- Full accounting double-entry engine
- Multi-currency
- Complex payroll
- Automated bank sync

These can be added in later phases.
