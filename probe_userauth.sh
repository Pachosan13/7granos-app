#!/usr/bin/env bash
set -euo pipefail

# Pega aquí TAL CUAL el nombre de usuario como aparece en el Admin (cópialo con el mouse)
U_EXACTO='api_sucursal_Sanfrancisco'    # <-- reemplaza por copy/paste exacto del admin

# Si sospechas que el admin tiene el typo "sucrusal" o "sucurusal", activa variantes:
U_TYPO1="${U_EXACTO/sucursal/sucrusal}"
U_TYPO2="${U_EXACTO/sucursal/sucurusal}"

# Password EXACTA que pusiste y le diste "Actualizar"
PASS='Sanfrancisco111111'

HOSTS=(
  "https://api6.invupos.com"         # PROD
  "https://apidev.invupos.com"       # DEV típico
  "https://api6dev.invupos.com"      # DEV alterno
)

USERS=("$U_EXACTO")
# incluye variantes solo si el reemplazo cambió algo
[ "$U_TYPO1" != "$U_EXACTO" ] && USERS+=("$U_TYPO1")
[ "$U_TYPO2" != "$U_EXACTO" ] && USERS+=("$U_TYPO2")

try() {
  local host="$1" user="$2"
  echo "== host: $host  user: $user =="
  curl -sS "$host/invuApiPos/userAuth" \
    -X POST -H 'Accept: application/json' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "username=$user" \
    --data-urlencode "password=$PASS" \
    --data-urlencode "grant_type=authentication"
  echo -e "\n"
}

for h in "${HOSTS[@]}"; do
  for u in "${USERS[@]}"; do
    try "$h" "$u"
  done
done
