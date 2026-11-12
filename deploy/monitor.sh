#!/bin/sh
# DELUS — назорати сервер (ҳар 15 дақиқа аз cron, ҳамчун root). Натиҷа: journalctl -t delus-monitor
# Диск, хотира, синни нусхаи эҳтиётӣ, мӯҳлати сертификат ва ҷавоби барномаро месанҷад.
# Агар диск пур шавад, логҳои кӯҳна ва кэши apt тоза мешаванд.

say() { logger -t delus-monitor "$*"; }
warn=0

disk=$(df --output=pcent / | tail -1 | tr -dc 0-9)
if [ "$disk" -ge 85 ]; then
    warn=1; say "WARN disk ${disk}% — тоза мекунем"
    journalctl --vacuum-size=100M >/dev/null 2>&1
    apt-get clean >/dev/null 2>&1
fi

mem=$(free -m | awk '/Mem:/{print $7}')
[ "$mem" -lt 150 ] && { warn=1; say "WARN low memory: ${mem}MB available"; }

last=$(ls -1t /opt/delus/server/data/backups/sheet-*.json.gz 2>/dev/null | head -1)
if [ -z "$last" ]; then warn=1; say "WARN нусхаи эҳтиётӣ нест"
else
    age=$(( ( $(date +%s) - $(stat -c %Y "$last") ) / 3600 ))
    [ "$age" -gt 26 ] && { warn=1; say "WARN охирин нусха ${age} соат пеш: $last"; }
fi

cert=/etc/letsencrypt/live/delus.tech/fullchain.pem
if [ -f "$cert" ] && ! openssl x509 -checkend 1209600 -noout -in "$cert" >/dev/null; then
    warn=1; say "WARN сертификат дар 14 рӯз тамом мешавад — certbot renew"
    certbot renew --quiet && systemctl reload nginx
fi

health=$(curl -fsS -m 10 http://127.0.0.1:8080/api/health 2>/dev/null)
[ -z "$health" ] && { warn=1; say "WARN барнома ҷавоб намедиҳад"; }

# як сатри ҳолат дар ҳар соат (дақиқаи 0), то таърих бошад
if [ "$warn" = 0 ] && [ "$(date +%M)" -lt 15 ]; then
    say "ok disk=${disk}% mem=${mem}MB backup=$(basename "${last:-none}") app=$health"
fi
