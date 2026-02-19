import { json } from '@sveltejs/kit';
import { financeTransactionDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

function currentMonthKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const month = url.searchParams.get('month') || currentMonthKey();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return json({ error: 'month must be in YYYY-MM format' }, { status: 400 });
    }
    return json(financeTransactionDb.getMonthlySummary(month));
  } catch (error) {
    console.error('Error fetching finance summary report:', error);
    return json({ error: 'Failed to fetch finance summary report' }, { status: 500 });
  }
};
