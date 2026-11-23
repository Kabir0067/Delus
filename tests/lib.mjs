/* Ёрирасонҳои санҷиш.
   - serve(): сервери воқеии барнома (server/server.js) дар порти санҷишӣ, бе нусхаи эҳтиётӣ ва бо папкаи маълумоти алоҳида;
   - launch(): Chrome-и насбшуда бо Puppeteer;
   - fakeSheets(page, tables): ҳамаи /api-ро дар худи браузер ҷавоб медиҳад. Ҷадвал дар хотира аст ва ҳақиқатан
     хонда ва навишта мешавад (append, batchUpdate, deleteDimension), бинобар ин барнома мисли бо Google кор мекунад.
   Ҳеҷ санҷише, ки ин ёрирасонро истифода мебарад, ба Google ва ба ҷадвали воқеӣ намерасад. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'tests', 'out');
fs.mkdirSync(OUT, { recursive: true });
export const wait = ms => new Promise(r => setTimeout(r, ms));

export const CHROME = process.env.CHROME || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(p => fs.existsSync(p));

export async function serve(port) {
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', BACKUP: 'off', DATA_DIR: path.join(OUT, 'server-data') },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const log = [];
    child.stdout.on('data', d => log.push(String(d)));
    child.stderr.on('data', d => log.push(String(d)));
    for (let i = 0; i < 60; i++) {
        try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch (e) { }
        await wait(150);
    }
    return { url: `http://127.0.0.1:${port}/`, close: () => child.kill(), log: () => log.join('') };
}

export const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--lang=tg'] });

export function watch(page, errors) {
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|status of 40[13]/.test(m.text())) errors.push('CONSOLE ' + m.text().slice(0, 240)); });
}

/* ---------- ҷадвали сохта ---------- */
const letters = s => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
function parseRange(range) {
    const [sheetRaw, part = ''] = decodeURIComponent(range).split('!');
    const sheet = sheetRaw.replace(/^'|'$/g, '');
    const m = /^([A-Z]+)?(\d+)?(?::([A-Z]+)?(\d+)?)?$/i.exec(part);
    if (!part || !m) return { sheet, c0: 0, c1: 999, r0: 0, r1: Infinity };
    const c0 = m[1] ? letters(m[1]) : 0, r0 = m[2] ? +m[2] - 1 : 0;
    const single = m[3] === undefined && m[4] === undefined;
    const c1 = single ? c0 : (m[3] ? letters(m[3]) : 999), r1 = single ? (m[2] ? r0 : Infinity) : (m[4] ? +m[4] - 1 : Infinity);
    return { sheet, c0, c1, r0, r1 };
}

export async function fakeSheets(page, tables, { user = 'test', pass = 'test', loggedIn = false } = {}) {
    const log = { appends: [], updates: [], deletes: [], reads: 0 };
    const gid = name => Object.keys(tables).indexOf(name) + 10;
    let logged = loggedIn;
    const read = range => {
        const { sheet, c0, c1, r0, r1 } = parseRange(range);
        const rows = tables[sheet] || [];
        const out = [];
        for (let r = r0; r < rows.length && r <= r1; r++) out.push((rows[r] || []).slice(c0, c1 + 1));
        while (out.length && out[out.length - 1].every(v => v === '' || v === undefined)) out.pop();
        return { range, values: out };
    };
    await page.setRequestInterception(true);
    page.on('request', q => {
        const u = new URL(q.url());
        if (!u.pathname.startsWith('/api/')) return q.continue();
        const json = (status, body) => q.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
        const p = u.pathname, body = () => JSON.parse(q.postData() || '{}');
        if (p === '/api/me') return json(200, logged ? { user, sheet: 'TEST-SHEET' } : { user: null });
        if (p === '/api/login') { const b = body(); if (b.user === user && b.pass === pass) { logged = true; return json(200, { user, sheet: 'TEST-SHEET' }); } return json(401, { error: 'Логин ё парол нодуруст аст.' }); }
        if (p === '/api/logout') { logged = false; return json(200, { ok: true }); }
        if (!logged) return json(401, { error: 'auth' });
        if (p === '/api/ids') {
            const b = body(), rows = tables[b.sheet] || [[]];
            let max = rows.slice(1).reduce((m, r) => Math.max(m, parseInt(r[0], 10) || 0), 0);
            if (b.sheet === 'Products') max = Math.max(max, ...(tables.Transactions || []).slice(1).map(r => parseInt(r[4], 10) || 0));
            return json(200, { first: max + 1 });
        }
        const rest = p.slice('/api/sheets'.length);
        if (rest === '' && q.method() === 'GET') return json(200, { sheets: Object.keys(tables).map(t => ({ properties: { title: t, sheetId: gid(t) } })) });
        if (rest === '/values:batchGet') { log.reads++; return json(200, { valueRanges: u.searchParams.getAll('ranges').map(read) }); }
        if (rest.startsWith('/values/') && q.method() === 'GET') { log.reads++; return json(200, read(rest.slice(8))); }
        const ap = /^\/values\/(.+):append$/.exec(rest);
        if (ap) {
            const sheet = parseRange(ap[1]).sheet, rows = body().values;
            (tables[sheet] = tables[sheet] || [[]]).push(...rows.map(r => [...r]));
            log.appends.push({ sheet, rows });
            return json(200, { updates: { updatedRange: `${sheet}!A${tables[sheet].length - rows.length + 1}` } });
        }
        if (rest === '/values:batchUpdate') {
            for (const d of body().data) {
                const { sheet, c0, r0 } = parseRange(d.range);
                d.values.forEach((vals, i) => vals.forEach((v, j) => { const row = (tables[sheet][r0 + i] = tables[sheet][r0 + i] || []); row[c0 + j] = v; }));
                log.updates.push({ range: d.range, values: d.values });
            }
            return json(200, {});
        }
        if (rest === ':batchUpdate') {
            for (const r of body().requests) {
                const d = r.deleteDimension.range, sheet = Object.keys(tables).find(t => gid(t) === d.sheetId);
                tables[sheet].splice(d.startIndex, d.endIndex - d.startIndex);
                log.deletes.push({ sheet, row: d.startIndex + 1 });
            }
            return json(200, {});
        }
        return json(404, { error: 'unknown ' + rest });
    });
    return log;
}

export async function login(page, url, { user = 'test', pass = 'test' } = {}) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loginUser', { visible: true, timeout: 20000 });
    await page.type('#loginUser', user);
    await page.type('#loginPass', pass);
    await page.click('#loginBtn');
    await page.waitForSelector('#app:not([hidden]) .hero', { timeout: 20000 });
}

/* Ҳамаи нуқсонҳои ҷойгиршавӣ: ҳаракати уфуқӣ, унсур берун аз экран, тиреза берун аз экран */
export const layoutIssues = page => page.evaluate(() => {
    const W = document.documentElement.clientWidth, H = innerHeight, out = [];
    const skip = e => e.closest('.chips, .seg, .table-wrap, .loc-sums, .sum-line, .pick-grid, .rt-wrap, .rcpt-prev, .zoom');
    if (document.documentElement.scrollWidth > W + 1) out.push('page wider than screen: ' + document.documentElement.scrollWidth + '>' + W);
    for (const s of document.querySelectorAll('.sheet')) {
        const r = s.getBoundingClientRect();
        if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) out.push('window outside screen ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        const b = s.querySelector('.sheet-b');
        if (b && b.scrollWidth > b.clientWidth + 1) out.push('window body wider than window ' + b.scrollWidth + '>' + b.clientWidth);
        const f = s.querySelector('.sheet-f');
        if (f && f.getBoundingClientRect().bottom > H + 1) out.push('window footer below screen');
    }
    const scope = document.querySelector('.ov:last-child') || document.querySelector('#app');
    for (const e of scope.querySelectorAll('button, input, select, b, h1, h2, h3, .btn, .pill')) {
        if (!e.offsetParent || skip(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.width && (r.right > W + 1 || r.left < -1)) { out.push('element past edge: ' + e.tagName + '.' + String(e.className).slice(0, 40) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); break; }
    }
    return out;
});
