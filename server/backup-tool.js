/* ==================================================================
   DELUS — санҷиш ва содироти нусхаҳои эҳтиётӣ
   node server/backup-tool.js check            — ҳамаи нусхаҳоро месанҷад (кушода мешаванд? чанд сатр?)
   node server/backup-tool.js csv <файл> <папка> — нусхаро ба файлҳои CSV (ҳар варақ алоҳида) мегардонад,
                                                  то дар Google Sheets ё Excel кушоед ва маълумотро баргардонед.
   Нусхаҳо дар server/data/backups (ҳар рӯз як файл, 30 рӯзи охир). Ин скрипт ҳеҷ чизро дар ҷадвал иваз намекунад.
   ================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DIR = path.resolve(__dirname, process.env.DATA_DIR || 'data', 'backups');
const NEED = ['Products', 'Locations', 'Transactions'];

function load(file) {
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
    const out = {};
    for (const vr of j.valueRanges || []) out[String(vr.range).split('!')[0].replace(/^'|'$/g, '')] = vr.values || [];
    return out;
}

function check() {
    const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => /^sheet-.*\.json\.gz$/.test(f)).sort() : [];
    if (!files.length) { console.log('Нусха нест:', DIR); process.exit(1); }
    let bad = 0;
    for (const f of files) {
        try {
            const t = load(path.join(DIR, f));
            const missing = NEED.filter(s => !t[s] || !t[s].length);
            const counts = Object.entries(t).filter(([s]) => s !== 'login').map(([s, v]) => `${s}:${Math.max(0, v.length - 1)}`).join(' ');
            if (missing.length) { bad++; console.log('ВАЙРОН', f, 'варақ нест:', missing.join(', ')); }
            else console.log('OK', f, counts);
        } catch (e) { bad++; console.log('ВАЙРОН', f, e.message); }
    }
    const last = files[files.length - 1];
    const ageH = (Date.now() - fs.statSync(path.join(DIR, last)).mtimeMs) / 36e5;
    console.log(`Ҳамагӣ ${files.length} нусха, охирин: ${last} (${ageH.toFixed(1)} соат пеш)`);
    process.exit(bad ? 1 : 0);
}

function csv(file, outDir) {
    if (!file || !outDir) { console.log('node server/backup-tool.js csv <файл> <папка>'); process.exit(1); }
    const t = load(file);
    fs.mkdirSync(outDir, { recursive: true });
    const cell = v => { const s = String(v ?? ''); return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    for (const [s, rows] of Object.entries(t)) {
        if (s === 'login') continue;   // паролҳо ба CSV намераванд
        const name = path.join(outDir, `${s}.csv`);
        fs.writeFileSync(name, '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n'));
        console.log(name, Math.max(0, rows.length - 1), 'сатр');
    }
    console.log('Санаҳо рақами сана-и Google мебошанд (масалан 46338.7). Дар Google Sheets сутунро Format → Number → Date time кунед.');
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'check') check();
else if (cmd === 'csv') csv(a, b);
else { console.log('node server/backup-tool.js check | csv <файл> <папка>'); process.exit(1); }
