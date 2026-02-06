#!/usr/bin/env bash
# =============================================================================
# update-model.sh — Update the default Claude model on a running OpenClaw VM
#
# Usage:
#   bash update-model.sh <model>
#
# Arguments:
#   model — Claude model ID (e.g. claude-sonnet-4-5-20250929)
#
# What it does:
#   1. Validates the model against the allowed list
#   2. Updates openclaw.json with the new model
#   3. Restarts the gateway container with the new CLAUDE_MODEL env var
#
# Called over SSH by the InstaClaw backend (lib/ssh.ts updateModel()).
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
fail()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OPENCLAW_HOME="${HOME}"
OPENCLAW_DIR="${OPENCLAW_HOME}/openclaw"
CONFIG_DIR="${OPENCLAW_HOME}/.openclaw"
CONFIG_FILE="${CONFIG_DIR}/openclaw.json"
HEALTH_URL="http://127.0.0.1:8080/health"
HEALTH_TIMEOUT=30
HEALTH_INTERVAL=2

ALLOWED_MODELS="claude-haiku-4-5-20251001 claude-sonnet-4-5-20250929 claude-opus-4-5-20250820 claude-opus-4-6"

# ---------------------------------------------------------------------------
# 1. Validate argument
# ---------------------------------------------------------------------------

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <model>"
  echo ""
  echo "Allowed models: ${ALLOWED_MODELS}"
  exit 1
fi

MODEL="$1"

model_valid=false
for m in ${ALLOWED_MODELS}; do
  if [[ "${MODEL}" == "${m}" ]]; then
    model_valid=true
    break
  fi
done

if [[ "${model_valid}" != true ]]; then
  fail "Invalid model '${MODEL}'. Allowed: ${ALLOWED_MODELS}"
fi

log "Updating model to: ${MODEL}"

# ---------------------------------------------------------------------------
# 2. Update openclaw.json
# ---------------------------------------------------------------------------

if [[ ! -f "${CONFIG_FILE}" ]]; then
  fail "Config file not found at ${CONFIG_FILE}. Is OpenClaw configured?"
fi

# Use a temp file for atomic update
TEMP_CONFIG=$(mktemp "${CONFIG_DIR}/.openclaw.json.XXXXXX")

# Update the model.default field in the JSON config using python3 (available on all VMs)
python3 -c "
import json, sys
with open('${CONFIG_FILE}', 'r') as f:
    config = json.load(f)
if 'model' not in config:
    config['model'] = {}
config['model']['default'] = '${MODEL}'
with open('${TEMP_CONFIG}', 'w') as f:
    json.dump(config, f, indent=2)
"

mv "${TEMP_CONFIG}" "${CONFIG_FILE}"
chmod 600 "${CONFIG_FILE}"

log "Config updated: model.default = ${MODEL}"

# ---------------------------------------------------------------------------
# 3. Restart the gateway container with new model
# ---------------------------------------------------------------------------

log "Restarting gateway with new model..."

if [[ -f "${OPENCLAW_DIR}/docker-compose.yml" ]]; then
  cd "${OPENCLAW_DIR}"
  export CLAUDE_MODEL="${MODEL}"
  docker compose up -d --force-recreate
  log "Docker Compose containers restarted."
else
  CONTAINER_NAME="openclaw-gateway"

  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    # Update the CLAUDE_MODEL env var by recreating the container
    # Get the current env vars from the running container, update the model
    ENV_FILE="${CONFIG_DIR}/.env.model-update"

    # Read current env from container, filter out old CLAUDE_MODEL, add new one
    docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${CONTAINER_NAME}" \
      | grep -v "^CLAUDE_MODEL=" \
      | grep -v "^$" \
      > "${ENV_FILE}" || true
    echo "CLAUDE_MODEL=${MODEL}" >> "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"

    # Get current image
    IMAGE=$(docker inspect --format '{{.Config.Image}}' "${CONTAINER_NAME}")

    docker stop "${CONTAINER_NAME}" 2>/dev/null || true
    docker rm "${CONTAINER_NAME}" 2>/dev/null || true

    docker run -d \
      --name "${CONTAINER_NAME}" \
      --restart unless-stopped \
      -p "127.0.0.1:8080:8080" \
      -p "127.0.0.1:3000:3000" \
      -v "${CONFIG_DIR}:/home/openclaw/.openclaw:ro" \
      --env-file "${ENV_FILE}" \
      "${IMAGE}"

    rm -f "${ENV_FILE}"
    log "Container '${CONTAINER_NAME}' restarted with model ${MODEL}."
  else
    fail "No running container '${CONTAINER_NAME}' found."
  fi
fi

# ---------------------------------------------------------------------------
# 4. Wait for health check
# ---------------------------------------------------------------------------

log "Waiting for health check..."

elapsed=0
healthy=false

while [[ ${elapsed} -lt ${HEALTH_TIMEOUT} ]]; do
  if curl -sf -o /dev/null -m 5 "${HEALTH_URL}" 2>/dev/null; then
    healthy=true
    break
  fi
  sleep "${HEALTH_INTERVAL}"
  elapsed=$((elapsed + HEALTH_INTERVAL))
done

if [[ "${healthy}" == true ]]; then
  log "Health check passed. Model updated to ${MODEL}."
else
  fail "Health check failed after ${HEALTH_TIMEOUT}s. Gateway may still be restarting."
fi
