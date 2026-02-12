import { json } from '@sveltejs/kit';
import { recipientDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const recipient = recipientDb.getById(Number(params.id));
		if (!recipient) {
			return json({ error: 'Recipient not found' }, { status: 404 });
		}
		return json(recipient);
	} catch (error) {
		console.error('Error fetching recipient:', error);
		return json({ error: 'Failed to fetch recipient' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		// Handle new family group creation
		if (data.family_group_id === -1) {
			data.family_group_id = recipientDb.getNextFamilyGroupId();
		}
		const success = recipientDb.update(Number(params.id), data);
		if (!success) {
			return json({ error: 'Recipient not found' }, { status: 404 });
		}
		const updated = recipientDb.getById(Number(params.id));
		return json(updated);
	} catch (error) {
		console.error('Error updating recipient:', error);
		return json({ error: 'Failed to update recipient' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const success = recipientDb.softDelete(Number(params.id));
		if (!success) {
			return json({ error: 'Recipient not found' }, { status: 404 });
		}
		return json({ message: 'Recipient deleted' });
	} catch (error) {
		console.error('Error deleting recipient:', error);
		return json({ error: 'Failed to delete recipient' }, { status: 500 });
	}
};
