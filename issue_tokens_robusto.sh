#!/usr/bin/env bash
set -euo pipefail

URL="https://api6.invupos.com/invuApiPos/userAuth"

probe_user () {
  local label="$1" pass="$2"; shift 2
  local tried=0
  echo "== $label =="

  for u in "$@"; do
    [ -z "$u" ] && continue
    tried=1
    echo "  -> username: $u"
    resp="$(curl -sS "$URL" -X POST \
      -H 'Accept: application/json' \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      --data-urlencode "username=$u" \
      --data-urlencode "password=$pass" \
      --data-urlencode "grant_type=authorization")"

    # éxito si trae 'authorization'
    if printf '%s' "$resp" | grep -q '"authorization"'; then
      token="$(printf '%s' "$resp" | sed -n 's/.*"authorization":"\([^"]*\)".*/\1/p')"
      echo "  ✔ token: ${token:0:14}…"
      printf '%s\n' "$token" > ".token_$label"
      return 0
    fi

    # analiza error
    if printf '%s' "$resp" | grep -q '"status":403'; then
      echo "  ✖ 403 Credenciales incorrectas"
    elif printf '%s' "$resp" | grep -q '"status":500'; then
      echo "  ✖ 500 Internal (revisar usuario API/Actualizar en admin PROD)"
    else
      echo "  ✖ respuesta: $resp"
    fi
  done

  if [ "$tried" -eq 0 ]; then
    echo "  (sin variantes para probar)"
  fi
  return 1
}

# === VARIANTES POR SUCURSAL (ajusta según el admin de PRODUCCIÓN) ===
probe_user "museo"    "Museo111111"    "api_sucursal_Museo" "api_sucursal_museo"
probe_user "cangrejo" "Cangrejo111111" "api_sucursal_Cangrejo" "api_sucursal_cangrejo"
probe_user "costa"    "Costa111111"    "api_sucursal_Costa" "api_sucursal_costa"
probe_user "central"  "Central111111"  "api_sucursal_Central" "api_sucursal_central"

echo
echo "== Resumen tokens generados =="
for f in .token_*; do
  [ -f "$f" ] || continue
  name="${f#.token_}"
  tok="$(cat "$f")"
  echo "  $name: ${tok:0:14}…"
done
