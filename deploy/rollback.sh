#!/bin/sh
# DELUS — баргардонидани версияи пешина (дар сервер):
#   sh /opt/delus/deploy/rollback.sh            — рӯйхати версияҳои охирин
#   sh /opt/delus/deploy/rollback.sh <commit>   — ҳамон версияро мегузорад ва барномаро бозоғозӣ мекунад
# Маълумоти ҷадвал ва нусхаҳо дахл намеёбанд — танҳо коди барнома иваз мешавад.
set -e
export GIT_DIR=$HOME/delus.git
TARGET=/opt/delus
if [ -z "$1" ]; then
    echo "Ҳозир: $(cat $TARGET/VERSION 2>/dev/null)"
    git log --oneline -10 main
    exit 0
fi
git cat-file -e "$1^{commit}"
git --work-tree="$TARGET" checkout -f "$1" -- .
git rev-parse --short "$1" > "$TARGET/VERSION"
sudo -n /usr/bin/systemctl restart delus
sleep 2
curl -fsS -m 5 http://127.0.0.1:8080/api/health && echo " — версияи $1 гузошта шуд"
echo "Барои навсозии оянда хаторо ислоҳ кунед ва боз git push кунед."
