#!/usr/bin/env bash
set -euo pipefail

BASE="https://api6.invupos.com/invuApiPos/index.php"
USER="api_sucursal_sanfrancisco"
PASS="Sanfrancisco111111"

try() {
  local label="$1"; shift
  echo "== $label =="
  # -sS: silent pero muestra errores | -i: incluye headers | -w: imprime http y tiempo
  curl -sS -i -w "\nhttp=%{http_code} time=%{time_total}s\n" "$@" \
  | awk 'BEGIN{max=6000} {print; if(length($0)>max) {print "...(truncated)"; exit}}'
  echo
}

# 1) POST x-www-form-urlencoded
try "POST form (usuario/clave, r=auth)" \
  -X POST "$BASE?r=auth" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "usuario=$USER" \
  --data-urlencode "clave=$PASS"

try "POST form (username/password, r=auth)" \
  -X POST "$BASE?r=auth" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "username=$USER" \
  --data-urlencode "password=$PASS"

# 2) POST JSON
try "POST json (usuario/clave, r=auth)" \
  -X POST "$BASE?r=auth" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  --data "{\"usuario\":\"$USER\",\"clave\":\"$PASS\"}"

try "POST json (username/password, r=auth)" \
  -X POST "$BASE?r=auth" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  --data "{\"username\":\"$USER\",\"password\":\"$PASS\"}"

# 3) Rutas alternativas muy comunes en backends PHP
try "POST form (usuario/clave, r=auth/login)" \
  -X POST "$BASE?r=auth/login" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "usuario=$USER" \
  --data-urlencode "clave=$PASS"

try "POST form (username/password, r=auth/login)" \
  -X POST "$BASE?r=auth/login" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "username=$USER" \
  --data-urlencode "password=$PASS"

# 4) GET con query (algunos legacies lo aceptan así)
try "GET query (usuario/clave, r=auth)" \
  "$BASE?r=auth&usuario=$(printf %s "$USER" | jq -sRr @uri)&clave=$(printf %s "$PASS" | jq -sRr @uri)"

try "GET query (username/password, r=auth)" \
  "$BASE?r=auth&username=$(printf %s "$USER" | jq -sRr @uri)&password=$(printf %s "$PASS" | jq -sRr @uri)"

# 5) Siguiendo redirecciones (por si 301/302 a otra ruta)
try "POST form + follow (usuario/clave, r=auth)" \
  -L -X POST "$BASE?r=auth" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "usuario=$USER" \
  --data-urlencode "clave=$PASS"

try "POST form + follow (username/password, r=auth/login)" \
  -L -X POST "$BASE?r=auth/login" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "username=$USER" \
  --data-urlencode "password=$PASS"

# 6) Por si requiere 'client/tenant' (dos nombres frecuentes)
try "POST form con cliente (usuario/clave, r=auth)" \
  -X POST "$BASE?r=auth" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "usuario=$USER" \
  --data-urlencode "clave=$PASS" \
  --data-urlencode "cliente=7granos"

try "POST form con tenant_id (usuario/clave, r=auth)" \
  -X POST "$BASE?r=auth" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "usuario=$USER" \
  --data-urlencode "clave=$PASS" \
  --data-urlencode "tenant_id=7granos"
