#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta este instalador con sudo/root." >&2
  exit 1
fi

APP_USER="${APP_USER:-${SUDO_USER:-}}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
PROXY_PASS="${PROXY_PASS:-http://127.0.0.1:5000}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_SOURCE="$SOURCE_DIR/mitiendaya-domain-provision"
HELPER_TARGET="/usr/local/sbin/mitiendaya-domain-provision"
CONFIG_DIR="/etc/mi-tienda-ya"
CONFIG_FILE="$CONFIG_DIR/domain-provisioner.conf"
SUDOERS_FILE="/etc/sudoers.d/mi-tienda-ya-domain-provisioner"
RENEW_HOOK="/etc/letsencrypt/renewal-hooks/deploy/mi-tienda-ya-nginx-reload"

if [[ -z "$APP_USER" || ! "$APP_USER" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]]; then
  echo "Defini APP_USER con el usuario que ejecuta Node/PM2." >&2
  exit 64
fi
if [[ ! "$CERTBOT_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$ ]]; then
  echo "Defini CERTBOT_EMAIL con un correo valido para Let's Encrypt." >&2
  exit 64
fi
if [[ ! "$PROXY_PASS" =~ ^https?://[A-Za-z0-9._:-]+$ ]]; then
  echo "PROXY_PASS invalido. Ejemplo: http://127.0.0.1:5000" >&2
  exit 64
fi
if ! command -v nginx >/dev/null 2>&1; then
  echo "Nginx no esta instalado." >&2
  exit 69
fi
if ! command -v certbot >/dev/null 2>&1; then
  echo "Certbot no esta instalado." >&2
  exit 69
fi
if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl no esta disponible; este instalador requiere Nginx administrado por systemd." >&2
  exit 69
fi
if ! command -v visudo >/dev/null 2>&1; then
  echo "visudo no esta disponible; instala sudo antes de continuar." >&2
  exit 69
fi

install -o root -g root -m 0755 "$HELPER_SOURCE" "$HELPER_TARGET"
install -d -o root -g root -m 0755 "$CONFIG_DIR" /var/lib/letsencrypt/.well-known/acme-challenge /etc/letsencrypt/renewal-hooks/deploy
{
  printf 'NGINX_SITES_AVAILABLE=%q\n' '/etc/nginx/sites-available'
  printf 'NGINX_SITES_ENABLED=%q\n' '/etc/nginx/sites-enabled'
  printf 'NGINX_BIN=%q\n' "$(command -v nginx)"
  printf 'SYSTEMCTL_BIN=%q\n' "$(command -v systemctl)"
  printf 'CERTBOT_BIN=%q\n' "$(command -v certbot)"
  printf 'ACME_WEBROOT=%q\n' '/var/lib/letsencrypt'
  printf 'PROXY_PASS=%q\n' "$PROXY_PASS"
  printf 'CERTBOT_EMAIL=%q\n' "$CERTBOT_EMAIL"
} > "$CONFIG_FILE"
chown root:root "$CONFIG_FILE"
chmod 0600 "$CONFIG_FILE"

cat > "$RENEW_HOOK" <<HOOK
#!/usr/bin/env bash
set -e
$(command -v nginx) -t
$(command -v systemctl) reload nginx
HOOK
chown root:root "$RENEW_HOOK"
chmod 0755 "$RENEW_HOOK"

cat > "$SUDOERS_FILE" <<SUDOERS
${APP_USER} ALL=(root) NOPASSWD: ${HELPER_TARGET} *
SUDOERS
chmod 0440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE" >/dev/null

"$HELPER_TARGET" remove 000000000000000000000000 >/dev/null 2>&1 || true

echo "Aprovisionador instalado para el usuario ${APP_USER}."
echo "Configura DOMAIN_PROVISIONING_ENABLED=true en el .env de la aplicacion y reinicia el proceso Node."
