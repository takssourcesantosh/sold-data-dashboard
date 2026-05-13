#!/usr/bin/env bash
# Usage: bash scripts/deploy.sh
# Run on the VPS from the project root (or let it self-locate).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Pulling latest..."
git pull

echo "→ Ensuring data directory exists..."
mkdir -p data

echo "→ Installing dependencies..."
npm ci

echo "→ Building frontend..."
npm run build

echo "→ Restarting server..."
pm2 restart sold-dashboard 2>/dev/null || pm2 start ecosystem.config.cjs

echo "→ Saving PM2 process list..."
pm2 save

echo "✓ Deploy complete — $(date)"
