#!/bin/sh
# Runs scripts/bar.ts on every walk at both sizes, then the look probes. Usage: sh scripts/barall.sh http://localhost:5199/
B=${1:-http://localhost:5173/}
for s in walking hungry errands; do
  for size in "1920 1080" "1280 800"; do
    set -- $size
    npx tsx scripts/bar.ts --base "$B" --scenario $s --w $1 --h $2 2>&1 | grep -v "^$"
  done
done
for s in walking hungry errands; do
  npx tsx scripts/bar.ts --base "$B" --scenario $s --probes 2>&1 | grep -E "probe|errors"
done
