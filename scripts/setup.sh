#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run db:generate
