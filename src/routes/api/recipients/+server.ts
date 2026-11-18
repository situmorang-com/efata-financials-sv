import { json } from '@sveltejs/kit';
import { recipientDb, batchItemDb } from '$lib/server/db.js';
import { isValidDate, todayJakarta } from '$lib/membership.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const search = url.searchParams.get('search');
		if (search) return json(recipientDb.search(search));
		// ?include=ended also returns people whose membership has ended
		const recipients =
			url.searchParams.get('include') === 'ended'
				? recipientDb.getAllIncludingEnded()
				: recipientDb.getAll();
		return json(recipients);
	} catch (error) {
		console.error('Error fetching recipients:', error);
		return json({ error: 'Failed to fetch recipients' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		if (!data.name) {
			return json({ error: 'Name is required' }, { status: 400 });
		}
		const startDate = data.start_date || todayJakarta();
		if (!isValidDate(startDate)) {
			return json({ error: 'Tanggal mulai tidak valid' }, { status: 400 });
		}
		const endDate = data.end_date || null;
		if (endDate && (!isValidDate(endDate) || endDate < startDate)) {
			return json({ error: 'Tanggal berhenti tidak valid' }, { status: 400 });
		}
		// Handle new family group creation
		let familyGroupId = data.family_group_id ?? null;
		if (familyGroupId === -1) {
			familyGroupId = recipientDb.getNextFamilyGroupId();
		}
		const recipient = recipientDb.create({
			name: data.name,
			bank_name: data.bank_name,
			account_number: data.account_number,
			whatsapp: data.whatsapp,
			keterangan: data.keterangan,
			transfer_to_id: data.transfer_to_id,
			account_holder_name: data.account_holder_name,
			account_holder_relation: data.account_holder_relation,
			family_group_id: familyGroupId,
			zoom_eligible: data.zoom_eligible ?? 1,
			is_active: 1,
			start_date: startDate,
			end_date: endDate
		});
		const sync = batchItemDb.syncOpenBatches();
		return json({ ...recipient, sync }, { status: 201 });
	} catch (error) {
		console.error('Error creating recipient:', error);
		return json({ error: 'Failed to create recipient' }, { status: 500 });
	}
};
