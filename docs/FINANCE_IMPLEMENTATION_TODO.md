# Finance Implementation TODO

## Sprint 1
- [x] Add finance DB tables: `transactions`, `parties`, `categories`, `accounts`, `audit_logs`
- [x] Add TypeScript interfaces for finance entities
- [x] Seed default categories (income + expense)
- [x] Build `/api/finance/categories` CRUD
- [x] Build `/api/finance/parties` CRUD
- [x] Build `/api/finance/accounts` CRUD

## Sprint 2
- [x] Build `/api/finance/income` CRUD
- [x] Build `/api/finance/expenses` CRUD + approve/paid/void actions
- [x] Add finance overview endpoint (`/api/finance/reports/summary`)
- [x] Add route shell `/finance` with module cards

## Sprint 3
- [x] Build income UI (`/finance/income`)
- [x] Build expenses UI (`/finance/expenses`)
- [ ] Add role guard helpers (`admin`, `treasurer`, `viewer`)
- [ ] Add audit log writer utility and integrate into finance write endpoints

## Sprint 4
- [x] Build reports UI (`/finance/reports`)
- [x] Add CSV export for income/expenses/reports
- [x] Add cashflow report endpoint (`/api/finance/reports/cashflow`) with date range + grouping
- [x] Add allocation report endpoint (`/api/finance/reports/allocation`) grouped by tujuan dana
- [ ] Add PDF export summary
- [ ] E2E test key flows
