#!/usr/bin/env bash
set -euo pipefail

# Requiere que estas variables ya estén seteadas:
: "${SUPABASE_ANON_KEY:?export SUPABASE_ANON_KEY='...JWT CON PUNTOS...'}"
: "${FUNCTIONS_BASE:?export FUNCTIONS_BASE='https://pktlfjebomjxftszefvp.functions.supabase.co'}"
: "${FINI:?export FINI='2025-10-12'}"
: "${FFIN:?export FFIN='2025-10-26'}"

BRANCHES=(sf cangrejo costa museo central)
mkdir -p out/payroll

request() {
  local url="$1" out="$2"
  # Guardamos body en archivo y mostramos HTTP code en consola
  local code
  code=$(curl -sS -w '%{http_code}' -o "$out" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    "$url" || true)
  echo "  HTTP $code  $url"
  if [[ "$code" -ge 400 ]]; then
    echo "  Body (primeros 300 chars):"
    head -c 300 "$out" ; echo
  fi
}

echo "=== Empleados (read-only) ==="
for b in "${BRANCHES[@]}"; do
  echo "→ empleados $b"
  request "$FUNCTIONS_BASE/payroll-employees?sucursal=$b" "out/payroll/${b}_employees.json"
done

echo
echo "=== Marcaciones (read-only) $FINI..$FFIN ==="
for b in "${BRANCHES[@]}"; do
  echo "→ marcaciones $b"
  request "$FUNCTIONS_BASE/payroll-marcaciones?fini=$FINI&ffin=$FFIN&sucursal=$b" "out/payroll/${b}_marcaciones.json"
done

echo
echo "Archivos guardados en out/payroll"
