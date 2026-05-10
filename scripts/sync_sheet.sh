#!/usr/bin/env bash
# Wrapper para ejecutar sync_sheet.py desde cron en Crostini.
# Maneja logs por mes y entorno limpio. Usa --no-git porque el push lo hace GitHub Actions.

set -e

# Resolver directorio del repo (parent del directorio de este script)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

mkdir -p .sync-logs
LOG=".sync-logs/cron-$(date +%Y-%m).log"

{
  echo ""
  echo "=== $(date -Is) ==="
  /usr/bin/python3 scripts/sync_sheet.py --no-git 2>&1
} >> "$LOG"
