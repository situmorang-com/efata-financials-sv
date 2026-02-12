export interface SeedRecipient {
	name: string;
	bank_name: string | null;
	account_number: string | null;
	whatsapp: string | null;
	keterangan: string | null;
	transfer_to_name: string | null;
}

export const seedRecipients: SeedRecipient[] = [
	{ name: 'Rubiono Rumambi', bank_name: 'BCA', account_number: '2060582940', whatsapp: '6282225681076', keterangan: null, transfer_to_name: null },
	{ name: 'Apolla Arlins L.S', bank_name: 'BCA', account_number: '2060775772', whatsapp: '6281385286273', keterangan: null, transfer_to_name: null },
	{ name: 'Janet Imelda', bank_name: 'BRI', account_number: '322901007506531', whatsapp: '6287795118852', keterangan: null, transfer_to_name: null },
	{ name: 'Andreas', bank_name: 'BRI', account_number: '201001005188539', whatsapp: '6287850254654', keterangan: null, transfer_to_name: null },
	{ name: 'Tejo Haryanto', bank_name: 'BCA', account_number: '5360222219', whatsapp: '6281286663976', keterangan: null, transfer_to_name: null },
	{ name: 'Tjejong (Hery S)', bank_name: 'BCA', account_number: '5360128603', whatsapp: '6281387581057', keterangan: null, transfer_to_name: null },
	{ name: 'Edy Susanto HO (Anita)', bank_name: 'BCA', account_number: '2120350237', whatsapp: '6289501040323', keterangan: null, transfer_to_name: null },
	{ name: 'Oreza Pratama (6282125841847)', bank_name: null, account_number: null, whatsapp: null, keterangan: 'Transfer ke Anita', transfer_to_name: 'Edy Susanto HO (Anita)' },
	{ name: 'Rusmin Hartanto', bank_name: 'BCA', account_number: '0380461081', whatsapp: '6285817665952', keterangan: null, transfer_to_name: null },
	{ name: 'Sarah Angrika Hapsari', bank_name: 'Mandiri', account_number: '1570004858966', whatsapp: '6281908029333', keterangan: null, transfer_to_name: null },
	{ name: 'Dekayanti Pardosi', bank_name: 'Dana', account_number: '628175799520', whatsapp: '6289518802950', keterangan: null, transfer_to_name: null },
	{ name: 'Tirto Margono', bank_name: 'Dana', account_number: '628138736586', whatsapp: '628138736586', keterangan: null, transfer_to_name: null },
	{ name: 'Hellena (628138736586)', bank_name: null, account_number: null, whatsapp: null, keterangan: 'transfer ke Tirto', transfer_to_name: 'Tirto Margono' },
	{ name: 'Johanes Sulaiman', bank_name: 'BCA', account_number: '6240579128', whatsapp: '6287878783573', keterangan: null, transfer_to_name: null },
	{ name: 'Herry Ucok Hutagalung', bank_name: 'Dana', account_number: '6287786796880', whatsapp: '6287786796880', keterangan: null, transfer_to_name: null },
	{ name: 'Angeline Karina Sihaan (Rina)', bank_name: 'Dana', account_number: '62895402746439', whatsapp: '62895402746439', keterangan: null, transfer_to_name: null },
	{ name: 'Martin (62895402746439)', bank_name: null, account_number: null, whatsapp: null, keterangan: 'Transfer ke Rina', transfer_to_name: 'Angeline Karina Sihaan (Rina)' },
	{ name: 'Lim Fui Siang (Jhony Lim)', bank_name: 'Dana', account_number: '6289531835082', whatsapp: '6289531835082', keterangan: null, transfer_to_name: null },
	{ name: 'Ng. Agus Widjaja', bank_name: 'Dana', account_number: '6282122069810', whatsapp: '6282122069810', keterangan: null, transfer_to_name: null },
	{ name: 'Lucya Metahelumual', bank_name: 'BCA', account_number: '7030414297', whatsapp: '6285714748642', keterangan: null, transfer_to_name: null },
	{ name: 'Miralda (6285775456160)', bank_name: null, account_number: null, whatsapp: null, keterangan: 'Transfer ke Lucya', transfer_to_name: 'Lucya Metahelumual' },
	{ name: 'Andreas Witarsa', bank_name: 'Dana', account_number: '6289636302694', whatsapp: '6289636302694', keterangan: null, transfer_to_name: null },
	{ name: 'Suardi', bank_name: 'Dana', account_number: '6283854077492', whatsapp: '6283854077492', keterangan: null, transfer_to_name: null },
	{ name: 'Lucy Camelia', bank_name: 'Dana', account_number: '6289508163651', whatsapp: '6289508163651', keterangan: null, transfer_to_name: null },
	{ name: 'Ronald Alan Tanamal (Ronny)', bank_name: 'Dana', account_number: '628987900500', whatsapp: '628987900500', keterangan: null, transfer_to_name: null },
	{ name: 'Novi', bank_name: null, account_number: null, whatsapp: '6285891415318', keterangan: null, transfer_to_name: null },
];
