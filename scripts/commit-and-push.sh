#!/usr/bin/env bash
set -euo pipefail

git config user.name "Chamath Dilshan"
git config user.email "chamathdilshan.dev@gmail.com"
git add resume.json resume.pdf

if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

git commit -m "$COMMIT_MESSAGE"

for attempt in 1 2 3 4 5; do
  if git push; then
    exit 0
  fi
  echo "Push rejected (attempt $attempt) — fetching and rebasing before retry."
  git fetch origin main
  git rebase origin/main
  sleep $(( (RANDOM % 5) + 1 ))
done

echo "Failed to push after multiple retries."
exit 1
