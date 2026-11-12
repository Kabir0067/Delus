# DELUS — сервер ва нигоҳубин

Барнома як сервери хурди Node.js аст (бе бастаҳои иловагӣ). Он сайтро медиҳад ва ба Google Sheets пайваст мешавад. Калиди Google танҳо дар сервер аст ва ба браузер ва ба Git намеравад.

## Сохтор

```
Браузер ──https──> Cloudflare ──https──> nginx (443) ──> Node: server/server.js (127.0.0.1:8080) ──> Google Sheets
```

| | |
|---|---|
| Сайт | https://delus.tech |
| Сервер | Ubuntu 22.04 (IP танҳо дар Cloudflare; дар Git нанависед) |
| Барнома | `/opt/delus`, хизмати `delus` (корбари `delusapp`) |
| Git дар сервер | `/home/delus/delus.git` (hook-и `post-receive` версияро насб мекунад) |
| Нусхаи эҳтиётии ҷадвал | `/opt/delus/server/data/backups/` — ҳар рӯз, 30 рӯзи охир |
| Версияи ҷорӣ | `https://delus.tech/api/health` → `version` |

## Навсозии барнома (аз компютер)

```bash
git add -A
git commit -m "тавсифи тағйир"
git push              # GitHub
git push server main  # сервер (пароли SSH мепурсад)
```

Сервер версияи навро худаш мегузорад, барномаро бозоғозӣ мекунад ва месанҷад. Агар `server.js` хато дошта бошад, версияи пешина мемонад. Remote-и `server` як бор илова мешавад: `git remote add server delus@IP-И-СЕРВЕР:delus.git`

## Баргардонидани версияи пешина

```bash
sh /opt/delus/deploy/rollback.sh            # рӯйхати версияҳо
sh /opt/delus/deploy/rollback.sh 0f1238b    # ҳамон версияро гузоштан
```

Танҳо код иваз мешавад; маълумоти ҷадвал дахл намеёбад.

## Барқарор кардани маълумот

1. **Хатои дастӣ дар ҷадвал** (касе сатрро нест кард ё иваз кард): дар Google Sheets → *File → Version history* — Google ҳар тағйирро нигоҳ медорад. Ин роҳи аввал ва осонтарин аст.
2. **Ҷадвал нест шуд ё дастрасӣ гум шуд**: нусхаи сервер.
   ```bash
   sudo -u delusapp node /opt/delus/server/backup-tool.js check                  # ҳамаи нусхаҳо дурустанд?
   sudo node /opt/delus/server/backup-tool.js csv /opt/delus/server/data/backups/sheet-2026-11-12.json.gz /tmp/restore
   ```
   Файлҳои CSV-ро (ҳар варақ алоҳида) ба ҷадвали нав ворид кунед, ҷадвалро ба почтаи сервис-аккаунт (Editor) кушоед ва `SPREADSHEET_ID`-ро дар `server/.env` иваз кунед.

## Чӣ барнома ҳамеша кор мекунад

- systemd: пас аз хатогӣ дар 3 сония ва пас аз бозоғозии сервер худаш бармехезад (`Restart=always`, `StartLimitIntervalSec=0`).
- Ҳар дақиқа санҷиши `/api/health`: агар ду бор ҷавоб набошад, барнома бозоғозӣ мешавад.
- Ҳар 15 дақиқа назорат (`journalctl -t delus-monitor`): диск (аз 85% боло — тозакунӣ), хотира, синни нусха, мӯҳлати сертификат.
- Хатои шабака бо Google: хондан то 3 бор такрор мешавад; сабт танҳо вақте такрор мешавад, ки дархост ба Google нарафтааст (то сатр ду бор сабт нашавад).
- Ду сервери DNS ва се захиравӣ.
- Сертификати HTTPS худ аз худ нав мешавад (certbot.timer).
- Навсозиҳои амниятии Ubuntu худкор; агар лозим бошад, сервер соати 04:30 бозоғозӣ мешавад.
- Девори оташ (ufw): танҳо 22, 80, 443. fail2ban SSH-ро ҳимоя мекунад. Логҳо то 200 MB, swap 1 GB.

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
journalctl -u delus -f            # логи барнома
journalctl -t delus-monitor       # назорат
curl http://127.0.0.1:8080/api/health
```

## Бехатарӣ

- Калид дар `server/secret/` (танҳо барои `delusapp`, 600).
- Варақи `login` (паролҳо) ба браузер намерасад. Пас аз 8 кӯшиши нодуруст (воридшавӣ ё ивази парол) дар 10 дақиқа ҳамон IP муваққатан баста мешавад.
- Куки: HttpOnly, Secure, SameSite=Strict. Ивази парол ҳамаи дастгоҳҳои дигарро аз барнома мебарорад.
