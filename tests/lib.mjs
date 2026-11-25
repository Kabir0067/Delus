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
import { createRequire } from 'node:module';
import { sheetsApi } from './fakegoogle.mjs';
const { createOps } = createRequire(import.meta.url)('../server/ops.js');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'tests', 'out');
fs.mkdirSync(OUT, { recursive: true });
export const wait = ms => new Promise(r => setTimeout(r, ms));

export const CHROME = process.env.CHROME || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(p => fs.existsSync(p));

export async function serve(port, env = {}) {
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', BACKUP: 'off', DATA_DIR: path.join(OUT, 'server-data'), ...env },
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

export const launch = (extra = []) => puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--lang=tg', ...extra] });

export function watch(page, errors) {
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|status of 40[13]/.test(m.text())) errors.push('CONSOLE ' + m.text().slice(0, 240)); });
}

/* ---------- ҷадвали сохта ----------
   /api/sheets ва /api/ids дар ин ҷо ҷавоб дода мешаванд, /api/op бошад бо худи server/ops.js-и воқеӣ иҷро мешавад,
   то санҷиш ҳамон коди серверро санҷад (рақамҳо, сабти якбора, такрор нашудан).
   ctl.op: { fail: n } — n дархости навбатӣ хатои шабака; { lose: n } — дар ҷадвал сабт мешавад, вале ҷавоб гум мешавад;
   { delay: ms } — ҷавоби дер; { hold: Promise } — то иҷрои Promise интизор. */
export async function fakeSheets(page, tables, { user = 'test', pass = 'test', loggedIn = false } = {}) {
    const api = sheetsApi(tables);
    const log = api.log;
    log.ops = [];
    log.op = { fail: 0, lose: 0, delay: 0, hold: null };
    let logged = loggedIn;
    let chain = Promise.resolve();
    const inTurn = fn => { const r = chain.then(fn, fn); chain = r.catch(() => { }); return r; };
    const reserved = {};
    const colMax = (sheet, col = 0) => (tables[sheet] || []).slice(1).reduce((m, r) => Math.max(m, parseInt(r[col], 10) || 0), 0);
    const reserveNow = async (sheet, n) => {
        let max = colMax(sheet);
        if (sheet === 'Products') max = Math.max(max, colMax('Transactions', 4));
        const first = Math.max(reserved[sheet] || 0, max) + 1;
        reserved[sheet] = first + n - 1;
        return first;
    };
    const dataDir = fs.mkdtempSync(path.join(OUT, 'ops-'));
    const ops = createOps({ google: api.google, inTurn, reserveNow, dataDir, sheetIdOf: async t => tables[t] ? api.gid(t) : undefined });

    await page.setRequestInterception(true);
    page.on('request', async q => {
        const u = new URL(q.url());
        if (!u.pathname.startsWith('/api/')) return q.continue();
        const json = (status, body) => q.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
        const p = u.pathname, body = () => JSON.parse(q.postData() || '{}');
        if (p === '/api/me') return json(200, logged ? { user, sheet: 'TEST-SHEET' } : { user: null });
        if (p === '/api/login') { const b = body(); if (b.user === user && b.pass === pass) { logged = true; return json(200, { user, sheet: 'TEST-SHEET' }); } return json(401, { error: 'Логин ё парол нодуруст аст.' }); }
        if (p === '/api/logout') { logged = false; return json(200, { ok: true }); }
        if (!logged) return json(401, { error: 'auth' });
        if (p === '/api/ids') { const b = body(); return json(200, { first: await reserveNow(b.sheet, b.n || 1) }); }
        if (p === '/api/op') {
            const b = body();
            log.ops.push(b.id);
            if (log.op.fail > 0) { log.op.fail--; return q.abort('internetdisconnected'); }
            if (log.op.hold) await log.op.hold;
            if (log.op.delay) await wait(log.op.delay);
            try {
                const r = await ops.run(b);
                if (log.op.lose > 0) { log.op.lose--; return q.abort('connectionreset'); }
                return json(200, r);
            } catch (e) { return json(e.known ? 400 : 503, { error: e.known ? e.message : 'server' }); }
        }
        const rest = p.slice('/api/sheets'.length);
        if (rest === ':batchUpdate' && !body().requests.every(r => r.deleteDimension)) return json(403, { error: { message: 'not allowed' } });
        const r = await api.google(rest + u.search, { method: q.method(), body: q.postData() || undefined });
        q.respond({ status: r.status, contentType: 'application/json', body: r.text });
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
