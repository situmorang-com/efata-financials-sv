// Fictional sample recipients for a fresh local database (seeded only when the
// recipients table is empty). Real member data never goes in git: the repo is
// public. Production data lives on the server volume (docs/DEPLOY.md).
export interface SeedRecipient {
	name: string;
	bank_name: string | null;
	account_number: string | null;
	whatsapp: string | null;
	keterangan: string | null;
	transfer_to_name: string | null;
}

export const seedRecipients: SeedRecipient[] = [
	{ name: 'Contoh Andi', bank_name: 'BCA', account_number: '1111111111', whatsapp: '6281100000001', keterangan: null, transfer_to_name: null }, // sensitive-ok: fictional
	{ name: 'Contoh Budi', bank_name: 'Mandiri', account_number: '2222222222', whatsapp: '6281100000002', keterangan: null, transfer_to_name: null }, // sensitive-ok: fictional
	{ name: 'Contoh Citra', bank_name: 'Dana', account_number: '6281100000003', whatsapp: '6281100000003', keterangan: null, transfer_to_name: null }, // sensitive-ok: fictional
	{ name: 'Contoh Dewi', bank_name: null, account_number: null, whatsapp: null, keterangan: 'Transfer ke Contoh Citra', transfer_to_name: 'Contoh Citra' },
	{ name: 'Contoh Eko', bank_name: 'BRI', account_number: '3333333333', whatsapp: null, keterangan: null, transfer_to_name: null } // sensitive-ok: fictional
];
