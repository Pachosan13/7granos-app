#!/usr/bin/env bash
set -euo pipefail

# === CONFIG ===
BASE="https://api6.invupos.com/invuApiPos/index.php?r=empleados/movimientos"
BRANCH="${1:-sf}"
DAY="${2:-$(TZ=America/Panama date +%F)}"    # YYYY-MM-DD
TOKEN="${TOKEN:-}"

# Mapea tokens por sucursal desde variables de entorno
case "$BRANCH" in
  sf)      TOKEN="${TOKEN:-$SF_TOKEN}" ;;
  museo)   TOKEN="${TOKEN:-$MUSEO_TOKEN}" ;;
  cangrejo)TOKEN="${TOKEN:-$CANGREJO_TOKEN}" ;;
  costa)   TOKEN="${TOKEN:-$COSTA_TOKEN}" ;;
  central) TOKEN="${TOKEN:-$CENTRAL_TOKEN}" ;;
  *) echo "Sucursal desconocida: $BRANCH"; exit 2 ;;
esac

if [ -z "${TOKEN:-}" ]; then
  echo "Falta TOKEN para sucursal $BRANCH (exporta SF_TOKEN, etc.)"
  exit 1
fi

# Epochs en TZ Panamá
ini=$(TZ=America/Panama date -j -f "%Y-%m-%d %H:%M:%S" "$DAY 00:00:00" +%s 2>/dev/null || true)
fin=$(TZ=America/Panama date -j -f "%Y-%m-%d %H:%M:%S" "$DAY 23:59:59" +%s 2>/dev/null || true)
# macOS/BSD date usa -j -f; en Linux sería: date -d "$DAY 00:00:00" +%s

if [ -z "$ini" ] || [ -z "$fin" ]; then
  # fallback GNU date (por si tu shell es Linux)
  ini=$(TZ=America/Panama date -d "$DAY 00:00:00" +%s)
  fin=$(TZ=America/Panama date -d "$DAY 23:59:59" +%s)
fi

URL="$BASE/fini/$ini/ffin/$fin"

echo "Sucursal: $BRANCH  Día: $DAY  (ini=$ini fin=$fin)"
echo "URL: $URL"
echo

curl -sS -i -w "\nhttp=%{http_code} time=%{time_total}s\n" \
  -H "Authorization: $TOKEN" \
  -H "Accept: application/json" \
  "$URL"
echo
