import { json } from '@sveltejs/kit';
import { recipientDb, batchItemDb } from '$lib/server/db.js';
import { isValidDate } from '$lib/membership.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const id = Number(params.id);
		const recipient = recipientDb.getById(id);
		if (!recipient) {
			return json({ error: 'Recipient not found' }, { status: 404 });
		}
		return json({
			...recipient,
			periods: recipientDb.getPeriods(id),
			can_purge: recipientDb.canPurge(id)
		});
	} catch (error) {
		console.error('Error fetching recipient:', error);
		return json({ error: 'Failed to fetch recipient' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const id = Number(params.id);
		const data = await request.json();
		// Handle new family group creation
		if (data.family_group_id === -1) {
			data.family_group_id = recipientDb.getNextFamilyGroupId();
		}
		const existing = recipientDb.getById(id);
		if (!existing) {
			return json({ error: 'Recipient not found' }, { status: 404 });
		}

		// Membership dates of the latest period, when the form sends them
		const datesSent = 'start_date' in data || 'end_date' in data;
		if (datesSent) {
			const startDate = data.start_date ?? existing.start_date;
			const endDate = 'end_date' in data ? data.end_date || null : existing.end_date ?? null;
			if (!isValidDate(startDate) || (endDate && !isValidDate(endDate))) {
				return json({ error: 'Tanggal tidak valid' }, { status: 400 });
			}
			try {
				recipientDb.setLatestPeriodDates(id, startDate, endDate);
			} catch (e) {
				return json({ error: (e as Error).message }, { status: 400 });
			}
		}
		const { start_date: _s, end_date: _e, is_active: _a, ...fields } = data;
		recipientDb.update(id, fields);
		const sync = datesSent ? batchItemDb.syncOpenBatches() : undefined;
		return json({ ...recipientDb.getById(id), sync });
	} catch (error) {
		console.error('Error updating recipient:', error);
		return json({ error: 'Failed to update recipient' }, { status: 500 });
	}
};

/**
 * Permanently remove a recipient entered by mistake. Only allowed when
 * nothing was ever paid, notified or proven for them; otherwise end their
 * membership with POST /api/recipients/[id]/end instead.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const id = Number(params.id);
		if (!recipientDb.getById(id)) {
			return json({ error: 'Recipient not found' }, { status: 404 });
		}
		if (!recipientDb.canPurge(id)) {
			return json(
				{ error: 'Penerima sudah punya riwayat transfer; nonaktifkan dengan tanggal berhenti.' },
				{ status: 409 }
			);
		}
		recipientDb.purge(id);
		return json({ message: 'Recipient deleted' });
	} catch (error) {
		console.error('Error deleting recipient:', error);
		return json({ error: 'Failed to delete recipient' }, { status: 500 });
	}
};
