#!/usr/bin/env node

/**
 * Generate a secure random secret for AUTH_SECRET
 * Usage: node scripts/generate-secret.js
 */

import { randomBytes } from 'crypto';

const secret = randomBytes(32).toString('base64');

console.log('\n🔐 Generated AUTH_SECRET:\n');
console.log(secret);
console.log('\n📋 Add this to your .env file:\n');
console.log(`AUTH_SECRET=${secret}`);
console.log('\n⚠️  Keep this secret secure and never commit it to git!\n');
