# DELUS — сервер

Барнома яке аз сервери хурди Node.js аст (бе бастаҳои иловагӣ). Он сайтро медиҳад ва ба Google Sheets пайваст мешавад. Калиди Google танҳо дар сервер аст ва ба браузер ва ба Git намеравад.

## Ҳозир дар кор

| | |
|---|---|
| Сайт | https://delus.tech |
| Сервер | Ubuntu 22.04 (IP танҳо дар Cloudflare; дар Git нанависед) |
| Барнома | `/opt/delus`, хизмати `delus` (корбари `delusapp`) |
| Git дар сервер | `/home/delus/delus.git` |
| Нусхаи эҳтиётии ҷадвал | `/opt/delus/server/data/backups/` — ҳар рӯз, 30 рӯзи охир |

## Навсозии барнома (аз компютер)

```bash
git add -A
git commit -m "тавсифи тағйир"
git push              # GitHub
git push server main  # сервер (пароли SSH мепурсад)
```

Remote-и `server` як бор илова мешавад: `git remote add server delus@IP-И-СЕРВЕР:delus.git`

Сервер версияи навро худаш мегузорад, барномаро бозоғозӣ мекунад ва месанҷад. Агар `server.js` хато дошта бошад, версияи пешина мемонад.

## Чӣ барнома ҳамеша кор мекунад

- systemd: пас аз хатогӣ дар 3 сония ва пас аз бозоғозии сервер худаш бармехезад.
- Ҳар дақиқа санҷиш: агар барнома ҷавоб надиҳад, бозоғозӣ мешавад.
- Сертификати HTTPS худ аз худ нав мешавад (certbot.timer).
- Навсозиҳои амниятии Ubuntu худкор; агар лозим бошад, сервер соати 04:30 бозоғозӣ мешавад.
- Девори оташ (ufw): танҳо 22, 80, 443. fail2ban SSH-ро аз кӯшишҳои зиёд ҳимоя мекунад.
- Логҳо то 200 MB маҳдуд, swap 1 GB.

## Танзими сервери нав (як бор)

1. Дар сервер: `git init --bare ~/delus.git`, `deploy/post-receive`-ро ба `~/delus.git/hooks/` гузоред (`chmod +x`).
2. `sudo mkdir -p /opt/delus && sudo chown $USER /opt/delus`
3. Аз компютер: `git push server main`
4. Калидро бор кунед: `server/secret/service-account.json` → `/opt/delus/server/secret/`
5. `sudo bash /opt/delus/deploy/setup.sh delus.tech`

## Cloudflare

Домейн дар Cloudflare аст. Сабти `A` барои `delus.tech` → IP-и сервер, бо абри зард (Proxied). Дар SSL/TLS ҳолати **Full (strict)** беҳтарин аст; nginx бо ҳолатҳои дигар ҳам кор мекунад.

## Санҷиш ва логҳо

```bash
systemctl status delus
journalctl -u delus -f
curl http://127.0.0.1:8080/api/health
```

## Бехатарӣ

- Калид дар `server/secret/` (танҳо барои `delusapp`, 600).
- Варақи `login` (паролҳо) ба браузер намерасад. Пас аз 8 кӯшиши нодуруст дар 10 дақиқа ҳамон IP муваққатан баста мешавад.
- Ивази парол ҳамаи дастгоҳҳои дигарро аз барнома мебарорад.
