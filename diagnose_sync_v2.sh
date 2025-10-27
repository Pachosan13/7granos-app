#!/usr/bin/env bash
set -euo pipefail

FUNCTIONS_BASE="${FUNCTIONS_BASE:-https://pktlfjebomjxftszefvp.functions.supabase.co}"
AUTH="Authorization: Bearer ${SUPABASE_ANON_KEY:-}"
BRANCHES=(${BRANCHES:-sf cangrejo costa museo central})

# Fechas Panamá: hoy y ayer
YMD_HOY="$(TZ=America/Panama date +%F)"
YMD_AYER="$(TZ=America/Panama date -v-1d +%F 2>/dev/null || TZ=America/Panama date -d 'yesterday' +%F)"

GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; BLUE="\033[34m"; GRAY="\033[90m"; NC="\033[0m"

if [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
  echo -e "${RED}✗ Falta SUPABASE_ANON_KEY${NC}"
  echo "  export SUPABASE_ANON_KEY='tu_anon_key'"
  exit 1
fi

echo -e "${BLUE}=== Diagnóstico (Panamá) HOY=${YMD_HOY} / AYER=${YMD_AYER} ===${NC}"
echo -e "${GRAY}Base: ${FUNCTIONS_BASE}${NC}\n"

call_endpoint () {
  local url="$1"
  local resp; resp=$(curl -sS -X POST "$url" -H "$AUTH" -H 'Content-Type: application/json' -D - || true)
  local code; code=$(awk 'BEGIN{c=0} /^HTTP/{c=$2} END{print c}' <<< "$resp")
  local body; body=$(sed '1,/^\r$/d' <<< "$resp" | head -c 300)
  echo "$code|||$body"
}

try_range () {
  local branch="$1" ymd="$2"

  # orden de prueba por endpoint
  local urls=(
    "${FUNCTIONS_BASE}/sync-ventas-detalle?desde=${ymd}&hasta=${ymd}&sucursal=${branch}"
    "${FUNCTIONS_BASE}/sync-ventas-v4?desde=${ymd}&hasta=${ymd}&sucursal=${branch}"
    "${FUNCTIONS_BASE}/sync-ventas-v2b?desde=${ymd}&hasta=${ymd}&sucursal=${branch}"
    "${FUNCTIONS_BASE}/sync-ventas?desde=${ymd}&hasta=${ymd}&sucursal=${branch}"
  )

  for u in "${urls[@]}"; do
    local out; out=$(call_endpoint "$u")
    local code="${out%%|||*}"; local body="${out#*|||}"
    if [[ "$code" == "200" || "$code" == "201" || "$code" == "204" ]]; then
      echo -e "  ${GREEN}✓ OK ${NC}(${code}) ${GRAY}${u}${NC}"
      echo -e "    ${GRAY}${body}${NC}"
      return 0
    fi
    # 404 → endpoint no existe, seguimos; 5xx → lo intentamos con el siguiente
    if [[ "$code" == "404" ]]; then
      echo -e "  ${YELLOW}… 404${NC} ${GRAY}${u}${NC}"
    else
      echo -e "  ${RED}✗ ${code:-N/A}${NC} ${GRAY}${u}${NC}"
      echo -e "    ${GRAY}${body:-sin body}${NC}"
    fi
  done
  return 1
}

ok=0; fail=0
for b in "${BRANCHES[@]}"; do
  echo -e "${GRAY}→ Sucursal:${NC} ${b}"
  if try_range "$b" "$YMD_HOY"; then
    ((ok++)) || true
    continue
  fi
  echo -e "  ${YELLOW}… Reintento con AYER (${YMD_AYER})${NC}"
  if try_range "$b" "$YMD_AYER"; then
    ((ok++)) || true
  else
    ((fail++)) || true
  fi
done

echo
echo -e "${BLUE}Resumen:${NC} ${GREEN}${ok} OK${NC} · ${RED}${fail} con error${NC}"
echo -e "${GRAY}Sugerencias: 401/403 → renovar tokens; 5xx → revisar logs de la función.${NC}"

echo
echo "SQL rápida (pegar en Supabase):"
cat <<'SQL'
-- Ventas hoy por sucursal (tabla agregada)
select sucursal_id, sum(total) ventas_hoy, count(*) tx_hoy
from public.ventas
where fecha = current_date
group by sucursal_id
order by ventas_hoy desc nulls last;

-- Última línea de detalle y líneas de hoy (Panamá)
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
