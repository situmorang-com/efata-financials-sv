import { json } from '@sveltejs/kit';
import { financeAccountDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const asOf = url.searchParams.get('as_of') || undefined;
    if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      return json({ error: 'as_of must be in YYYY-MM-DD format' }, { status: 400 });
    }
    return json(financeAccountDb.getBalances(asOf));
  } catch (error) {
    console.error('Error fetching account balances:', error);
    return json({ error: 'Failed to fetch account balances' }, { status: 500 });
  }
};
