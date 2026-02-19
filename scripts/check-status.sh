#!/bin/bash

# Show git status
echo "📋 Git Status:"
git status --short

echo ""
echo "📝 Modified Files:"
git diff --name-only

echo ""
echo "📝 Untracked Files:"
git ls-files --others --exclude-standard

echo ""
echo "📊 Diff Summary:"
git diff --stat
