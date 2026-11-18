#!/usr/bin/env node
// Run the dev server against a throwaway copy of data/efata.db, so testing
// (by hand or by an agent) never touches the real local database.
//
//   npm run dev:copy -- [vite dev args, e.g. --port 3001]
//
// Each run takes a fresh, consistent snapshot into .data-copy/ (gitignored)
// through SQLite's online backup API, then starts `vite dev` with
// DATA_DIR=.data-copy. Pass --keep to reuse the previous copy.

import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const viteArgs = args.filter((a) => a !== '--keep');

const source = resolve('data');
const target = resolve('.data-copy');

if (!keep || !existsSync(join(target, 'efata.db'))) {
	rmSync(target, { recursive: true, force: true });
	mkdirSync(target, { recursive: true });
	if (existsSync(join(source, 'efata.db'))) {
		const db = new Database(join(source, 'efata.db'), { readonly: true });
		await db.backup(join(target, 'efata.db'));
		db.close();
		for (const dir of ['proofs', 'approval-proofs']) {
			if (existsSync(join(source, dir))) cpSync(join(source, dir), join(target, dir), { recursive: true });
		}
		console.log(`dev-copy: snapshot of data/efata.db in ${target}`);
	} else {
		console.log('dev-copy: no data/efata.db, starting from an empty database');
	}
} else {
	console.log(`dev-copy: reusing ${target}`);
}

const child = spawn('npx', ['vite', 'dev', ...viteArgs], {
	stdio: 'inherit',
	env: { ...process.env, DATA_DIR: target }
});
child.on('exit', (code) => process.exit(code ?? 0));
