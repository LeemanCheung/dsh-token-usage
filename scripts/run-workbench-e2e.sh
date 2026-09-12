#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
tools="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/dsh-workbench-browser-tools"
mkdir -p "$tools" test-results/workbench
if ! test -f "$tools/node_modules/@playwright/test/package.json"; then
  npm install --prefix "$tools" --no-audit --no-fund --ignore-scripts @playwright/test@1.55.0 esbuild@0.25.9
fi
"$tools/node_modules/.bin/playwright" install --with-deps chromium
"$tools/node_modules/.bin/esbuild" tests/browser/workbench-client.tsx --bundle --format=esm --target=es2022 --jsx=automatic --define:process.env.NODE_ENV='"development"' --sourcemap --outfile=test-results/workbench/workbench.js
rm -f test-results/workbench/fixture-state.json test-results/workbench/fixture-state.json.tmp
node_modules/.bin/tsx tests/browser/workbench-server.ts > test-results/workbench/server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
ready=false
for attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:18768/fixture >/dev/null 2>&1; then ready=true; break; fi
  if ! kill -0 "$server_pid" 2>/dev/null; then cat test-results/workbench/server.log; exit 1; fi
  sleep 0.25
done
if test "$ready" != true; then cat test-results/workbench/server.log; exit 1; fi
WORKBENCH_BROWSER_TOOLS="$tools" node scripts/workbench-e2e.cjs
