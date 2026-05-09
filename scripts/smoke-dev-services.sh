#!/usr/bin/env bash
# Smoke test phase "dev" — start each backend service in local Node with the
# DEV @modjo/core swapped in via symlink. Each service runs in background;
# logs go to /tmp/modjo-smoke-<svc>.log. We wait for HTTP healthcheck (api,
# files) or for the "ready" log line (tasks, watchers).
#
# trap-based cleanup: on any exit we kill all started services AND restore
# the original vendored @modjo/core, even on Ctrl-C / crash.

set -euo pipefail

DEV_CORE="${DEV_CORE:-/home/jo/lab/devthefuture/modjo/packages/core}"
ALERTE_SECOURS="${ALERTE_SECOURS:-/home/jo/lab/alerte-secours/apps/alerte-secours}"
LOG_DIR="${LOG_DIR:-/tmp}"

VENDORED="$ALERTE_SECOURS/node_modules/@modjo/core"
BACKUP="$VENDORED.bak.smokedev-$$"
PIDS=()

cleanup() {
  local rc=$?
  echo ""
  echo "[cleanup] stopping services …"
  for pid in "${PIDS[@]:-}"; do
    [[ -z "${pid:-}" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  for pid in "${PIDS[@]:-}"; do
    [[ -z "${pid:-}" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  echo "[cleanup] restoring vendored @modjo/core …"
  if [[ -L "$VENDORED" ]]; then
    rm "$VENDORED"
  elif [[ -d "$VENDORED" ]] && [[ -e "$BACKUP" ]]; then
    rm -rf "$VENDORED"
  fi
  if [[ -e "$BACKUP" ]]; then
    mv "$BACKUP" "$VENDORED"
  fi
  exit $rc
}
trap cleanup EXIT INT TERM

if [[ -d "$VENDORED" ]] || [[ -L "$VENDORED" ]]; then
  echo "[swap] backup → $BACKUP"
  mv "$VENDORED" "$BACKUP"
fi
ln -s "$DEV_CORE" "$VENDORED"

NODE_BIN="$(cd "$ALERTE_SECOURS" && devbox run --quiet -- which node 2>/dev/null | tail -1)"
echo "[node] $NODE_BIN ($("$NODE_BIN" --version))"

# load .env exports for the service runtimes
set -a
# shellcheck disable=SC1091
source "$ALERTE_SECOURS/.env" 2>/dev/null || true
set +a

start_service() {
  local svc="$1"
  local mode="${2:-dev}"
  local svc_dir="$ALERTE_SECOURS/services/$svc"
  local log="$LOG_DIR/modjo-smoke-$svc.log"
  echo "[start] $svc (mode=$mode) → $log"
  (
    cd "$svc_dir"
    exec "$NODE_BIN" --trace-warnings src/index.js "$mode"
  ) >"$log" 2>&1 &
  local pid=$!
  PIDS+=("$pid")
  echo "  pid=$pid"
}

wait_http() {
  local url="$1"
  local timeout="${2:-30}"
  local i=0
  while ((i < timeout)); do
    if curl -sS -m 2 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null | grep -qE '^(200|301|302|404|405)$'; then
      return 0
    fi
    sleep 1
    ((i++))
  done
  return 1
}

wait_log_pattern() {
  local log="$1"
  local pattern="$2"
  local timeout="${3:-30}"
  local i=0
  while ((i < timeout)); do
    if grep -q "$pattern" "$log" 2>/dev/null; then
      return 0
    fi
    sleep 1
    ((i++))
  done
  return 1
}

start_service api
start_service files
start_service tasks
start_service watchers

API_PORT="${EXPOSE_API_PORT:-4200}"
FILES_PORT="${EXPOSE_FILES_PORT:-4292}"

echo ""
echo "Waiting for api on http://localhost:$API_PORT/api/v1/oas …"
if wait_http "http://localhost:$API_PORT/api/v1/oas" 60; then
  echo "  api ✅ ready"
else
  echo "  api ❌ not responding"
  echo "--- last 30 lines of api log ---"
  tail -30 "$LOG_DIR/modjo-smoke-api.log" 2>/dev/null
  exit 4
fi

echo ""
echo "Waiting for files on http://localhost:$FILES_PORT/ …"
if wait_http "http://localhost:$FILES_PORT/" 30; then
  echo "  files ✅ ready"
else
  echo "  files ⚠️  not responding (might still be starting)"
  echo "--- last 15 lines of files log ---"
  tail -15 "$LOG_DIR/modjo-smoke-files.log" 2>/dev/null
fi

echo ""
echo "Waiting for tasks ready log …"
if wait_log_pattern "$LOG_DIR/modjo-smoke-tasks.log" "Worker ready" 30; then
  echo "  tasks ✅ ready"
else
  echo "  tasks ⚠️  no ready line"
  tail -15 "$LOG_DIR/modjo-smoke-tasks.log" 2>/dev/null
fi

echo ""
echo "Waiting for watchers ready log …"
if wait_log_pattern "$LOG_DIR/modjo-smoke-watchers.log" "Overwatch follow up" 30; then
  echo "  watchers ✅ ready"
else
  echo "  watchers ⚠️  no ready line"
  tail -15 "$LOG_DIR/modjo-smoke-watchers.log" 2>/dev/null
fi

echo ""
echo "Services up. Log files:"
ls -la "$LOG_DIR"/modjo-smoke-*.log 2>/dev/null

# leave PIDs in a state file so the caller can keep services running
echo "${PIDS[*]}" >/tmp/modjo-smoke-pids
echo ""
echo "PIDs in /tmp/modjo-smoke-pids — call this script with no-trap mode to leave running, or let it exit to teardown."

# If KEEP_RUNNING=1, do not teardown; let caller manage cleanup later.
if [[ "${KEEP_RUNNING:-0}" == "1" ]]; then
  trap - EXIT INT TERM
  echo "KEEP_RUNNING=1 — services left up; remember to teardown manually:"
  echo "  kill ${PIDS[*]}; rm $VENDORED && mv $BACKUP $VENDORED"
fi
