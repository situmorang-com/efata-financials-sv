export interface Recipient {
  id?: number;
  name: string;
  bank_name?: string;
  account_number?: string;
  whatsapp?: string;
  keterangan?: string;
  transfer_to_id?: number;
  transfer_to_name?: string;
  family_group_id?: number | null;
  zoom_eligible: number; // 1 = eligible, 0 = not eligible
  is_active: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  family_members?: string[]; // names of other family members in same group
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
  zoom_type: "none" | "single" | "family";
  transfer_status: "pending" | "done";
  notify_status: "pending" | "sent" | "skipped";
  transfer_at?: string;
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
  family_group_id?: number | null;
  transfer_fee: number;
}

export function calculateAmount(
  saturdays: number,
  transportRate: number,
  zoomType: "none" | "single" | "family",
  zoomSingleRate: number,
  zoomFamilyRate: number,
): number {
  const transport = saturdays * transportRate;
  const zoom =
    zoomType === "single"
      ? zoomSingleRate
      : zoomType === "family"
        ? zoomFamilyRate
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

export interface FinanceTransaction {
  id?: number;
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
