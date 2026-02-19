import { json } from '@sveltejs/kit';
import { financeCategoryDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const kind = url.searchParams.get('kind');
    if (kind === 'income' || kind === 'expense') {
      return json(financeCategoryDb.getAll(kind));
    }
    return json(financeCategoryDb.getAll());
  } catch (error) {
    console.error('Error fetching finance categories:', error);
    return json({ error: 'Failed to fetch finance categories' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();
    if (!data.name || !data.kind) {
      return json({ error: 'name and kind are required' }, { status: 400 });
    }
    if (data.kind !== 'income' && data.kind !== 'expense') {
      return json({ error: 'kind must be income or expense' }, { status: 400 });
    }
    const category = financeCategoryDb.create({
      name: String(data.name).trim(),
      kind: data.kind,
      parent_id: data.parent_id ?? null
    });
    return json(category, { status: 201 });
  } catch (error) {
    console.error('Error creating finance category:', error);
    return json({ error: 'Failed to create finance category' }, { status: 500 });
  }
};
