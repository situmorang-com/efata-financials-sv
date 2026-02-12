import { json } from '@sveltejs/kit';
import { recipientDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

// Create or update a family group
export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		const { recipient_ids } = data;
		if (!recipient_ids || !Array.isArray(recipient_ids) || recipient_ids.length < 2) {
			return json({ error: 'At least 2 recipient_ids are required' }, { status: 400 });
		}
		const groupId = recipientDb.getNextFamilyGroupId();
		const count = recipientDb.setFamilyGroup(recipient_ids, groupId);
		return json({ message: `Created family group ${groupId} with ${count} members`, group_id: groupId, count });
	} catch (error) {
		console.error('Error creating family group:', error);
		return json({ error: 'Failed to create family group' }, { status: 500 });
	}
};

// Remove a family group (unlink members)
export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		const { recipient_ids } = data;
		if (!recipient_ids || !Array.isArray(recipient_ids)) {
			return json({ error: 'recipient_ids array is required' }, { status: 400 });
		}
		const count = recipientDb.setFamilyGroup(recipient_ids, null);
		return json({ message: `Removed ${count} members from family group`, count });
	} catch (error) {
		console.error('Error removing family group:', error);
		return json({ error: 'Failed to remove family group' }, { status: 500 });
	}
};
