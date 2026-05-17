#!/usr/bin/env bash
set -euo pipefail

# One-command update for the single-machine Docker Compose deployment.
# Defaults are intentionally conservative: local changes are stashed, not
# restored, and only docker-compose.yml is used.

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
AUTO_STASH="${AUTO_STASH:-1}"
STASH_UNTRACKED="${STASH_UNTRACKED:-1}"
RUN_PRISMA_PUSH="${RUN_PRISMA_PUSH:-1}"
RUN_HEALTHCHECK="${RUN_HEALTHCHECK:-1}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1/api/health}"
CONFIGURE_DOCKER_MIRROR="${CONFIGURE_DOCKER_MIRROR:-1}"
DOCKER_DAEMON_CONFIG="${DOCKER_DAEMON_CONFIG:-/etc/docker/daemon.json}"
DOCKER_REGISTRY_MIRROR="${DOCKER_REGISTRY_MIRROR:-https://mirror.ccs.tencentyun.com}"
GIT_HTTP_VERSION="${GIT_HTTP_VERSION:-HTTP/1.1}"
GIT_RETRIES="${GIT_RETRIES:-3}"
GIT_RETRY_DELAY="${GIT_RETRY_DELAY:-5}"
COMPOSE_CMD=()

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

git_network() {
  local attempt
  attempt=1

  while [ "$attempt" -le "$GIT_RETRIES" ]; do
    if git -c http.version="$GIT_HTTP_VERSION" "$@"; then
      return
    fi

    if [ "$attempt" -eq "$GIT_RETRIES" ]; then
      fail "git $* failed after $GIT_RETRIES attempts"
    fi

    log "git $* failed; retrying in ${GIT_RETRY_DELAY}s ($attempt/$GIT_RETRIES)"
    sleep "$GIT_RETRY_DELAY"
    attempt=$((attempt + 1))
  done
}

compose() {
  "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" "$@"
}

require_compose_command() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return
  fi

  fail "missing Docker Compose. Install 'docker compose' or 'docker-compose'."
}

restart_docker() {
  log "restarting Docker daemon"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart docker
  elif command -v service >/dev/null 2>&1; then
    service docker restart
  else
    fail "cannot restart Docker automatically; restart Docker manually and rerun this script."
  fi
}

configure_docker_mirror() {
  if [ "$CONFIGURE_DOCKER_MIRROR" != "1" ]; then
    log "Docker registry mirror configuration skipped"
    return
  fi

  if [ "$(id -u)" -ne 0 ]; then
    fail "Docker registry mirror configuration requires root. Rerun with sudo or set CONFIGURE_DOCKER_MIRROR=0."
  fi

  local config_dir result
  config_dir="$(dirname "$DOCKER_DAEMON_CONFIG")"
  mkdir -p "$config_dir"

  if [ ! -s "$DOCKER_DAEMON_CONFIG" ]; then
    log "configuring Docker registry mirror: $DOCKER_REGISTRY_MIRROR"
    cat >"$DOCKER_DAEMON_CONFIG" <<EOF
{
  "registry-mirrors": [
    "$DOCKER_REGISTRY_MIRROR"
  ]
}
EOF
    restart_docker
    return
  fi

  require_command python3
  cp "$DOCKER_DAEMON_CONFIG" "$DOCKER_DAEMON_CONFIG.bak.$(date -u +%Y%m%dT%H%M%SZ)"

  result="$(
    python3 - "$DOCKER_DAEMON_CONFIG" "$DOCKER_REGISTRY_MIRROR" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
mirror = sys.argv[2]

try:
    data = json.loads(path.read_text(encoding="utf-8") or "{}")
except json.JSONDecodeError as exc:
    print(f"invalid Docker daemon JSON: {exc}", file=sys.stderr)
    sys.exit(1)

if not isinstance(data, dict):
    print("Docker daemon config must be a JSON object", file=sys.stderr)
    sys.exit(1)

mirrors = data.get("registry-mirrors", [])
if not isinstance(mirrors, list):
    print('Docker daemon config field "registry-mirrors" must be an array', file=sys.stderr)
    sys.exit(1)

if mirror in mirrors:
    print("unchanged")
    sys.exit(0)

data["registry-mirrors"] = [mirror] + [item for item in mirrors if item != mirror]
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("changed")
PY
  )"

  if [ "$result" = "changed" ]; then
    log "configured Docker registry mirror: $DOCKER_REGISTRY_MIRROR"
    restart_docker
  else
    log "Docker registry mirror already configured: $DOCKER_REGISTRY_MIRROR"
  fi
}

stash_local_changes() {
  local status
  status="$(git status --porcelain --untracked-files=normal)"
  if [ -z "$status" ]; then
    log "working tree is clean"
    return
  fi

  if [ "$AUTO_STASH" != "1" ]; then
    git status --short
    fail "working tree has local changes. Set AUTO_STASH=1 or clean the tree first."
  fi

  log "local changes found; creating deploy stash"
  git status --short

  local stash_args
  stash_args=(-m "deploy-auto-stash $(date -u +%Y%m%dT%H%M%SZ)")
  if [ "$STASH_UNTRACKED" = "1" ]; then
    stash_args=(--include-untracked "${stash_args[@]}")
  fi

  git stash push "${stash_args[@]}"
  log "local changes were stashed. Review later with: git stash list"
}

checkout_branch() {
  local current_branch
  current_branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"

  if [ "$current_branch" = "$BRANCH" ]; then
    return
  fi

  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    log "switching to local branch $BRANCH"
    git checkout "$BRANCH"
  else
    log "creating local branch $BRANCH from $REMOTE/$BRANCH"
    git checkout -B "$BRANCH" "$REMOTE/$BRANCH"
  fi
}

healthcheck() {
  if [ "$RUN_HEALTHCHECK" != "1" ]; then
    log "healthcheck skipped"
    return
  fi

  if ! command -v curl >/dev/null 2>&1; then
    log "curl not found; healthcheck skipped"
    return
  fi

  log "checking $HEALTHCHECK_URL"
  curl -fsS --retry 10 --retry-delay 2 --retry-all-errors "$HEALTHCHECK_URL" >/dev/null
  log "healthcheck passed"
}

main() {
  require_command git
  require_command docker
  configure_docker_mirror
  require_compose_command

  cd "$PROJECT_DIR"
  [ -f "$COMPOSE_FILE" ] || fail "compose file not found: $PROJECT_DIR/$COMPOSE_FILE"

  log "project: $PROJECT_DIR"
  log "target: $REMOTE/$BRANCH"
  log "compose file: $COMPOSE_FILE"

  # Git may reject root-owned deployments when the repo owner differs.
  git config --global --add safe.directory "$PROJECT_DIR" >/dev/null 2>&1 || true

  log "fetching latest code"
  git_network fetch "$REMOTE" "$BRANCH"

  stash_local_changes
  checkout_branch

  log "pulling latest code"
  git_network pull --ff-only "$REMOTE" "$BRANCH"

  log "building api and web images"
  compose build api web

  log "starting dependencies"
  compose up -d db minio

  if [ "$RUN_PRISMA_PUSH" = "1" ]; then
    log "applying Prisma schema"
    compose run --rm api pnpm prisma:push
  else
    log "Prisma push skipped"
  fi

  log "starting application services"
  compose up -d api web

  healthcheck

  log "deployment complete"
  compose ps
}

main "$@"
