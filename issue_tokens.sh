#!/usr/bin/env bash
set -euo pipefail
URL="https://api6.invupos.com/invuApiPos/userAuth"

issue () {
  local name="$1" user="$2" pass="$3"
  echo "== $name =="
  curl -sS "$URL" -X POST \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "username=$user" \
    --data-urlencode "password=$pass" \
    --data-urlencode "grant_type=authorization"
  echo
}

issue "museo"    "api_sucursal_museo"        "Museo111111"
issue "cangrejo" "api_sucursal_cangrejo"     "Cangrejo111111"
issue "costa"    "api_sucursal_costa"        "Costa111111"
issue "central"  "api_sucursal_central"      "Central111111"
