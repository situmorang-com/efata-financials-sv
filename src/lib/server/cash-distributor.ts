// The person who receives a batch's cash in one bank transfer and hands it out
// to the recipients paid in cash. Their name, bank account and WhatsApp number
// are stored in the database (app_settings), never in the code: the repository
// is public.
import type { CashDistributor } from "$lib/payments.js";
import { settingsDb } from "./db.js";

const KEY = "cash_distributor";

function text(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function getCashDistributor(): CashDistributor | null {
  const raw = settingsDb.get(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CashDistributor>;
    const name = text(parsed.name, 80);
    const bank_name = text(parsed.bank_name, 40);
    const account_number = text(parsed.account_number, 40);
    const whatsapp = text(parsed.whatsapp, 30);
    return name && bank_name && account_number
      ? { name, bank_name, account_number, whatsapp }
      : null;
  } catch {
    return null;
  }
}

/** Saves the distributor; returns an error message when a field is missing. */
export function saveCashDistributor(input: unknown): CashDistributor | string {
  const data = (input ?? {}) as Record<string, unknown>;
  const value: CashDistributor = {
    name: text(data.name, 80),
    bank_name: text(data.bank_name, 40),
    account_number: text(data.account_number, 40),
    whatsapp: text(data.whatsapp, 30),
  };
  if (!value.name || !value.bank_name || !value.account_number) {
    return "Nama, bank dan nomor rekening wajib diisi";
  }
  if (!/\d{5,}/.test(value.account_number.replace(/\D/g, ""))) {
    return "Nomor rekening tidak valid";
  }
  if (value.whatsapp && !/^\+?\d{9,15}$/.test(value.whatsapp.replace(/[\s\-()]/g, ""))) {
    return "Nomor WhatsApp tidak valid";
  }
  settingsDb.set(KEY, JSON.stringify(value));
  return value;
}
