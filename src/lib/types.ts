export type ZoomType = "none" | "single" | "family" | "custom";
export type AttendanceType = "saturday" | "wednesday";

export interface Recipient {
  id?: number;
  name: string;
  bank_name?: string;
  account_number?: string;
  whatsapp?: string;
  keterangan?: string;
  transfer_to_id?: number;
  transfer_to_name?: string;
  /**
   * Whose name is on the bank account, when it is not the recipient's own and
   * that person is not a recipient (otherwise use transfer_to_id). Empty = own.
   */
  account_holder_name?: string | null;
  /** What the account holder is to this recipient, e.g. "anak", "suami". */
  account_holder_relation?: string | null;
  family_group_id?: number | null;
  zoom_eligible: number; // 1 = eligible, 0 = not eligible
  is_active: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  family_members?: string[]; // names of other family members in same group
  // Latest membership period (YYYY-MM-DD, end inclusive, null = still a member)
  start_date?: string | null;
  end_date?: string | null;
}

/** One stint of membership; someone who leaves and comes back has several. */
export interface RecipientPeriod {
  id: number;
  recipient_id: number;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

/** Names added to, removed from, or left in a batch by a sync. */
export interface BatchSyncResult {
  added: string[];
  removed: string[];
  /** Outside their membership dates but kept: already paid, notified or proven. */
  kept: string[];
}

export interface Batch {
  id?: number;
  type: "monthly" | "special";
  name: string;
  description?: string;
  default_amount: number;
  total_saturdays: number;
  transport_rate: number;
  zoom_single_rate: number;
  zoom_family_rate: number;
  status: "active" | "completed";
  /** Month the batch pays for, YYYY-MM. */
  period?: string | null;
  /** The one transfer that carries all cash to the cash distributor: entered in the bank portal / sent. */
  cash_payout_submitted_at?: string | null;
  cash_payout_done_at?: string | null;
  created_at: string;
  updated_at: string;
  total_items?: number;
  transferred_count?: number;
  notified_count?: number;
}

export interface BatchItem {
  id?: number;
  batch_id: number;
  recipient_id: number;
  amount: number;
  payment_method: "transfer" | "cash";
  saturdays_attended: number;
  wednesdays_attended: number;
  zoom_type: ZoomType;
  custom_zoom_amount: number;
  transfer_status: "pending" | "done";
  notify_status: "pending" | "sent" | "skipped";
  transfer_at?: string;
  /** When this row's transfer was entered in the bank portal (Kopra) and is awaiting approval. */
  kopra_submitted_at?: string | null;
  notified_at?: string;
  transfer_proof?: string | null; // base64 data URL or stored filename (only fetched on-demand via proof endpoint)
  has_transfer_proof?: number; // 0 or 1 flag (included in list queries)
  notes?: string;
  created_at: string;
  updated_at: string;
  recipient_name?: string;
  bank_name?: string;
  account_number?: string;
  whatsapp?: string;
  keterangan?: string;
  transfer_to_id?: number;
  transfer_to_name?: string;
  actual_bank_name?: string;
  actual_account_number?: string;
  actual_account_holder?: string;
  /** Name on the account actually paid into, when it is not a recipient's own name. */
  account_holder_name?: string | null;
  /** What the account holder is to this row's recipient. */
  account_holder_relation?: string | null;
  family_group_id?: number | null;
  transfer_fee: number;
}

export interface AttendanceRecord {
  id?: number;
  batch_id: number;
  recipient_id: number;
  attendance_type: AttendanceType;
  attendance_date: string; // YYYY-MM-DD
  attended: number; // 1 = hadir, 0 = tidak hadir
  created_at: string;
  updated_at: string;
}

export function calculateAmount(
  saturdays: number,
  transportRate: number,
  zoomType: ZoomType,
  zoomSingleRate: number,
  zoomFamilyRate: number,
  customZoomAmount: number = 0,
): number {
  const transport = saturdays * transportRate;
  const zoom =
    zoomType === "single"
      ? zoomSingleRate
      : zoomType === "family"
        ? zoomFamilyRate
        : zoomType === "custom"
          ? Math.max(0, Math.round(customZoomAmount || 0))
        : 0;
  return transport + zoom;
}

export interface FinanceCategory {
  id?: number;
  name: string;
  kind: "income" | "expense";
  parent_id?: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface FinanceParty {
  id?: number;
  name: string;
  party_type: "member" | "donor" | "vendor" | "other";
  whatsapp?: string;
  email?: string;
  notes?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface FinanceAccount {
  id?: number;
  name: string;
  account_type: "cash" | "bank" | "ewallet" | "other";
  bank_name?: string;
  account_number?: string;
  holder_name?: string;
  opening_balance: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

/**
 * - tithe/offering/other_income: money received
 * - expense: church spending
 * - remittance: tithe and the Konferens share of offerings paid over to
 *   Konferens (pass-through, not a church expense)
 * - transfer: a move between the church's own accounts (cash deposit, pindah
 *   buku, cash withdrawal) — one row leaving, one arriving; neither income nor
 *   expense
 */
export type FinanceSubType =
  | "tithe"
  | "offering"
  | "other_income"
  | "expense"
  | "remittance"
  | "transfer";

export interface FinanceTransaction {
  id?: number;
  type: "income" | "expense";
  sub_type: FinanceSubType;
  party_id?: number | null;
  category_id: number;
  account_id?: number | null;
  amount: number;
  txn_date: string;
  payment_method?: string;
  service_label?: string;
  reference_no?: string;
  status: "draft" | "pending_approval" | "approved" | "posted" | "void";
  notes?: string;
  created_by?: number | null;
  approved_by?: number | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
  resolved_account_id?: number | null;
  source_linked_account_id?: number | null;
  source_account_number?: string | null;
  source_account_name?: string | null;
  source_account_bank_name?: string | null;
}

/** Book balance of an account set against its latest bank statement. */
export type AccountBalance = {
  account_id: number;
  name: string;
  account_type: FinanceAccount["account_type"];
  account_number: string | null;
  opening_balance: number;
  inflow: number;
  outflow: number;
  book_balance: number;
  as_of: string | null;
  statement_date: string | null;
  statement_balance: number | null;
  unreconciled_lines: number;
  unreconciled_amount: number;
  difference: number | null;
};

/** Money held for and remitted to Konferens over a period. */
export type KonferensPayable = {
  date_from: string;
  date_to: string;
  opening: number;
  tithe: number;
  terpadu_konferens: number;
  remitted: number;
  closing: number;
};

export type GiverStatementStatus = "sent" | "opened" | "submitted" | "applied" | "superseded";

/** A giver's private confirmation page (one per link). */
export interface GiverStatement {
  id: number;
  giver_key: string;
  giver_name: string;
  token: string;
  pin_hash: string;
  period_from: string;
  period_to: string;
  status: GiverStatementStatus;
  failed_attempts: number;
  locked_until: string | null;
  giver_note: string | null;
  opened_at: string | null;
  submitted_at: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One bank transfer on a giver statement: the suggested split and the giver's answer. */
export interface GiverStatementLine {
  id: number;
  statement_id: number;
  bank_line_id: number;
  txn_date: string;
  amount: number;
  remark: string | null;
  account_label: string | null;
  suggested_tithe: number;
  suggested_offering: number;
  suggested_special: number;
  suggestion_source: string;
  suggestion_detail: string | null;
  tithe: number;
  offering: number;
  special: number;
  not_mine: number;
  note: string | null;
  edited_at: string | null;
}

export type GiverLineSuggestion = {
  tithe: number;
  offering: number;
  special: number;
  source: string;
  detail: string | null;
};

export type GiverSummary = {
  giver_key: string;
  giver_name: string;
  line_count: number;
  total: number;
  unclassified: number;
  first_date: string;
  last_date: string;
  statement: {
    id: number;
    token: string;
    status: GiverStatementStatus;
    created_at: string;
    opened_at: string | null;
    submitted_at: string | null;
    applied_at: string | null;
    changed_lines: number;
  } | null;
};

export interface BoardApproval {
  id?: number;
  kind: "expense" | "decision" | "budget" | "policy" | "other";
  title: string;
  decision_date: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "superseded" | "rejected";
  approvers: string;
  whatsapp_context?: string | null;
  notes?: string | null;
  proof_filename?: string | null;
  proof_original_name?: string | null;
  proof_mime?: string | null;
  proof_size?: number | null;
  proof_sha256?: string | null;
  created_by_email?: string | null;
  updated_by_email?: string | null;
  created_at: string;
  updated_at: string;
  vote_summary?: BoardApprovalVoteSummary;
  user_vote?: BoardApprovalVote | null;
  votes?: BoardApprovalVote[];
}

export interface BoardApprovalVote {
  id?: number;
  approval_id: number;
  voter_email: string;
  voter_name?: string | null;
  vote: "agree" | "disagree";
  comment?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardApprovalVoteSummary {
  agree: number;
  disagree: number;
  total: number;
}

export interface BankStatementImport {
  id?: number;
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
  status: "open" | "in_review" | "closed";
  close_note?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankStatementLine {
  id?: number;
  import_id: number;
  line_no: number;
  post_date: string;
  remarks?: string | null;
  additional_desc?: string | null;
  description_norm?: string | null;
  credit_amount: number;
  debit_amount: number;
  signed_amount: number;
  close_balance?: number | null;
  line_hash: string;
  match_status: "unmatched" | "suggested" | "matched" | "ignored";
  suggested_txn_id?: number | null;
  suggestion_score: number;
  matched_txn_id?: number | null;
  match_confidence: number;
  created_at: string;
  updated_at: string;
}
