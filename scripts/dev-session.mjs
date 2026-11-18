#!/usr/bin/env node
// Mint an Auth.js session cookie for LOCAL testing, so an agent or a script
// can open pages and call /api without a Google sign-in.
//
//   AUTH_SECRET=... node scripts/dev-session.mjs [email]
//
// AUTH_SECRET comes from the environment or ./.env and must be the secret the
// local server runs with. Prints the cookie value; set it on http://localhost
// as `authjs.session-token` (e.g. `curl -H "Cookie: authjs.session-token=…"`).
// The allowlist in src/hooks.server.ts is enforced at Google sign-in only, so
// any email works here.

import { encode } from '@auth/core/jwt';
import { existsSync, readFileSync } from 'node:fs';

function fromDotEnv(key) {
	if (!existsSync('.env')) return undefined;
	const line = readFileSync('.env', 'utf8')
		.split('\n')
		.find((l) => l.startsWith(`${key}=`));
	return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
}

const origin = process.env.ORIGIN || fromDotEnv('ORIGIN') || '';
if (process.env.NODE_ENV === 'production' || (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/.test(origin))) {
	console.error('dev-session: refusing, this is for a local server only (NODE_ENV/ORIGIN look like production)');
	process.exit(1);
}

const secret = process.env.AUTH_SECRET || fromDotEnv('AUTH_SECRET');
if (!secret) {
	console.error('dev-session: set AUTH_SECRET (the one the local server runs with) or put it in .env');
	process.exit(1);
}

const email = process.argv[2] || 'dev@example.test';
const token = await encode({
	token: { name: 'Local Dev', email, sub: 'local-dev' },
	secret,
	salt: 'authjs.session-token',
	maxAge: 24 * 60 * 60
});
process.stdout.write(token + '\n');
