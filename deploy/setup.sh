#!/usr/bin/env bash
# DELUS — танзими пурраи сервер (Ubuntu 22.04 / 24.04). Чанд бор иҷро кардан бехатар аст.
# Иҷро:  sudo bash /opt/delus/deploy/setup.sh delus.tech
set -euo pipefail

DOMAIN="${1:?домейнро нависед: sudo bash setup.sh delus.tech}"
APP=/opt/delus
DEPLOY_USER="${SUDO_USER:-delus}"
SSL=/etc/delus-ssl
export DEBIAN_FRONTEND=noninteractive
say() { printf '\n== %s\n' "$*"; }

say "Бастаҳо"
apt-get update -q
apt-get install -yq nginx certbot ssl-cert curl git ufw fail2ban unattended-upgrades ca-certificates gnupg
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -yq nodejs
fi
node -v

say "Swap (захираи хотира)"
if ! swapon --show | grep -q .; then
    fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Корбари барнома"
id delusapp >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin delusapp
mkdir -p "$APP/server/data" "$APP/server/secret"
chown -R delusapp:delusapp "$APP/server/data" "$APP/server/secret"
chmod 700 "$APP/server/data" "$APP/server/secret"
[ -f "$APP/server/secret/service-account.json" ] && chmod 600 "$APP/server/secret/service-account.json"
[ -f "$APP/server/secret/service-account.json" ] || { echo "Калид нест: $APP/server/secret/service-account.json"; exit 1; }

say "Хизмати systemd"
install -m 644 "$APP/deploy/delus.service" /etc/systemd/system/delus.service
systemctl daemon-reload
systemctl enable delus
systemctl restart delus
# корбари бор кардан метавонад танҳо барномаро бозоғозӣ кунад
cat > /etc/sudoers.d/delus-deploy <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart delus, /usr/bin/systemctl status delus
EOF
chmod 440 /etc/sudoers.d/delus-deploy
visudo -cf /etc/sudoers.d/delus-deploy

say "nginx"
mkdir -p "$SSL" /var/www/html
if [ ! -e "$SSL/fullchain.pem" ]; then
    ln -sf /etc/ssl/certs/ssl-cert-snakeoil.pem "$SSL/fullchain.pem"
    ln -sf /etc/ssl/private/ssl-cert-snakeoil.key "$SSL/privkey.pem"
fi
{
    echo "# Cloudflare IPs"
    for ip in $(curl -fsS -m 15 https://www.cloudflare.com/ips-v4 || true) $(curl -fsS -m 15 https://www.cloudflare.com/ips-v6 || true); do echo "set_real_ip_from $ip;"; done
} > /tmp/delus-cf.conf
if [ "$(grep -c set_real_ip_from /tmp/delus-cf.conf)" -lt 10 ]; then
    for ip in 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32; do echo "set_real_ip_from $ip;"; done >> /tmp/delus-cf.conf
fi
install -m 644 /tmp/delus-cf.conf /etc/nginx/snippets/delus-cloudflare.conf
cat > /etc/nginx/snippets/delus-proxy.conf <<'EOF'
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $delus_proto;
proxy_read_timeout 90s;
proxy_next_upstream error timeout;
client_max_body_size 5m;
EOF
sed -e "s/DOMAIN/$DOMAIN/g" -e "s#CERT_DIR#$SSL#g" "$APP/deploy/nginx.conf" > /etc/nginx/sites-available/delus
ln -sf /etc/nginx/sites-available/delus /etc/nginx/sites-enabled/delus
rm -f /etc/nginx/sites-enabled/default
sed -i 's/^\(\s*\)# *server_tokens off;/\1server_tokens off;/' /etc/nginx/nginx.conf
nginx -t
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx

say "Девори оташ (ufw)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable
ufw status

say "Навсозиҳои амниятӣ ва ҳимояи SSH"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52delus-upgrades <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
systemctl enable --now fail2ban
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\n' > /etc/systemd/journald.conf.d/delus.conf
systemctl restart systemd-journald
timedatectl set-timezone Asia/Dushanbe || true

say "Санҷиши ҳар дақиқа: агар барнома ҷавоб надиҳад, бозоғозӣ мешавад"
cat > /etc/cron.d/delus-health <<'EOF'
* * * * * root curl -fsS -m 15 -o /dev/null http://127.0.0.1:8080/api/health || (sleep 20; curl -fsS -m 15 -o /dev/null http://127.0.0.1:8080/api/health || (logger -t delus "health failed, restart"; systemctl restart delus))
EOF

say "HTTPS (Let's Encrypt)"
DOMS=(-d "$DOMAIN")
getent hosts "www.$DOMAIN" >/dev/null && DOMS+=(-d "www.$DOMAIN")
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/delus-nginx.sh
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/delus-nginx.sh
if certbot certonly --webroot -w /var/www/html "${DOMS[@]}" --cert-name "$DOMAIN" \
        --agree-tos --register-unsafely-without-email --non-interactive --keep-until-expiring; then
    ln -sf "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL/fullchain.pem"
    ln -sf "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL/privkey.pem"
    nginx -t && systemctl reload nginx
    systemctl enable --now certbot.timer 2>/dev/null || true
    echo "Сертификат: OK"
else
    echo "ОГОҲӢ: сертификат гирифта нашуд. Сайт бо сертификати муваққатӣ кор мекунад. DNS-ро санҷед ва setup.sh-ро боз иҷро кунед."
fi

say "Санҷиш"
sleep 2
curl -fsS http://127.0.0.1:8080/api/health && echo
systemctl is-active delus nginx
