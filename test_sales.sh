#!/usr/bin/env bash
set -euo pipefail

# === CONFIG ===
BASE="https://api6.invupos.com/invuApiPos/index.php?r=citas/ordenesAllAdv"
DAY="${1:-$(TZ=America/Panama date +%F)}"   # YYYY-MM-DD
STATUS="${2:-all}"                          # 0,1,2,3,4 o 'all' (ver doc)
TOKEN="${TOKEN:-${SF_TOKEN:-}}"

if [ -z "${TOKEN:-}" ]; then
  echo "Falta TOKEN (exporta TOKEN o SF_TOKEN)"; exit 1
fi

# Epochs en TZ Panamá (UTC-5, sin DST)
ini=$(TZ=America/Panama date -j -f "%Y-%m-%d %H:%M:%S" "$DAY 00:00:00" +%s 2>/dev/null || true)
fin=$(TZ=America/Panama date -j -f "%Y-%m-%d %H:%M:%S" "$DAY 23:59:59" +%s 2>/dev/null || true)
[ -z "$ini" ] && ini=$(TZ=America/Panama date -d "$DAY 00:00:00" +%s)
[ -z "$fin" ] && fin=$(TZ=America/Panama date -d "$DAY 23:59:59" +%s)

URL="$BASE/fini/$ini/ffin/$fin/tipo/$STATUS"

echo "Ventas Día: $DAY  (ini=$ini fin=$fin)  status=$STATUS"
echo "URL: $URL"
curl -sS -i -w "\nhttp=%{http_code} time=%{time_total}s\n" \
  -H "Authorization: $TOKEN" -H "Accept: application/json" "$URL"
echo
