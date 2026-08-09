#!/usr/bin/env bash
# Rebuild and restart the perf server on 3200, reliably.
#
# `pkill` does not exist on Git Bash for Windows, so an earlier version of this
# loop silently left the OLD server running, measured the unchanged build, and
# reported "no improvement" for a fix that was working. The port check below is
# the guard: if 3200 is still held, stop rather than measure a stale tree.
set -e
cd "$(dirname "$0")/../.."

powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3200 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id \$_ -Force }" >/dev/null 2>&1 || true
sleep 1

npm run build 2>&1 | tail -3
npm run perf:serve > /tmp/perfserve.log 2>&1 &
sleep 6

if grep -q EADDRINUSE /tmp/perfserve.log 2>/dev/null; then
  echo "FATAL: port 3200 still held; the server did not restart." >&2
  exit 1
fi

code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: perf-lab.localhost:3200" http://127.0.0.1:3200/)
echo "perf server ready on 3200 (HTTP $code)"
