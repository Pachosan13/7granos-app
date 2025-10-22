#!/usr/bin/env bash
set -euo pipefail

BASE="https://api6.invupos.com/invuApiPos/index.php?r=producto/kardexreport"
DAY="${1:-$(TZ=America/Panama date +%F)}"   # YYYY-MM-DD
TOKEN="${TOKEN:-${SF_TOKEN:-}}"

if [ -z "${TOKEN:-}" ]; then
  echo "Falta TOKEN (exporta TOKEN o SF_TOKEN)"; exit 1
fi

ini=$(TZ=America/Panama date -j -f "%Y-%m-%d %H:%M:%S" "$DAY 00:00:00" +%s 2>/dev/null || true)
fin=$(TZ=America/Panama date -j -f "%Y-%m-%d %H:%M:%S" "$DAY 23:59:59" +%s 2>/dev/null || true)
[ -z "$ini" ] && ini=$(TZ=America/Panama date -d "$DAY 00:00:00" +%s)
[ -z "$fin" ] && fin=$(TZ=America/Panama date -d "$DAY 23:59:59" +%s)

URL="$BASE/fini/$ini/ffin/$fin"

echo "Kardex (COGS) Día: $DAY  (ini=$ini fin=$fin)"
echo "URL: $URL"
curl -sS -i -w "\nhttp=%{http_code} time=%{time_total}s\n" \
  -H "Authorization: $TOKEN" -H "Accept: application/json" "$URL"
echo
