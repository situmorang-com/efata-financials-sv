#!/usr/bin/env node

/**
 * Display setup instructions when running npm install
 */

console.log('\n' + '='.repeat(60));
console.log('  🎉 EFATA FINANCIALS - SETUP READY!');
console.log('='.repeat(60) + '\n');

console.log('✅ Dependencies installed successfully!\n');

console.log('📋 NEXT STEPS:\n');
console.log('1️⃣  Set up Google OAuth (5 minutes)');
console.log('   → Open: QUICKSTART.md');
console.log('   → Visit: https://console.cloud.google.com/apis/credentials\n');

console.log('2️⃣  Configure .env file');
console.log('   → Generate secret: npm run generate-secret');
console.log('   → Add your Google OAuth credentials\n');

console.log('3️⃣  Start development server');
console.log('   → Run: npm run dev');
console.log('   → Visit: http://localhost:5173\n');

console.log('📚 DOCUMENTATION:\n');
console.log('   • SETUP_COMPLETE.md    - Complete overview');
console.log('   • QUICKSTART.md        - 5-minute setup guide');
console.log('   • AUTH_SETUP.md        - Authentication details');
console.log('   • COOLIFY_DEPLOYMENT.md - Deploy to production\n');

console.log('🔐 AUTHORIZED USERS:\n');
console.log('   • edmundsitumorang@gmail.com');
console.log('   • situmeangirhen@gmail.com\n');

console.log('💡 TIP: Start with QUICKSTART.md for the fastest setup!\n');

console.log('='.repeat(60) + '\n');
