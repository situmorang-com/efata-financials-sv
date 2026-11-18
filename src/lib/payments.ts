// Payment lines: a batch seen as the bank transfers that pay it, one line per
// transfer typed into the bank portal (Kopra). A family paid into one account
// is one line; every cash row is paid through one transfer to the cash
// distributor, who hands the money out.
//
// The batch page (Ref / Remark chips), the payments page and the payments PDF
// all build their lines here, so a transfer has the same reference everywhere.

import type { Batch, BatchItem } from './types.js';
import { getTransferFee, type SourceBank } from './transfer-fee.js';
import {
	buildCashReference,
	buildCashRemark,
	buildTransferReference,
	buildTransferRemark
} from './transfer-reference.js';

/** todo: not in the bank portal yet · submitted: entered, awaiting approval · done: sent. */
export type PaymentStatus = 'todo' | 'submitted' | 'done';

/** The person who receives all cash in one transfer and hands it out. Lives in the database, never in code. */
export type CashDistributor = { name: string; bank_name: string; account_number: string };

export type PaymentMember = { itemId: number; name: string; amount: number };

export type PaymentLine = {
	/** "item:<lead row id>" or "cash". */
	key: string;
	kind: 'transfer' | 'cash';
	/** Batch rows this transfer pays (rows with an amount only). */
	itemIds: number[];
	payeeName: string;
	bankName: string;
	/** As stored on the recipient. */
	accountNumber: string;
	/** What to type in the bank portal: a Dana number becomes the source bank's virtual account. */
	payAccountNumber: string;
	members: PaymentMember[];
	amount: number;
	fee: number;
	reference: string;
	remark: string;
	status: PaymentStatus;
};

export function isCashItem(item: Pick<BatchItem, 'payment_method'>): boolean {
	return String(item.payment_method || '').trim().toLowerCase() === 'cash';
}

function digits(value?: string | null): string {
	return String(value || '').replace(/\D/g, '');
}

function lower(value?: string | null): string {
	return String(value || '').trim().toLowerCase();
}

/**
 * Members of one family whose money goes to the same account share a key.
 * Cash rows and rows outside a family group have none.
 */
export function familyTransferKey(item: BatchItem): string | null {
	if (!item.family_group_id || isCashItem(item)) return null;
	const accountNumber = digits(item.actual_account_number || item.account_number);
	const bank = lower(item.actual_bank_name || item.bank_name);
	const destination = accountNumber
		? `acct:${bank}:${accountNumber}`
		: item.transfer_to_id
			? `to:${item.transfer_to_id}`
			: `self:${item.recipient_id}`;
	return `family:${item.family_group_id}:${destination}`;
}

export function sortFamilyMembers(members: BatchItem[]): BatchItem[] {
	return [...members].sort((a, b) => (a.recipient_name || '').localeCompare(b.recipient_name || ''));
}

/** The row whose id names the family's transfer: the first "via" member, else the first by name. */
export function familyLead(sortedMembers: BatchItem[]): BatchItem {
	return sortedMembers.find((member) => member.transfer_to_id) || sortedMembers[0];
}

/** Dana is paid through a virtual account: bank code + phone number starting with 0. */
export function payAccountNumber(
	bankName: string | null | undefined,
	accountNumber: string | null | undefined,
	sourceBank: SourceBank
): string {
	const raw = digits(accountNumber);
	if (lower(bankName) !== 'dana' || !raw) return raw;
	const phone = raw.startsWith('62') ? `0${raw.slice(2)}` : raw.startsWith('8') ? `0${raw}` : raw;
	return `${sourceBank === 'bca' ? '3901' : '89508'}${phone}`;
}

function transferStatus(members: BatchItem[]): PaymentStatus {
	if (members.every((m) => m.transfer_status === 'done')) return 'done';
	if (members.every((m) => m.transfer_status === 'done' || !!m.kopra_submitted_at)) return 'submitted';
	return 'todo';
}

function transferLine(batch: Batch, lead: BatchItem, paid: BatchItem[], sourceBank: SourceBank): PaymentLine {
	const bankName = lead.actual_bank_name || lead.bank_name || '';
	const accountNumber = lead.actual_account_number || lead.account_number || '';
	return {
		key: `item:${lead.id}`,
		kind: 'transfer',
		itemIds: paid.map((m) => m.id!),
		payeeName: lead.transfer_to_name || lead.actual_account_holder || lead.recipient_name || '-',
		bankName,
		accountNumber,
		payAccountNumber: payAccountNumber(bankName, accountNumber, sourceBank),
		members: paid.map((m) => ({ itemId: m.id!, name: m.recipient_name || '-', amount: m.amount || 0 })),
		amount: paid.reduce((sum, m) => sum + (m.amount || 0), 0),
		fee: paid.reduce((sum, m) => sum + (m.transfer_fee || 0), 0),
		reference: buildTransferReference(batch, lead.id!),
		remark: buildTransferRemark(
			batch.name,
			paid.map((m) => m.recipient_name || '')
		),
		status: transferStatus(paid)
	};
}

export function buildPaymentLines(
	batch: Batch,
	items: BatchItem[],
	options: { sourceBank: SourceBank; cashDistributor?: CashDistributor | null }
): PaymentLine[] {
	const { sourceBank, cashDistributor } = options;
	const transfers = items.filter((item) => item.id && !isCashItem(item));

	const families = new Map<string, BatchItem[]>();
	const singles: BatchItem[] = [];
	for (const item of transfers) {
		const key = familyTransferKey(item);
		if (!key) singles.push(item);
		else families.set(key, [...(families.get(key) || []), item]);
	}

	const lines: PaymentLine[] = [];
	for (const members of families.values()) {
		// A "family" of one is an ordinary transfer.
		if (members.length < 2) {
			singles.push(...members);
			continue;
		}
		const sorted = sortFamilyMembers(members);
		const paid = sorted.filter((m) => (m.amount || 0) > 0);
		if (paid.length > 0) lines.push(transferLine(batch, familyLead(sorted), paid, sourceBank));
	}
	for (const item of singles) {
		if ((item.amount || 0) > 0) lines.push(transferLine(batch, item, [item], sourceBank));
	}
	lines.sort((a, b) => a.payeeName.localeCompare(b.payeeName) || a.key.localeCompare(b.key));

	const cash = sortFamilyMembers(items.filter((item) => item.id && isCashItem(item) && (item.amount || 0) > 0));
	if (cash.length > 0) {
		const bankName = cashDistributor?.bank_name || '';
		lines.push({
			key: 'cash',
			kind: 'cash',
			itemIds: cash.map((m) => m.id!),
			payeeName: cashDistributor?.name || '',
			bankName,
			accountNumber: cashDistributor?.account_number || '',
			payAccountNumber: digits(cashDistributor?.account_number),
			members: cash.map((m) => ({ itemId: m.id!, name: m.recipient_name || '-', amount: m.amount || 0 })),
			amount: cash.reduce((sum, m) => sum + (m.amount || 0), 0),
			fee: cashDistributor ? getTransferFee(sourceBank, bankName) : 0,
			reference: buildCashReference(batch),
			remark: buildCashRemark(batch.name, cash.length),
			status: batch.cash_payout_done_at ? 'done' : batch.cash_payout_submitted_at ? 'submitted' : 'todo'
		});
	}
	return lines;
}

export type PaymentTotals = { count: number; amount: number; fee: number };

export function sumPaymentLines(lines: PaymentLine[]): PaymentTotals {
	return {
		count: lines.length,
		amount: lines.reduce((sum, line) => sum + line.amount, 0),
		fee: lines.reduce((sum, line) => sum + line.fee, 0)
	};
}
