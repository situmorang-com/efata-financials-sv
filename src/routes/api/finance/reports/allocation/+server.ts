import { json } from '@sveltejs/kit';
import { financeTransactionDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function monthStartKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const dateFrom = url.searchParams.get('date_from') || monthStartKey();
    const dateTo = url.searchParams.get('date_to') || todayKey();
    const typeParam = url.searchParams.get('type') || 'income';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      return json({ error: 'date_from must be in YYYY-MM-DD format' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return json({ error: 'date_to must be in YYYY-MM-DD format' }, { status: 400 });
    }
    if (dateFrom > dateTo) {
      return json({ error: 'date_from must be earlier than or equal to date_to' }, { status: 400 });
    }
    if (!['income', 'expense', 'all'].includes(typeParam)) {
      return json({ error: 'type must be income, expense, or all' }, { status: 400 });
    }

    return json(
      financeTransactionDb.getAllocationSummary({
        date_from: dateFrom,
        date_to: dateTo,
        type: typeParam as 'income' | 'expense' | 'all'
      })
    );
  } catch (error) {
    console.error('Error fetching finance allocation report:', error);
    return json({ error: 'Failed to fetch finance allocation report' }, { status: 500 });
  }
};
