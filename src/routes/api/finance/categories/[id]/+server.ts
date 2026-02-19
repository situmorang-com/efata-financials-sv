import { json } from '@sveltejs/kit';
import { financeCategoryDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const data = await request.json();
    const id = Number(params.id);
    if (!id) return json({ error: 'Invalid id' }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = String(data.name).trim();
    if (data.kind === 'income' || data.kind === 'expense') updateData.kind = data.kind;
    if (data.parent_id !== undefined) updateData.parent_id = data.parent_id;
    if (data.is_active !== undefined) updateData.is_active = data.is_active ? 1 : 0;

    const success = financeCategoryDb.update(id, updateData);
    if (!success) return json({ error: 'Category not found' }, { status: 404 });

    return json(financeCategoryDb.getById(id));
  } catch (error) {
    console.error('Error updating finance category:', error);
    return json({ error: 'Failed to update finance category' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: 'Invalid id' }, { status: 400 });
    const success = financeCategoryDb.softDelete(id);
    if (!success) return json({ error: 'Category not found' }, { status: 404 });
    return json({ message: 'Deleted' });
  } catch (error) {
    console.error('Error deleting finance category:', error);
    return json({ error: 'Failed to delete finance category' }, { status: 500 });
  }
};
