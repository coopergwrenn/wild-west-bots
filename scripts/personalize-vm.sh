#!/usr/bin/env bash
# =============================================================================
# personalize-vm.sh — First-boot personalization for snapshot-based VMs
#
# Usage:  sudo bash personalize-vm.sh
#
# This script runs on VMs created from the instaclaw-base snapshot.
# It regenerates per-VM secrets and identifiers that were stripped
# before snapshotting. Fast (~10 seconds).
#
# What it does:
#   1. Regenerate SSH host keys
#   2. Regenerate machine-id
#   3. Generate new per-VM encryption key (.vault_key)
#   4. Write fresh placeholder openclaw.json
#   5. Reset fail2ban counters
#   6. Restart services (sshd, Caddy, fail2ban)
#
# This script is either:
#   - Uploaded and run via SSH by provision-vm.sh
#   - Passed as cloud-init user_data during VM creation
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
fail() { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    fail "This script must be run as root."
  fi
}

require_root

# ---------------------------------------------------------------------------
OPENCLAW_USER="openclaw"
OPENCLAW_HOME="/home/${OPENCLAW_USER}"
CONFIG_DIR="${OPENCLAW_HOME}/.openclaw"
CREDS_DIR="${CONFIG_DIR}/creds"
ENCRYPTION_KEY_FILE="${CONFIG_DIR}/.vault_key"

# ---------------------------------------------------------------------------
# 1. Regenerate SSH host keys
# ---------------------------------------------------------------------------

log "Regenerating SSH host keys..."

# Remove any stale keys (should already be gone from snapshot cleanup)
rm -f /etc/ssh/ssh_host_* 2>/dev/null || true

# Regenerate all key types
dpkg-reconfigure openssh-server 2>/dev/null || ssh-keygen -A

log "SSH host keys regenerated."

# ---------------------------------------------------------------------------
# 2. Regenerate machine-id
# ---------------------------------------------------------------------------

log "Regenerating machine-id..."
systemd-machine-id-setup
log "Machine-id: $(cat /etc/machine-id)"

# ---------------------------------------------------------------------------
# 3. Generate new per-VM encryption key
# ---------------------------------------------------------------------------

log "Generating encryption key..."

mkdir -p "${CONFIG_DIR}" "${CREDS_DIR}"
chown "${OPENCLAW_USER}:${OPENCLAW_USER}" "${CONFIG_DIR}" "${CREDS_DIR}"
chmod 700 "${CREDS_DIR}"

openssl rand -base64 32 > "${ENCRYPTION_KEY_FILE}"
chmod 400 "${ENCRYPTION_KEY_FILE}"
chown "${OPENCLAW_USER}:${OPENCLAW_USER}" "${ENCRYPTION_KEY_FILE}"

log "Encryption key generated."

# ---------------------------------------------------------------------------
# 4. Write placeholder config
# ---------------------------------------------------------------------------

log "Writing placeholder config..."

cat > "${CONFIG_DIR}/openclaw.json" <<'PLACEHOLDER'
{
  "_note": "Placeholder config. Run configure-vm.sh to set up this instance.",
  "telegram": { "bot_token": "" },
  "api": { "mode": "all_inclusive", "key_encrypted": true },
  "gateway": { "token": "", "port": 8080, "bind": "127.0.0.1" }
}
PLACEHOLDER

chown "${OPENCLAW_USER}:${OPENCLAW_USER}" "${CONFIG_DIR}/openclaw.json"
chmod 600 "${CONFIG_DIR}/openclaw.json"

log "Placeholder config written."

# ---------------------------------------------------------------------------
# 5. Reset fail2ban
# ---------------------------------------------------------------------------

log "Resetting fail2ban..."

# Remove the database to clear all bans and counters
rm -f /var/lib/fail2ban/fail2ban.sqlite3 2>/dev/null || true
systemctl restart fail2ban 2>/dev/null || true

log "fail2ban reset."

# ---------------------------------------------------------------------------
# 6. Restart services
# ---------------------------------------------------------------------------

log "Restarting services..."

# Restart SSH (Ubuntu 24.04 = ssh.service)
if systemctl is-active ssh.service &>/dev/null; then
  systemctl restart ssh
elif systemctl is-active sshd.service &>/dev/null; then
  systemctl restart sshd
fi

# Restart Caddy
systemctl stop caddy 2>/dev/null || true
sleep 1
systemctl start caddy 2>/dev/null || true

log "Services restarted."

# ---------------------------------------------------------------------------
# 7. Clear this script's traces
# ---------------------------------------------------------------------------

log "Cleaning up..."
history -c 2>/dev/null || true
rm -f /root/.bash_history 2>/dev/null || true
rm -f "${OPENCLAW_HOME}/.bash_history" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

VM_IP=$(curl -s -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "=============================================="
echo -e "${GREEN} VM Personalized!${NC}"
echo "=============================================="
echo "  IP:          ${VM_IP}"
echo "  SSH:         openclaw (key-only)"
echo "  Vault key:   Generated"
echo "  Host keys:   Regenerated"
echo "  fail2ban:    Reset"
echo "  Caddy:       Active (tls internal)"
echo "=============================================="
