#!/usr/bin/env bash
set -euo pipefail

# === Config ===
# Reemplaza si tu base es distinta. (Este es el dominio que hemos usado antes.)
FUNCTIONS_BASE="${FUNCTIONS_BASE:-https://pktlfjebomjxftszefvp.functions.supabase.co}"
# Exporta tu anon key antes de correr:  export SUPABASE_ANON_KEY="tu_anon_key"
AUTH="Authorization: Bearer ${SUPABASE_ANON_KEY:-}"

# Sucursales a probar (códigos que ya usas: sf, cangrejo, museo, costa, central)
BRANCHES=(${BRANCHES:-sf cangrejo costa museo central})

# Fecha Panamá (YYYY-MM-DD)
YMD="${YMD:-$(TZ=America/Panama date +%F)}"

# Colores
GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; BLUE="\033[34m"; GRAY="\033[90m"; NC="\033[0m"

if [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
  echo -e "${RED}✗ Falta SUPABASE_ANON_KEY en el entorno.${NC}"
  echo "  Exporta primero:  export SUPABASE_ANON_KEY='...'"
  exit 1
fi

echo -e "${BLUE}=== Diagnóstico de sincronización (fecha Panamá: ${YMD}) ===${NC}"
echo -e "${GRAY}Base: ${FUNCTIONS_BASE}${NC}\n"

ok_count=0
fail_count=0

call_endpoint () {
  local url="$1"
  # Enviamos POST, capturamos código y primeros 200 chars del body
  # -s silent, -S show errors, -D - to capture headers in stdout (separamos con awk)
  local resp; resp=$(curl -sS -X POST "$url" -H "$AUTH" -H 'Content-Type: application/json' -D - || true)
  local code; code=$(awk 'BEGIN{c=0} /^HTTP/{c=$2} END{print c}' <<< "$resp")
  local body; body=$(sed '1,/^\r$/d' <<< "$resp" | head -c 200)
  echo "$code|||$body"
}

for branch in "${BRANCHES[@]}"; do
  echo -e "${GRAY}→ Sucursal:${NC} $branch  ${GRAY}(intentando sync-ventas-v4)${NC}"
  URL_V4="${FUNCTIONS_BASE}/sync-ventas-v4?desde=${YMD}&hasta=${YMD}&sucursal=${branch}"
  out=$(call_endpoint "$URL_V4")
  code="${out%%|||*}"; body="${out#*|||}"

  if [[ "$code" == "200" || "$code" == "201" || "$code" == "204" ]]; then
    echo -e "  ${GREEN}✓ OK (${code})${NC}  ${GRAY}${body}${NC}"
    ((ok_count++)) || true
    continue
  fi

  if [[ "$code" == "404" ]]; then
    echo -e "  ${YELLOW}… v4 no disponible (404). Probando sync-ventas (fallback)…${NC}"
    URL_V3="${FUNCTIONS_BASE}/sync-ventas?desde=${YMD}&hasta=${YMD}&sucursal=${branch}"
    out=$(call_endpoint "$URL_V3")
    code="${out%%|||*}"; body="${out#*|||}"
    if [[ "$code" == "200" || "$code" == "201" || "$code" == "204" ]]; then
      echo -e "  ${GREEN}✓ OK fallback (${code})${NC}  ${GRAY}${body}${NC}"
      ((ok_count++)) || true
      continue
    fi
  fi

  echo -e "  ${RED}✗ Falla (${code:-N/A})${NC}  ${GRAY}${body:-sin body}${NC}"
  ((fail_count++)) || true
done

echo
echo -e "${BLUE}Resumen:${NC} ${GREEN}${ok_count} OK${NC} · ${RED}${fail_count} con error${NC}"
echo -e "${GRAY}Si hay errores 401/403, renueva tokens. Si 5xx, intenta nuevamente más tarde.${NC}\n"

echo "SQL de verificación (pégalo en Supabase → SQL Editor):"
cat <<'SQL'
-- ¿Hoy hubo ventas por sucursal?
select sucursal_id, sum(total) as ventas_hoy, count(*) as tx_hoy
from public.ventas
where fecha = current_date
group by sucursal_id
order by ventas_hoy desc nulls last;

-- Última línea en detalle por sucursal (Panamá)
with tz as (
  select timezone('America/Panama', now())::date as hoy,
         (timezone('America/Panama', now())::date + interval '1 day') as maniana
)
select d.sucursal_id, s.nombre,
       max(d.created_at) as ultima_linea_utc,
       count(*) filter (where d.created_at >= (hoy at time zone 'America/Panama')
                        and   d.created_at <  (maniana at time zone 'America/Panama')) as lineas_hoy
from public.invu_ventas_detalle d
left join public.sucursal s on s.id = d.sucursal_id
cross join tz
group by d.sucursal_id, s.nombre
order by ultima_linea_utc desc nulls last;
SQL
