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
  saturdays_attended: number;
  zoom_type: "none" | "single" | "family";
  transfer_status: "pending" | "done";
  notify_status: "pending" | "sent" | "skipped";
  transfer_at?: string;
  notified_at?: string;
  transfer_proof?: string; // base64 data URL (only fetched on-demand via proof endpoint)
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
