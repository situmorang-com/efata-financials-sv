// Membership dates for recipients. Dates are plain YYYY-MM-DD strings in
// Jakarta time and periods are YYYY-MM, so string comparison is date order.

const MONTHS_ID = [
	'januari', 'februari', 'maret', 'april', 'mei', 'juni',
	'juli', 'agustus', 'september', 'oktober', 'november', 'desember'
];
const MONTHS_EN = [
	'january', 'february', 'march', 'april', 'may', 'june',
	'july', 'august', 'september', 'october', 'november', 'december'
];

/** YYYY-MM-DD of the given moment in Asia/Jakarta. */
export function jakartaDate(date: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

/** YYYY-MM-DD of today in Asia/Jakarta. */
export function todayJakarta(): string {
	return jakartaDate(new Date());
}

/** "Transfer Februari 2026" -> "2026-02"; null when no month + year is found. */
export function periodFromBatchName(name: string): string | null {
	const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
	for (let i = 0; i < words.length - 1; i++) {
		let month = MONTHS_ID.indexOf(words[i]);
		if (month < 0) month = MONTHS_EN.indexOf(words[i]);
		if (month >= 0 && /^\d{4}$/.test(words[i + 1])) {
			return `${words[i + 1]}-${String(month + 1).padStart(2, '0')}`;
		}
	}
	return null;
}

export function isValidDate(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidPeriod(value: unknown): value is string {
	return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** First and last day (inclusive) of a YYYY-MM period, as comparable strings. */
export function periodBounds(period: string): { first: string; last: string } {
	return { first: `${period}-01`, last: `${period}-31` };
}

/** Day after a YYYY-MM-DD date. */
export function nextDay(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

/** "2026-11-18" -> "18 Nov 2026" */
export function formatMemberDate(date: string | null | undefined): string {
	if (!date) return '-';
	const d = new Date(`${date}T00:00:00Z`);
	return d.toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

/** "2026-02" -> "Februari 2026" */
export function formatPeriod(period: string | null | undefined): string {
	if (!period) return '-';
	const [y, m] = period.split('-');
	const name = MONTHS_ID[Number(m) - 1] ?? m;
	return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

export type MembershipStatus = 'active' | 'upcoming' | 'ending' | 'ended';

export function membershipStatus(
	start: string | null | undefined,
	end: string | null | undefined,
	today: string = todayJakarta()
): MembershipStatus {
	if (end && end < today) return 'ended';
	if (start && start > today) return 'upcoming';
	if (end) return 'ending';
	return 'active';
}
