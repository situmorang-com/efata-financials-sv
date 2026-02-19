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
}
