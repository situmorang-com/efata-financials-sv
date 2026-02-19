import { json } from '@sveltejs/kit';
import { financePartyDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const data = await request.json();
    const id = Number(params.id);
    if (!id) return json({ error: 'Invalid id' }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = String(data.name).trim();
    if (['member', 'donor', 'vendor', 'other'].includes(data.party_type)) updateData.party_type = data.party_type;
    if (data.whatsapp !== undefined) updateData.whatsapp = data.whatsapp;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.is_active !== undefined) updateData.is_active = data.is_active ? 1 : 0;

    const success = financePartyDb.update(id, updateData);
    if (!success) return json({ error: 'Party not found' }, { status: 404 });

    return json(financePartyDb.getById(id));
  } catch (error) {
    console.error('Error updating finance party:', error);
    return json({ error: 'Failed to update finance party' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: 'Invalid id' }, { status: 400 });
    const success = financePartyDb.softDelete(id);
    if (!success) return json({ error: 'Party not found' }, { status: 404 });
    return json({ message: 'Deleted' });
  } catch (error) {
    console.error('Error deleting finance party:', error);
    return json({ error: 'Failed to delete finance party' }, { status: 500 });
  }
};
