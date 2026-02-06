#!/usr/bin/env bash
# =============================================================================
# provision-vm.sh — Create a Hetzner VM, install OpenClaw, register in Supabase
#
# Usage:  ./scripts/provision-vm.sh <vm-name>
# Example: ./scripts/provision-vm.sh instaclaw-vm-03
#
# Prerequisites:
#   - ssh-agent loaded with ~/.ssh/instaclaw key
#   - instaclaw/.env.local with HETZNER_API_TOKEN, Supabase creds
#   - jq installed
#
# What it does:
#   1. Creates a CPX21 server in Hetzner (Ashburn) with instaclaw SSH key + firewall
#   2. Waits for the server to be running
#   3. Waits for SSH access (root, initial boot)
#   4. Uploads and runs install-openclaw.sh (Docker, Caddy, hardening, UFW)
#   5. Verifies SSH as openclaw user (root is locked out after hardening)
#   6. Inserts the VM record into Supabase as status "ready"
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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/instaclaw/.env.local"

if [[ ! -f "${ENV_FILE}" ]]; then
  fail "Missing ${ENV_FILE}. Create it with HETZNER_API_TOKEN, Supabase creds, etc."
fi

# Load env vars (set -a exports them all)
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

# Validate required env vars
: "${HETZNER_API_TOKEN:?Set HETZNER_API_TOKEN in ${ENV_FILE}}"
: "${NEXT_PUBLIC_SUPABASE_URL:?Set NEXT_PUBLIC_SUPABASE_URL in ${ENV_FILE}}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY in ${ENV_FILE}}"

HETZNER_BASE="https://api.hetzner.cloud/v1"
SSH_KEY_PATH="${HOME}/.ssh/instaclaw"
SSH_KEY_NAME="instaclaw-deploy"
FIREWALL_NAME="instaclaw-firewall"
SERVER_TYPE="cpx21"
IMAGE="ubuntu-24.04"
LOCATION="ash"
REGION="us-east"

# Parse argument
VM_NAME="${1:?Usage: $0 <vm-name> (e.g. instaclaw-vm-03)}"

# Validate VM name format
if [[ ! "${VM_NAME}" =~ ^[a-z0-9-]+$ ]]; then
  fail "VM name must contain only lowercase letters, numbers, and hyphens."
fi

# ---------------------------------------------------------------------------
# 1. Ensure ssh-agent has the key loaded
# ---------------------------------------------------------------------------

log "Checking SSH agent..."

if [[ -z "${SSH_AUTH_SOCK:-}" ]]; then
  warn "ssh-agent not running. Starting one..."
  eval "$(ssh-agent -s)"
fi

if ! ssh-add -l 2>/dev/null | grep -qi instaclaw; then
  log "Adding ${SSH_KEY_PATH} to ssh-agent (you may be prompted for the passphrase)..."
  ssh-add "${SSH_KEY_PATH}"
fi

log "SSH agent ready."

# ---------------------------------------------------------------------------
# 2. Look up Hetzner SSH key ID and firewall ID
# ---------------------------------------------------------------------------

log "Looking up Hetzner resource IDs..."

SSH_KEY_ID=$(curl -sf -H "Authorization: Bearer ${HETZNER_API_TOKEN}" \
  "${HETZNER_BASE}/ssh_keys" | \
  jq -r ".ssh_keys[] | select(.name==\"${SSH_KEY_NAME}\") | .id")

if [[ -z "${SSH_KEY_ID}" || "${SSH_KEY_ID}" == "null" ]]; then
  fail "SSH key '${SSH_KEY_NAME}' not found in Hetzner. Create it first."
fi

FIREWALL_ID=$(curl -sf -H "Authorization: Bearer ${HETZNER_API_TOKEN}" \
  "${HETZNER_BASE}/firewalls" | \
  jq -r ".firewalls[] | select(.name==\"${FIREWALL_NAME}\") | .id")

if [[ -z "${FIREWALL_ID}" || "${FIREWALL_ID}" == "null" ]]; then
  fail "Firewall '${FIREWALL_NAME}' not found in Hetzner. Create it first."
fi

log "SSH Key ID: ${SSH_KEY_ID}, Firewall ID: ${FIREWALL_ID}"

# ---------------------------------------------------------------------------
# 3. Create the server
# ---------------------------------------------------------------------------

log "Creating Hetzner server '${VM_NAME}' (${SERVER_TYPE}, ${IMAGE}, ${LOCATION})..."

CREATE_RESPONSE=$(curl -sf -X POST "${HETZNER_BASE}/servers" \
  -H "Authorization: Bearer ${HETZNER_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${VM_NAME}\",
    \"server_type\": \"${SERVER_TYPE}\",
    \"image\": \"${IMAGE}\",
    \"location\": \"${LOCATION}\",
    \"ssh_keys\": [${SSH_KEY_ID}],
    \"firewalls\": [{\"firewall\": ${FIREWALL_ID}}]
  }")

SERVER_ID=$(echo "${CREATE_RESPONSE}" | jq -r '.server.id')
SERVER_IP=$(echo "${CREATE_RESPONSE}" | jq -r '.server.public_net.ipv4.ip')

if [[ -z "${SERVER_ID}" || "${SERVER_ID}" == "null" ]]; then
  ERROR_MSG=$(echo "${CREATE_RESPONSE}" | jq -r '.error.message // "unknown error"')
  fail "Failed to create server: ${ERROR_MSG}"
fi

log "Server created: ID=${SERVER_ID}, IP=${SERVER_IP}"

# ---------------------------------------------------------------------------
# 4. Wait for server to be running
# ---------------------------------------------------------------------------

log "Waiting for server to be running..."

TIMEOUT=120
ELAPSED=0

while [[ ${ELAPSED} -lt ${TIMEOUT} ]]; do
  STATUS=$(curl -sf -H "Authorization: Bearer ${HETZNER_API_TOKEN}" \
    "${HETZNER_BASE}/servers/${SERVER_ID}" | jq -r '.server.status')

  if [[ "${STATUS}" == "running" ]]; then
    # Re-fetch IP in case it wasn't available at creation time
    SERVER_IP=$(curl -sf -H "Authorization: Bearer ${HETZNER_API_TOKEN}" \
      "${HETZNER_BASE}/servers/${SERVER_ID}" | jq -r '.server.public_net.ipv4.ip')
    log "Server is running. IP: ${SERVER_IP}"
    break
  fi

  sleep 5
  ELAPSED=$((ELAPSED + 5))
  echo -n "."
done

if [[ ${ELAPSED} -ge ${TIMEOUT} ]]; then
  fail "Server did not start within ${TIMEOUT}s. Check Hetzner console."
fi

# ---------------------------------------------------------------------------
# 5. Wait for SSH access (as root — before hardening)
# ---------------------------------------------------------------------------

log "Waiting for SSH access on root@${SERVER_IP}..."

SSH_OPTS="-o ConnectTimeout=5 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
TIMEOUT=120
ELAPSED=0

while [[ ${ELAPSED} -lt ${TIMEOUT} ]]; do
  # shellcheck disable=SC2086
  if ssh ${SSH_OPTS} "root@${SERVER_IP}" "echo ok" 2>/dev/null; then
    log "SSH access confirmed (root)."
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  echo -n "."
done

if [[ ${ELAPSED} -ge ${TIMEOUT} ]]; then
  fail "SSH not available after ${TIMEOUT}s. Check server console."
fi

# ---------------------------------------------------------------------------
# 6. Upload and run install-openclaw.sh
# ---------------------------------------------------------------------------

INSTALL_SCRIPT="${SCRIPT_DIR}/install-openclaw.sh"

if [[ ! -f "${INSTALL_SCRIPT}" ]]; then
  fail "install-openclaw.sh not found at ${INSTALL_SCRIPT}"
fi

log "Uploading install-openclaw.sh to ${SERVER_IP}..."

# shellcheck disable=SC2086
scp ${SSH_OPTS} "${INSTALL_SCRIPT}" "root@${SERVER_IP}:/root/install-openclaw.sh"

log "Running install-openclaw.sh (this takes 3-5 minutes)..."

# shellcheck disable=SC2086
ssh ${SSH_OPTS} "root@${SERVER_IP}" "bash /root/install-openclaw.sh"

log "install-openclaw.sh completed."

# ---------------------------------------------------------------------------
# 7. Verify SSH as openclaw user
# ---------------------------------------------------------------------------

log "Verifying SSH as openclaw@${SERVER_IP}..."

TIMEOUT=30
ELAPSED=0

while [[ ${ELAPSED} -lt ${TIMEOUT} ]]; do
  # shellcheck disable=SC2086
  if ssh ${SSH_OPTS} "openclaw@${SERVER_IP}" "echo ok" 2>/dev/null; then
    log "SSH access confirmed (openclaw)."
    break
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done

if [[ ${ELAPSED} -ge ${TIMEOUT} ]]; then
  warn "Could not verify SSH as openclaw. The VM may still be finishing setup."
  warn "Try manually: ssh -i ~/.ssh/instaclaw openclaw@${SERVER_IP}"
fi

# ---------------------------------------------------------------------------
# 8. Insert into Supabase
# ---------------------------------------------------------------------------

log "Inserting VM record into Supabase..."

SUPABASE_RESPONSE=$(curl -sf -X POST \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/instaclaw_vms" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"ip_address\": \"${SERVER_IP}\",
    \"name\": \"${VM_NAME}\",
    \"hetzner_server_id\": \"${SERVER_ID}\",
    \"ssh_port\": 22,
    \"ssh_user\": \"openclaw\",
    \"status\": \"ready\",
    \"region\": \"${REGION}\",
    \"server_type\": \"${SERVER_TYPE}\"
  }")

VM_DB_ID=$(echo "${SUPABASE_RESPONSE}" | jq -r '.[0].id // .id // "unknown"')

log "VM inserted into Supabase: ${VM_DB_ID}"

# ---------------------------------------------------------------------------
# 9. Success
# ---------------------------------------------------------------------------

echo ""
echo "=============================================="
echo -e "${GREEN} VM Provisioned Successfully!${NC}"
echo "=============================================="
echo ""
echo "  Name:        ${VM_NAME}"
echo "  IP:          ${SERVER_IP}"
echo "  Hetzner ID:  ${SERVER_ID}"
echo "  DB ID:       ${VM_DB_ID}"
echo "  SSH User:    openclaw"
echo "  Region:      ${REGION}"
echo "  Type:        ${SERVER_TYPE}"
echo ""
echo "  SSH:         ssh -i ~/.ssh/instaclaw openclaw@${SERVER_IP}"
echo "  Status:      ready (in Supabase)"
echo ""
echo "=============================================="
