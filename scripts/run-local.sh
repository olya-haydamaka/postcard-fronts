#!/usr/bin/env bash
# Runs the postcard tool on this machine. Windows: scripts/run-local.ps1 takes the same options.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/run-local.sh [dev|prod] [--lan] [--port N]

  dev        Vite dev server with hot reload (the default): http://localhost:5173
  prod       the production build, served by wrangler with the real headers (CSP),
             as Cloudflare serves it: http://localhost:8787
  --lan      listen on all interfaces, so phones and other computers on the network can open it
  --port N   use port N instead

Installs the dependencies first (npm ci) when node_modules is missing or doesn't match package-lock.json. A version
bump alone doesn't count (scripts/deps.mjs).
EOF
}

mode=dev
lan=0
port=
while [ $# -gt 0 ]; do
  case "$1" in
    dev | prod) mode=$1 ;;
    --lan) lan=1 ;;
    --port)
      [ $# -ge 2 ] || { usage >&2; exit 2; }
      port=$2
      shift
      ;;
    --port=*) port=${1#--port=} ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done
case "$port" in
  '') ;;
  *[!0-9]*) echo "--port takes a number, not '$port'." >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."

command -v node >/dev/null 2>&1 || {
  echo "Node.js not found. Install the version in .nvmrc: https://nodejs.org" >&2
  exit 1
}
node -e '
const want = /(\d+)\.(\d+)/.exec(require(`./package.json`).engines.node).slice(1).map(Number);
const have = process.versions.node.split(`.`).map(Number);
if (have[0] < want[0] || (have[0] === want[0] && have[1] < want[1])) {
  console.error(`Node ${want.join(`.`)} or newer is required; this is ${process.versions.node}.`);
  process.exit(1);
}'

if ! node scripts/deps.mjs check; then
  echo "Installing dependencies (npm ci)..."
  npm ci || {
    echo "If npm reported EPERM or EBUSY, a dev server, preview or test run of this project still has a file in node_modules open: stop it and run this again." >&2
    exit 1
  }
  node scripts/deps.mjs stamp
fi

# The flags are fixed words and a checked number, so word splitting below is intended.
case "$mode" in
  dev)
    flags=
    if [ "$lan" = 1 ]; then flags="$flags --host"; fi
    if [ -n "$port" ]; then flags="$flags --port $port"; fi
    # shellcheck disable=SC2086
    exec npm run dev -- $flags
    ;;
  prod)
    npm run build
    flags="--port ${port:-8787}"
    if [ "$lan" = 1 ]; then flags="$flags --ip 0.0.0.0"; fi
    # shellcheck disable=SC2086
    exec npx wrangler dev $flags
    ;;
esac
