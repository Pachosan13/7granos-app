#!/usr/bin/env bash
set -eo pipefail

REF="pktlfjebomjxftszefvp"
BASE="https://${REF}.supabase.co/functions/v1"
AUTH_URL="https://api6.invupos.com/invuApiPos/index.php?r=auth"
DIA="2025-10-18"
BRANCHES=(sf museo cangrejo costa central)

ask() {
  local var="$1" prompt="$2"
  if [ -z "${!var:-}" ]; then
    read -r -p "$prompt: " val
    export "$var"="$val"
  fi
}

echo "== Credenciales por sucursal =="
for b in "${BRANCHES[@]}"; do
  UVAR="$(echo "${b}_USER" | tr '[:lower:]' '[:upper:]')"
  PVAR="$(echo "${b}_PASS" | tr '[:lower:]' '[:upper:]')"
  ask "$UVAR" "$(printf '%-8s usuario' "$b")"
  ask "$PVAR" "$(printf '%-8s clave  ' "$b")"
done

get_token () {
  local user="$1" pass="$2"
  curl -sS -X POST "$AUTH_URL" \
    -H "Content-Type: application/json" -H "accept: application/json" \
    --data-raw "{\"usuario\":\"${user}\",\"clave\":\"${pass}\"}"
}

any_ok=0
echo
echo "== Solicitando tokens a INVU =="
for b in "${BRANCHES[@]}"; do
  UVAR="$(echo "${b}_USER" | tr '[:lower:]' '[:upper:]')"
  PVAR="$(echo "${b}_PASS" | tr '[:lower:]' '[:upper:]')"
  u="${!UVAR:-}"; p="${!PVAR:-}"

  if [ -z "$u" ] || [ -z "$p" ]; then
    echo "[$b] ⚠️ sin usuario/clave — se omite"
    continue
  fi

  resp="$(get_token "$u" "$p")"
  token="$(printf '%s' "$resp" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"

  if [ -z "$token" ]; then
    echo "[$b] ❌ NO TOKEN. Respuesta:"
    echo "    $resp"
    continue
  fi

  NAME_UPPER="$(echo "$b" | tr '[:lower:]' '[:upper:]')"
  echo "[$b] ✅ ${NAME_UPPER}_TOKEN=${token:0:14}…"
  supabase secrets set "${NAME_UPPER}_TOKEN=$token" --project-ref "$REF" >/dev/null
  any_ok=1
done

if [ "$any_ok" -ne 1 ]; then
  echo "❌ No se obtuvo ningún token. Corrige permisos/cliente en INVU y reintenta."
  exit 1
fi

echo
echo "== Deploy invu-attendance =="
supabase functions deploy invu-attendance --project-ref "$REF" --no-verify-jwt >/dev/null
echo "   ✔️ deploy OK"

# Preflight
curl -s -i -X OPTIONS "$BASE/invu-attendance" \
  -H "Origin: https://7granos-app.vercel.app" \
  -H "Access-Control-Request-Method: GET" >/dev/null

# Aux: epoch Panamá
fini=$(TZ=America/Panama date -j -f "%Y-%m-%d %H:%M:%S" "$DIA 00:00:00" +%s)
ffin=$(TZ=America/Panama date -j -f "%Y-%m-%d %H:%M:%S" "$DIA 23:59:59" +%s)

hit () {
  local url="$1"
  echo "URL: $url"
  curl --connect-timeout 5 -m 30 -sS -w "\nhttp=%{http_code} time=%{time_total}s\n" "$url" || true
  echo
}

echo
echo "== invu-attendance por fecha ($DIA) =="
for b in "${BRANCHES[@]}"; do
  echo "== $b =="
  hit "$BASE/invu-attendance?branch=$b&date=$DIA&debug=1"
done

echo "== invu-attendance por epoch (sf) =="
hit "$BASE/invu-attendance?branch=sf&fini=$fini&ffin=$ffin&debug=1"
