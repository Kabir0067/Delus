/* ==================================================================
   DELUS — сервер
   - сайтро медиҳад (index.html, assets)
   - калиди Google танҳо дар сервер нигоҳ дошта мешавад, ба браузер намеравад
   - воридшавӣ дар сервер санҷида мешавад, сессия дар кукии ҳифзшуда
   - браузер ба Google Sheets танҳо тавассути /api/sheets ва танҳо ба варақҳои иҷозатдодашуда дастрасӣ дорад
   Бастаҳои иловагӣ лозим нест: Node.js 18 ё навтар.
   ================================================================== */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

/* ---------- танзимот: аз муҳит ё аз server/.env ---------- */
const ENV = (() => {
    const out = {};
    try {
        for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
            if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    } catch (e) { }
    return out;
})();
const conf = (k, d) => process.env[k] ?? ENV[k] ?? d;

const ROOT = path.resolve(__dirname, '..');
const PORT = +conf('PORT', 8080);
const HOST = conf('HOST', '127.0.0.1');
const SHEET_ID = conf('SPREADSHEET_ID', '1sACmY6eRgVtoPxMO-ursSjEvNfEflkqi3OCq_Wkmvxw');
const KEY_FILE = path.resolve(__dirname, conf('GOOGLE_KEY_FILE', 'secret/service-account.json'));
const DATA_DIR = path.resolve(__dirname, conf('DATA_DIR', 'data'));
const SESSION_DAYS = +conf('SESSION_DAYS', 30);

const TOO_MANY = 'Кӯшиш аз ҳад зиёд шуд. Пас аз 10 дақиқа боз кӯшиш кунед.';
const GOOGLE_DOWN = 'Ҷадвали Google ҳоло ҷавоб намедиҳад. Пас аз чанд сония боз кӯшиш кунед.';
// версияи ҷорӣ: hook-и git онро ҳангоми насб менависад
const VERSION = (() => { try { return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(); } catch (e) { return 'dev'; } })();

const SHEETS = new Set(['Products', 'Locations', 'Transactions', 'Settings', 'Images', 'Expenses', 'Debts', 'DebtPayments', 'Stock_Report']);
const GOOGLE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

const KEY = (() => {
    try { return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')); }
    catch (e) { console.error(`Файли калид ёфт нашуд: ${KEY_FILE}`); process.exit(1); }
})();
fs.mkdirSync(DATA_DIR, { recursive: true });

const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---------- Google: токен ---------- */
let gToken = null;
async function googleToken() {
    const now = Math.floor(Date.now() / 1000);
    if (gToken && now < gToken.exp - 60) return gToken.t;
    const b64 = v => Buffer.from(v).toString('base64url');
    const unsigned = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64(JSON.stringify({
        iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
    }));
    const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), KEY.private_key).toString('base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + unsigned + '.' + sig
    });
    const j = await r.json();
    if (!r.ok) throw new Error('google token: ' + (j.error_description || j.error));
    gToken = { t: j.access_token, exp: now + (j.expires_in || 3600) };
    return gToken.t;
}
/* ---------- хатои шабака ----------
   Пайваст ба Google гоҳо як лаҳза намешавад (DNS, пайваст). Хондан бехатар такрор мешавад.
   Сабт танҳо вақте такрор мешавад, ки дархост умуман ба Google нарафтааст — то сатр ду бор сабт нашавад. */
const NOT_SENT = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);
const netCode = e => (e && e.cause && (e.cause.code || e.cause.name)) || (e && e.name) || 'unknown';
async function withRetry(what, fn, safe) {
    for (let attempt = 0; ; attempt++) {
        try { return await fn(); }
        catch (e) {
            const code = netCode(e);
            if (attempt >= 3 || !(safe || NOT_SENT.has(code))) { log('google', what, 'failed:', code); throw e; }
            log('google', what, 'retry', attempt + 1, code);
            await new Promise(r => setTimeout(r, 400 * 2 ** attempt));
        }
    }
}

async function google(pathAndQuery, opts = {}) {
    const read = !opts.method || opts.method === 'GET';
    for (let attempt = 0; ; attempt++) {
        const token = await withRetry('token', googleToken, true);
        // Google ҷавоб надиҳад, дархост то абад овезон намемонад
        const r = await withRetry(read ? 'read' : 'write', () => fetch(GOOGLE + pathAndQuery, {
            ...opts, signal: AbortSignal.timeout(30000), headers: { Authorization: 'Bearer ' + token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }
        }), read);
        if (r.status === 401 && attempt < 1) { gToken = null; continue; }
        const text = await r.text();
        return { status: r.status, text };
    }
}

/* ---------- сессияҳо: дар файл, то бозоғозии сервер воридшавиро гум накунад ---------- */
const SESS_FILE = path.join(DATA_DIR, 'sessions.json');
let sessions = {};
try { sessions = JSON.parse(fs.readFileSync(SESS_FILE, 'utf8')); } catch (e) { }
let saveTimer = 0;
// аввал ба файли муваққатӣ, баъд иваз: агар сервер ҳангоми сабт хомӯш шавад, файл вайрон намешавад
const writeSessionsNow = () => {
    clearTimeout(saveTimer);
    try { fs.writeFileSync(SESS_FILE + '.tmp', JSON.stringify(sessions)); fs.renameSync(SESS_FILE + '.tmp', SESS_FILE); }
    catch (e) { log('sessions', e.message); }
};
const saveSessions = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeSessionsNow, 300);
};
const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');
function newSession(user) {
    const token = crypto.randomBytes(32).toString('base64url');
    sessions[hashToken(token)] = { user, exp: Date.now() + SESSION_DAYS * 864e5 };
    saveSessions();
    return token;
}
function readSession(req) {
    const m = /(?:^|;\s*)delus_s=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '');
    if (!m) return null;
    const k = hashToken(m[1]), s = sessions[k];
    if (!s || s.exp < Date.now()) { if (s) { delete sessions[k]; saveSessions(); } return null; }
    if (s.exp - Date.now() < (SESSION_DAYS - 1) * 864e5) { s.exp = Date.now() + SESSION_DAYS * 864e5; saveSessions(); }
    return { key: k, ...s };
}
const isHttps = req => req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
const cookie = (req, value, maxAge) => `delus_s=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;

/* ---------- маҳдудияти кӯшиши воридшавӣ ---------- */
const attempts = new Map();
const clientIp = req => String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
function tooMany(req) {
    const ip = clientIp(req), now = Date.now();
    const list = (attempts.get(ip) || []).filter(t => now - t < 10 * 60e3);
    attempts.set(ip, list);
    return list.length >= 8;
}
const failed = req => attempts.get(clientIp(req)).push(Date.now());

/* ---------- ёрирасонҳо ---------- */
function readBody(req, limit = 4 * 1024 * 1024) {
    return new Promise((res, rej) => {
        let size = 0; const parts = [];
        req.on('data', c => { size += c.length; if (size > limit) { rej(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else parts.push(c); });
        req.on('end', () => res(Buffer.concat(parts).toString('utf8')));
        req.on('error', rej);
    });
}
/* Ҷавобҳои калон (маълумоти ҷадвал ~250 КБ) фишурда мешаванд — дар интернети мобилӣ 5–8 маротиба тезтар */
function send(res, status, body, headers = {}) {
    let data = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding', ...headers };
    const accept = (res.req && res.req.headers['accept-encoding']) || '';
    if (data.length > 1024) {
        if (/\bbr\b/.test(accept)) { data = zlib.brotliCompressSync(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }); h['Content-Encoding'] = 'br'; }
        else if (/\bgzip\b/.test(accept)) { data = zlib.gzipSync(data, { level: 6 }); h['Content-Encoding'] = 'gzip'; }
    }
    h['Content-Length'] = data.length;
    res.writeHead(status, h);
    res.end(data);
}
const sheetOf = range => String(range).split('!')[0].replace(/^'|'$/g, '').trim();
const allowed = range => SHEETS.has(sheetOf(range));
const safeEq = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());

async function readLogins() {
    const r = await google('/values/' + encodeURIComponent('login!A:B') + '?valueRenderOption=UNFORMATTED_VALUE');
    if (r.status !== 200) throw new Error('login sheet ' + r.status);
    return (JSON.parse(r.text).values || []).map((row, i) => ({ row: i + 1, user: String(row[0] ?? '').trim(), pass: String(row[1] ?? '').trim() })).slice(1);
}

/* ---------- рақами варақҳо барои нест кардани сатрҳо ---------- */
let gids = null, gidsAt = 0;
async function sheetIds() {
    if (gids && Date.now() - gidsAt < 10 * 60e3) return gids;
    const r = await google('?fields=' + encodeURIComponent('sheets(properties(sheetId,title))'));
    gids = Object.fromEntries(JSON.parse(r.text).sheets.map(s => [s.properties.sheetId, s.properties.title]));
    gidsAt = Date.now();
    return gids;
}

/* ---------- кэши кӯтоҳи хондан: ҳамаи дастгоҳҳо як квотаи Google-ро истифода мебаранд ---------- */
const cache = new Map();
const CACHE_MS = 3000;
/* Ҳар сабт насли навро сар мекунад. Хондане, ки ҳангоми сабт рафт, дар кэш гузошта намешавад, то маълумоти кӯҳна барнагардад. */
let generation = 0;

/* ---------- сабтҳо навбат ба навбат ----------
   Google ду сабти якбораро ба ҳамон ҷадвал метавонад ба як сатр нависад ва яке гум мешавад.
   Бинобар ин сервер ҳар сабтро танҳо пас аз анҷоми сабти пешина мефиристад. */
let writeChain = Promise.resolve();
function inTurn(fn) {
    const run = writeChain.then(fn, fn);
    writeChain = run.catch(() => { });
    return run;
}

/* ---------- рақами нав (id): танҳо сервер медиҳад ----------
   Ҳар дастгоҳ рақамро аз сервер мегирад. Дархостҳо навбат ба навбат иҷро мешаванд ва сервер рақамҳои додашударо дар хотир дорад,
   бинобар ин ду дастгоҳ ҳеҷ гоҳ як рақам намегиранд, ҳатто агар якбора сабт кунанд. */
const reserved = {};
async function colMax(range) {
    const r = await google('/values/' + encodeURIComponent(range) + '?valueRenderOption=UNFORMATTED_VALUE');
    if (r.status !== 200) throw new Error('read ' + range + ' ' + r.status);
    return (JSON.parse(r.text).values || []).slice(1).reduce((m, row) => Math.max(m, parseInt(row[0], 10) || 0), 0);
}
function reserveIds(sheet, n) {
    return inTurn(async () => {
        let max = await colMax(`${sheet}!A:A`);
        // рақами мол аз рақамҳои мол дар амалиётҳо ҳам калонтар бошад
        if (sheet === 'Products') max = Math.max(max, await colMax('Transactions!E:E'));
        const first = Math.max(reserved[sheet] || 0, max) + 1;
        reserved[sheet] = first + n - 1;
        return first;
    });
}

/* ---------- /api/sheets: танҳо амалҳое, ки барнома истифода мебарад ---------- */
async function proxy(req, res, rest, search) {
    const method = req.method;
    let body = '';
    if (method === 'POST' || method === 'PUT') body = await readBody(req);
    const q = new URLSearchParams(search);
    const deny = () => send(res, 403, { error: { message: 'not allowed' } });

    let ok = false;
    if (method === 'GET' && rest === '/values:batchGet') ok = q.getAll('ranges').length > 0 && q.getAll('ranges').every(allowed);
    else if (method === 'GET' && rest.startsWith('/values/')) ok = allowed(decodeURIComponent(rest.slice(8)));
    else if (method === 'GET' && rest === '') ok = q.get('fields') === 'sheets(properties(sheetId,title))';
    else if (method === 'POST' && /^\/values\/[^:]+:append$/.test(rest)) ok = allowed(decodeURIComponent(rest.slice(8, -7)));
    else if (method === 'POST' && rest === '/values:batchUpdate') {
        const j = JSON.parse(body || '{}');
        ok = Array.isArray(j.data) && j.data.every(d => allowed(d.range));
    } else if (method === 'POST' && rest === ':batchUpdate') {
        const j = JSON.parse(body || '{}'), ids = await sheetIds();
        ok = Array.isArray(j.requests) && j.requests.length > 0 && j.requests.every(r =>
            Object.keys(r).length === 1 && r.deleteDimension && SHEETS.has(ids[r.deleteDimension.range?.sheetId]));
    }
    if (!ok) return deny();

    const key = rest + search;
    if (method === 'GET') {
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.text);
    }
    const gen0 = generation;
    const r = method === 'GET'
        ? await google(rest + search)
        : await inTurn(async () => {
            generation++;
            cache.clear();
            const out = await google(rest + search, { method, body: body || undefined });
            generation++;
            cache.clear();
            return out;
        });
    if (method === 'GET' && r.status === 200 && gen0 === generation) cache.set(key, { at: Date.now(), text: r.text });
    send(res, r.status, r.text);
}

/* ---------- /api ---------- */
async function api(req, res, url) {
    const p = url.pathname;
    if (p === '/api/health') return send(res, 200, { ok: true, version: VERSION, uptime: Math.round(process.uptime()) });

    if (p === '/api/login' && req.method === 'POST') {
        if (tooMany(req)) return send(res, 429, { error: TOO_MANY });
        const { user = '', pass = '' } = JSON.parse(await readBody(req, 4096) || '{}');
        const found = (await readLogins()).find(l => l.user.toLowerCase() === String(user).trim().toLowerCase());
        if (!found || !safeEq(found.pass, String(pass).trim())) {
            failed(req);
            return send(res, 401, { error: 'Логин ё парол нодуруст аст.' });
        }
        const token = newSession(found.user.toLowerCase());
        log('login', found.user, clientIp(req));
        return send(res, 200, { user: found.user.toLowerCase(), sheet: SHEET_ID }, { 'Set-Cookie': cookie(req, token, SESSION_DAYS * 86400) });
    }

    const s = readSession(req);
    if (p === '/api/me') return send(res, 200, s ? { user: s.user, sheet: SHEET_ID } : { user: null });
    if (!s) return send(res, 401, { error: 'auth' });

    if (p === '/api/logout' && req.method === 'POST') {
        delete sessions[s.key]; saveSessions();
        return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
    }

    if (p === '/api/password' && req.method === 'POST') {
        if (tooMany(req)) return send(res, 429, { error: TOO_MANY });
        const { current = '', login = '', pass = '' } = JSON.parse(await readBody(req, 4096) || '{}');
        const list = await readLogins();
        const me = list.find(l => l.user.toLowerCase() === s.user);
        if (!me) return send(res, 400, { error: 'Логини шумо дар ҷадвал ёфт нашуд.' });
        if (!safeEq(me.pass, String(current).trim())) { failed(req); return send(res, 400, { error: 'Пароли ҳозира нодуруст аст.' }); }
        const name = String(login).trim(), pw = String(pass).trim() || me.pass;
        if (!name) return send(res, 400, { error: 'Логинро нависед.' });
        if (pw.length < 4) return send(res, 400, { error: 'Парол бояд ақаллан 4 аломат бошад.' });
        if (list.some(l => l !== me && l.user.toLowerCase() === name.toLowerCase())) return send(res, 400, { error: 'Ин логин банд аст.' });
        const r = await google(`/values/${encodeURIComponent(`login!A${me.row}:B${me.row}`)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [[name, pw]] }) });
        if (r.status !== 200) return send(res, 502, { error: 'Парол сабт нашуд. Боз кӯшиш кунед.' });
        // ҳамаи дастгоҳҳои дигари ин корбар аз барнома мебароянд
        for (const [k, v] of Object.entries(sessions)) if (v.user === s.user && k !== s.key) delete sessions[k];
        sessions[s.key].user = name.toLowerCase();
        saveSessions();
        return send(res, 200, { user: name.toLowerCase() });
    }

    if (p === '/api/ids' && req.method === 'POST') {
        const { sheet = '', n = 1 } = JSON.parse(await readBody(req, 1024) || '{}');
        const count = Math.floor(+n);
        if (!SHEETS.has(sheet) || sheet === 'Stock_Report' || sheet === 'Settings' || !(count >= 1 && count <= 500)) return send(res, 400, { error: 'bad request' });
        return send(res, 200, { first: await reserveIds(sheet, count) });
    }

    if (p.startsWith('/api/sheets')) return proxy(req, res, p.slice('/api/sheets'.length), url.search);
    send(res, 404, { error: 'not found' });
}

/* ---------- файлҳои сайт ----------
   - 6 файли JS ба як app.js ҷамъ мешаванд: дар интернети суст як дархост аз шаш дархост хеле тезтар аст;
   - дар index.html ?v=… худкор аз мундариҷаи файл ҳисоб мешавад, бинобар ин пас аз ҳар навсозӣ
     браузер ҳатман файли навро мегирад ва то он вақт файли кӯҳнаро аз кэш истифода мебарад;
   - матн бо brotli ё gzip фишурда мешавад. */
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
    '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};
const COMPRESS = new Set(['.html', '.js', '.css', '.svg', '.webmanifest', '.json', '.txt']);
const BUNDLE = 'assets/js/app.js';
const JS_ORDER = ['config', 'core', 'ui', 'pages', 'debts', 'flows'].map(n => `assets/js/${n}.js`);
const REF = /(assets\/[\w./-]+)\?v=\w+/g;
const fileCache = new Map();

function packed(rel, stamp, build) {
    let d = fileCache.get(rel);
    if (d && d.stamp === stamp) return d;
    const raw = build(), ext = path.extname(rel).toLowerCase(), zip = COMPRESS.has(ext);
    d = {
        stamp, raw, ext, hash: crypto.createHash('sha1').update(raw).digest('hex').slice(0, 10),
        gz: zip ? zlib.gzipSync(raw, { level: 9 }) : null,
        br: zip ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }) : null
    };
    fileCache.set(rel, d);
    return d;
}

/* rel: роҳи файл аз решаи сайт, масалан assets/css/style.css. Агар файл набошад, null. */
function asset(rel) {
    try {
        if (rel === BUNDLE) {
            const files = JS_ORDER.map(x => path.join(ROOT, x));
            return packed(rel, files.map(x => fs.statSync(x).mtimeMs).join('|'),
                () => Buffer.concat(files.flatMap(x => [fs.readFileSync(x), Buffer.from('\n;\n')])));
        }
        const file = path.join(ROOT, rel), st = fs.statSync(file);
        if (!st.isFile()) return null;
        if (rel === 'index.html') {
            const html = fs.readFileSync(file, 'utf8');
            const refs = [...html.matchAll(REF)].map(m => (asset(m[1]) || {}).hash).join('|');
            return packed(rel, st.mtimeMs + '|' + refs,
                () => Buffer.from(html.replace(REF, (all, a) => { const d = asset(a); return d ? `${a}?v=${d.hash}` : all; })));
        }
        return packed(rel, st.mtimeMs, () => fs.readFileSync(file));
    } catch (e) { return null; }
}

function serveFile(req, res, url) {
    let p;
    try { p = decodeURIComponent(url.pathname); } catch (e) { return notFound(res); }
    if (p === '/') p = '/index.html';
    const okPath = p === '/index.html' || p === '/manifest.webmanifest' || p === '/robots.txt' || p.startsWith('/assets/');
    if (!okPath || p.includes('..') || p.includes(String.fromCharCode(0)) || !path.join(ROOT, p).startsWith(ROOT + path.sep)) return notFound(res);
    const d = asset(p.slice(1));
    if (!d) return notFound(res);
    const versioned = url.searchParams.has('v') || p.startsWith('/assets/img/') || p.startsWith('/assets/fonts/');
    const headers = {
        'Content-Type': MIME[d.ext] || 'application/octet-stream',
        ETag: `"${d.hash}"`,
        // no-transform: Cloudflare ба саҳифа скрипти бегона (analytics) илова намекунад
        'Cache-Control': d.ext === '.html' ? 'no-cache, no-transform' : versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        ...(d.gz ? { Vary: 'Accept-Encoding' } : {})
    };
    if (req.headers['if-none-match'] === headers.ETag) { res.writeHead(304, headers); return res.end(); }
    const accept = req.headers['accept-encoding'] || '';
    const [body, enc] = d.br && /\bbr\b/.test(accept) ? [d.br, 'br'] : d.gz && /\bgzip\b/.test(accept) ? [d.gz, 'gzip'] : [d.raw, ''];
    if (enc) headers['Content-Encoding'] = enc;
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
}
function notFound(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
}

const SECURITY = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

/* ---------- тозакунӣ: сессияҳои кӯҳна ва кӯшишҳои воридшавӣ хотираро пур намекунанд ---------- */
setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [k, v] of Object.entries(sessions)) if (v.exp < now) { delete sessions[k]; changed = true; }
    if (changed) saveSessions();
    for (const [ip, list] of attempts) if (!list.some(t => now - t < 10 * 60e3)) attempts.delete(ip);
    for (const [k, v] of cache) if (now - v.at > CACHE_MS) cache.delete(k);
}, 10 * 60e3).unref();

/* ---------- нусхаи эҳтиётии ҳаррӯза: ҳамаи варақҳо ба server/data/backups, 30 рӯзи охир ---------- */
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
async function backup() {
    const day = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);   // вақти Душанбе
    const file = path.join(BACKUP_DIR, `sheet-${day}.json.gz`);
    if (fs.existsSync(file)) return;
    const ranges = [...SHEETS, 'login'].filter(s => s !== 'Stock_Report').map(s => 'ranges=' + encodeURIComponent(s));
    const r = await google('/values:batchGet?' + ranges.join('&') + '&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
    if (r.status !== 200) throw new Error('backup read ' + r.status);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(file + '.tmp', zlib.gzipSync(r.text));
    fs.renameSync(file + '.tmp', file);
    for (const f of fs.readdirSync(BACKUP_DIR).filter(f => /^sheet-.*\.json\.gz$/.test(f)).sort().slice(0, -30)) fs.unlinkSync(path.join(BACKUP_DIR, f));
    log('backup', path.basename(file));
}
const runBackup = () => backup().catch(e => log('backup failed', e.message));
// BACKUP=off танҳо барои санҷишҳо
if (conf('BACKUP', 'on') !== 'off') {
    setTimeout(runBackup, 60e3).unref();
    setInterval(runBackup, 3600e3).unref();
}

const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
    try {
        const url = new URL(req.url, 'http://local');
        if (url.pathname.startsWith('/api/')) return await api(req, res, url);
        if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res);
        serveFile(req, res, url);
    } catch (e) {
        log('error', req.method, req.url.split('?')[0], netCode(e), e.message);
        // хатои шабака бо Google: корбар паёми фаҳмо мегирад, на «хатои сервер»
        const net = !e.status && (e.name === 'TimeoutError' || /fetch failed|google token/i.test(e.message));
        if (!res.headersSent) send(res, e.status || (net ? 503 : 500), { error: net ? GOOGLE_DOWN : 'server' });
        else res.end();
    }
}).listen(PORT, HOST, () => log(`DELUS: http://${HOST}:${PORT}`));
server.headersTimeout = 30000;
server.requestTimeout = 120000;
server.keepAliveTimeout = 65000;

// хомӯшкунии ором: сессияҳо сабт мешаванд, дархостҳои ҷорӣ анҷом меёбанд
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
    log('stop', sig);
    writeSessionsNow();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
});

process.on('uncaughtException', e => log('uncaught', e.stack || e.message));
process.on('unhandledRejection', e => log('unhandled', e && (e.stack || e.message)));
