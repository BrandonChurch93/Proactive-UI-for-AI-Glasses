#!/bin/sh
# Runs scripts/bar.ts on every walk at both sizes, two live laps, then the look probes. Usage: sh scripts/barall.sh http://localhost:5199/
B=${1:-http://localhost:5173/}
for s in walking hungry errands; do
  for size in "1920 1080" "3840 2160"; do
    set -- $size
    npx tsx scripts/bar.ts --base "$B" --scenario $s --w $1 --h $2 2>&1 | grep -v "^$"
  done
done
npx tsx scripts/bar.ts --base "$B" --scenario walking --lap --until 380 --w 1920 --h 1080 2>&1 | grep -v "^$"
for s in walking hungry errands; do
  npx tsx scripts/bar.ts --base "$B" --scenario $s --probes 2>&1 | grep -E "probe|errors"
done
