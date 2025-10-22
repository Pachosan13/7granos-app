#!/usr/bin/env bash
set -eo pipefail

# ===== Config =====
REF="pktlfjebomjxftszefvp"
BASE="https://${REF}.supabase.co/functions/v1"
AUTH_URL="https://api6.invupos.com/invuApiPos/index.php?r=auth"
DIA="2025-10-18"   # cambia si quieres probar otro día

BRANCHES=(sf museo cangrejo costa central)

# Pide dato si está vacío
ask() {
  local var="$1" prompt="$2"
  if [ -z "${!var:-}" ]; then
    read -r -p "$prompt: " val
    export "$var"="$val"
  fi
}

echo "== Credenciales por sucursal (escribe cada usuario/clave correcto, SIN tildes/ñ) =="

for b in "${BRANCHES[@]}"; do
  UVAR="$(echo "${b}_USER"    | tr '[:lower:]' '[:upper:]')"   # p.ej. SF_USER
  PVAR="$(echo "${b}_PASS"    | tr '[:lower:]' '[:upper:]')"   # p.ej. SF_PASS
  ask "$UVAR" "$(printf '%-8s usuario' "$b")"
  ask "$PVAR" "$(printf '%-8s clave'   "$b")"
done

get_token () {
  local user="$1" pass="$2"
  curl -sS -X POST "$AUTH_URL" -H "Content-Type: application/json" \
    -d "{\"usuario\":\"${user}\",\"clave\":\"${pass}\"}" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'
}

epoch_range_panama () {
  local ymd="$1"
  local fini ffin
  fini=$(TZ=America/Panama date -j -f "%Y-%m-%d %H:%M:%S" "$ymd 00:00:00" +%s)
  ffin=$(TZ=America/Panama date -j -f "%Y-%m-%d %H:%M:%S" "$ymd 23:59:59" +%s)
  echo "$fini $ffin"
}

echo
echo "== Solicitando tokens a INVU =="
any_ok=0
for b in "${BRANCHES[@]}"; do
  UVAR="$(echo "${b}_USER" | tr '[:lower:]' '[:upper:]')"
  PVAR="$(echo "${b}_PASS" | tr '[:lower:]' '[:upper:]')"
  u="${!UVAR:-}"; p="${!PVAR:-}"

  if [ -z "$u" ] || [ -z "$p" ]; then
    echo "[$b] ⚠️  sin usuario/clave — se omite"
    continue
  fi

  token="$(get_token "$u" "$p" || true)"
  if [ -z "$token" ]; then
    echo "[$b] ❌ No se obtuvo token (verifica usuario/clave/tenant/permisos en INVU)."
    continue
  fi

  name_upper="$(echo "$b" | tr '[:lower:]' '[:upper:]')"   # SF/MUSEO/…
  echo "[$b] ✅ ${name_upper}_TOKEN=${token:0:12}…"
  supabase secrets set "${name_upper}_TOKEN=${token}" --project-ref "$REF" >/dev/null
  any_ok=1
done

if [ "$any_ok" -ne 1 ]; then
  echo "❌ No se obtuvo ningún token. Revisa usuarios/contraseñas (sin tildes/ñ) y permisos de INVU."
  exit 1
fi

echo
echo "== Redeploy invu-attendance =="
supabase functions deploy invu-attendance --project-ref "$REF" --no-verify-jwt >/dev/null
echo "   ✔️ Deploy OK"

# Warm-up (CORS preflight)
curl -s -i -X OPTIONS "$BASE/invu-attendance" \
  -H "Origin: https://7granos-app.vercel.app" \
  -H "Access-Control-Request-Method: GET" >/dev/null

read -r FINI FFIN < <(epoch_range_panama "$DIA")
echo "Fecha $DIA → fini=$FINI ffin=$FFIN"

hit () {
  local url="$1"
  echo "URL: $url"
  curl --connect-timeout 5 -m 30 -sS -w "\nhttp=%{http_code} time=%{time_total}s\n" "$url" || true
  echo
}

echo
echo "== Prueba por fecha (date=YYYY-MM-DD) =="
for b in "${BRANCHES[@]}"; do
  echo "== $b =="
  hit "$BASE/invu-attendance?branch=$b&date=$DIA&debug=1"
done

echo "== Prueba por epoch (fini/ffin, sf) =="
hit "$BASE/invu-attendance?branch=sf&fini=$FINI&ffin=$FFIN&debug=1"
