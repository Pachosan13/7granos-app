#!/usr/bin/env bash
set -euo pipefail

BASE="https://pktlfjebomjxftszefvp.functions.supabase.co/invu-attendance"
DAY="${1:-$(TZ=America/Panama date +%F)}"  # YYYY-MM-DD
branches=(sf museo cangrejo costa central)

echo "== invu-attendance (date=$DAY) =="
for b in "${branches[@]}"; do
  echo "---- $b ----"
  url="$BASE?branch=$b&date=$DAY&debug=1"
  echo "URL: $url"
  curl -sS "$url"
  echo -e "\n"
done
