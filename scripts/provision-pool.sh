#!/usr/bin/env bash
# =============================================================================
# provision-pool.sh — Provision N VMs in parallel
#
# Usage:  ./scripts/provision-pool.sh <count>
# Example: ./scripts/provision-pool.sh 5
#
# Queries Supabase for the highest existing VM number, then provisions
# <count> new VMs starting from the next number. Runs in parallel.
#
# Prerequisites:
#   - ssh-agent loaded with ~/.ssh/instaclaw key
#   - instaclaw/.env.local with HETZNER_API_TOKEN, Supabase creds
#   - jq installed
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
fail()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

COUNT="${1:?Usage: $0 <count> (e.g. 5)}"

if [[ ! "${COUNT}" =~ ^[0-9]+$ ]] || [[ "${COUNT}" -lt 1 ]] || [[ "${COUNT}" -gt 20 ]]; then
  fail "Count must be between 1 and 20."
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/instaclaw/.env.local"

if [[ ! -f "${ENV_FILE}" ]]; then
  fail "Missing ${ENV_FILE}."
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${NEXT_PUBLIC_SUPABASE_URL:?Set NEXT_PUBLIC_SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"

# ---------------------------------------------------------------------------
# 1. Ensure ssh-agent has the key loaded
# ---------------------------------------------------------------------------

SSH_KEY_PATH="${HOME}/.ssh/instaclaw"

if [[ -z "${SSH_AUTH_SOCK:-}" ]]; then
  warn "ssh-agent not running. Starting one..."
  eval "$(ssh-agent -s)"
fi

if ! ssh-add -l 2>/dev/null | grep -qi instaclaw; then
  log "Adding ${SSH_KEY_PATH} to ssh-agent (you may be prompted for the passphrase)..."
  ssh-add "${SSH_KEY_PATH}"
fi

# ---------------------------------------------------------------------------
# 2. Query highest existing VM number from Supabase
# ---------------------------------------------------------------------------

log "Querying Supabase for existing VMs..."

EXISTING=$(curl -sf \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/instaclaw_vms?select=name&order=created_at.desc&limit=200" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

MAX_NUM=0
while IFS= read -r name; do
  if [[ -n "${name}" ]]; then
    num=$(echo "${name}" | grep -oE '[0-9]+$' || echo "0")
    if [[ ${num} -gt ${MAX_NUM} ]]; then
      MAX_NUM=${num}
    fi
  fi
done < <(echo "${EXISTING}" | jq -r '.[].name // empty')

log "Highest existing VM number: ${MAX_NUM}"

# ---------------------------------------------------------------------------
# 3. Launch provisions in parallel
# ---------------------------------------------------------------------------

log "Provisioning ${COUNT} VMs starting from instaclaw-vm-$(printf '%02d' $((MAX_NUM + 1)))..."
echo ""

PIDS=()
VM_NAMES=()
LOG_DIR=$(mktemp -d)

for i in $(seq 1 "${COUNT}"); do
  VM_NUM=$((MAX_NUM + i))
  VM_NAME="instaclaw-vm-$(printf '%02d' "${VM_NUM}")"
  VM_NAMES+=("${VM_NAME}")
  LOG_FILE="${LOG_DIR}/${VM_NAME}.log"

  echo -e "${YELLOW}[→]${NC} Starting: ${VM_NAME} (log: ${LOG_FILE})"

  "${SCRIPT_DIR}/provision-vm.sh" "${VM_NAME}" > "${LOG_FILE}" 2>&1 &
  PIDS+=($!)
done

echo ""
log "All ${COUNT} provisions launched. Waiting for completion..."
echo ""

# ---------------------------------------------------------------------------
# 4. Wait for all to complete
# ---------------------------------------------------------------------------

SUCCEEDED=0
FAILED=0
FAILED_NAMES=()

for idx in "${!PIDS[@]}"; do
  pid="${PIDS[${idx}]}"
  name="${VM_NAMES[${idx}]}"

  if wait "${pid}"; then
    echo -e "${GREEN}[✓]${NC} ${name} — provisioned successfully"
    SUCCEEDED=$((SUCCEEDED + 1))
  else
    echo -e "${RED}[✗]${NC} ${name} — FAILED (see ${LOG_DIR}/${name}.log)"
    FAILED=$((FAILED + 1))
    FAILED_NAMES+=("${name}")
  fi
done

# ---------------------------------------------------------------------------
# 5. Summary
# ---------------------------------------------------------------------------

echo ""
echo "=============================================="
echo -e "${GREEN} Pool Provisioning Complete${NC}"
echo "=============================================="
echo ""
echo "  Total:     ${COUNT}"
echo "  Succeeded: ${SUCCEEDED}"
echo "  Failed:    ${FAILED}"

if [[ ${FAILED} -gt 0 ]]; then
  echo ""
  echo "  Failed VMs:"
  for name in "${FAILED_NAMES[@]}"; do
    echo "    - ${name} (log: ${LOG_DIR}/${name}.log)"
  done
fi

echo ""
echo "  Logs:      ${LOG_DIR}/"
echo ""
echo "=============================================="

# Exit with error if any failed
if [[ ${FAILED} -gt 0 ]]; then
  exit 1
fi
