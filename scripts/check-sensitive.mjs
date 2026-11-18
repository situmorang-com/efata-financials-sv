#!/usr/bin/env node
// Blocks member-identifying data from reaching this PUBLIC repo: Indonesian
// phone numbers, bank-account-like digit runs, and data files (.db, .xlsx...).
//
//   node scripts/check-sensitive.mjs           scan lines added in the staged diff (pre-commit)
//   node scripts/check-sensitive.mjs --all     scan every tracked file (CI)
//
// A line that is safe on purpose (an obviously fake example) can carry the
// marker `sensitive-ok`. Known findings awaiting cleanup are listed in
// .sensitive-allow as `path:line-substring` entries.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const all = process.argv.includes('--all');

const BLOCKED_FILES = /\.(db|sqlite|sqlite3|db-wal|db-shm|xlsx|xls|csv|pdf)$/i;
const SKIPPED_FILES = /(^|\/)package-lock\.json$|\.(png|jpe?g|gif|ico|svg|webp|woff2?|ttf)$/i;
const PATTERNS = [
	['phone number', /(?<![\d])(?:\+62|62|0)8\d{7,11}(?![\d])/],
	['account-like number', /(?<![\d.\-:])\d{10,16}(?![\d.\-:])/]
];

function git(args) {
	return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const allow = existsSync('.sensitive-allow')
	? readFileSync('.sensitive-allow', 'utf8')
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l && !l.startsWith('#'))
			.map((l) => {
				const i = l.indexOf(':');
				return { path: l.slice(0, i), text: l.slice(i + 1) };
			})
	: [];

function allowed(path, line) {
	if (line.includes('sensitive-ok')) return true;
	return allow.some((a) => a.path === path && line.includes(a.text));
}

/** @type {{path: string, line: number | null, reason: string, text: string}[]} */
const findings = [];

function scanLine(path, lineNo, text) {
	if (allowed(path, text)) return;
	for (const [reason, re] of PATTERNS) {
		if (re.test(text)) {
			findings.push({ path, line: lineNo, reason, text: text.trim().slice(0, 100) });
			return;
		}
	}
}

if (all) {
	const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
	for (const path of files) {
		if (BLOCKED_FILES.test(path)) {
			findings.push({ path, line: null, reason: 'data file', text: '' });
			continue;
		}
		if (SKIPPED_FILES.test(path) || !existsSync(path)) continue;
		const content = readFileSync(path);
		if (content.includes(0)) continue; // binary
		content
			.toString('utf8')
			.split('\n')
			.forEach((text, i) => scanLine(path, i + 1, text));
	}
} else {
	const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
		.split('\0')
		.filter(Boolean);
	for (const path of staged) {
		if (BLOCKED_FILES.test(path)) {
			findings.push({ path, line: null, reason: 'data file', text: '' });
		}
	}
	const diff = git(['diff', '--cached', '--unified=0', '--no-color', '--diff-filter=ACMR']);
	let path = '';
	let lineNo = 0;
	for (const raw of diff.split('\n')) {
		if (raw.startsWith('+++ ')) {
			path = raw.slice(4).replace(/^b\//, '');
			continue;
		}
		const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
		if (hunk) {
			lineNo = Number(hunk[1]);
			continue;
		}
		if (raw.startsWith('+') && !SKIPPED_FILES.test(path)) {
			scanLine(path, lineNo, raw.slice(1));
			lineNo++;
		}
	}
}

if (findings.length === 0) process.exit(0);

console.error('\ncheck-sensitive: possible member data in a PUBLIC repo\n');
for (const f of findings) {
	console.error(`  ${f.path}${f.line ? `:${f.line}` : ''}  ${f.reason}${f.text ? `  ${f.text}` : ''}`);
}
console.error(
	'\nReal data stays out of git (see docs/DEPLOY.md). For an obviously fake example add the\n' +
		'marker `sensitive-ok` on that line.\n'
);
process.exit(1);
