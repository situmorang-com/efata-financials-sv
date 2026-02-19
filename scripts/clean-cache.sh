#!/bin/bash

# Clean SvelteKit cache and rebuild
echo "🧹 Cleaning SvelteKit cache..."
rm -rf .svelte-kit
rm -rf node_modules/.vite

echo "✅ Cache cleared!"
echo ""
echo "Now run: npm run dev"
