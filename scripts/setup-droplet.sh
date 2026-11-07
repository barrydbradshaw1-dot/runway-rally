#!/usr/bin/env bash
# One-time hardening and Docker install for a fresh Ubuntu 22.04/24.04 droplet.
# Run as root:  bash scripts/setup-droplet.sh
# Afterwards, work as the "rally" user, not root.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "run as root" >&2; exit 1; fi

apt-get update -y
apt-get install -y docker.io docker-compose-v2 ufw git fail2ban unattended-upgrades

# non-root deploy user that can run docker and logs in with the same SSH keys as root
if ! id rally >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" rally
  usermod -aG docker rally
  mkdir -p /home/rally/.ssh
  if [ -f /root/.ssh/authorized_keys ]; then cp /root/.ssh/authorized_keys /home/rally/.ssh/authorized_keys; fi
  chown -R rally:rally /home/rally/.ssh
  chmod 700 /home/rally/.ssh
  chmod 600 /home/rally/.ssh/authorized_keys 2>/dev/null || true
fi

# firewall: SSH, HTTP, HTTPS only
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable --now docker fail2ban
echo
echo "Done. Test SSH as rally in a NEW terminal before closing this one:  ssh rally@<droplet-ip>"
echo "Then (as rally): git clone <repo> && cd runway-rally && cp .env.example .env && edit .env && bash scripts/deploy.sh"
