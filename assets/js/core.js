/* DELUS — маълумот, ҳисоб ва сабт дар ҷадвал */
'use strict';

/* ------------------------------------------------------------------
   Сохтори ҷадвал. Сутунҳо аз рӯи ном ёфта мешаванд, на аз рӯи ҷой.
   ------------------------------------------------------------------ */
const COLS = {
    Products: ['id', 'product_code', 'name', 'category', 'series', 'color', 'mesta', 'taga', 'unit', 'units_per_box', 'purchase_price', 'sale_price', 'image_url', 'description', 'status', 'created_at', 'min_stock'],
    Locations: ['id', 'name', 'location_type', 'status'],
    Transactions: ['id', 'transaction_code', 'date', 'type', 'product_id', 'from_location_id', 'to_location_id', 'quantity', 'unit', 'base_quantity', 'unit_cost', 'unit_price', 'note', 'created_at', 'receipt_code'],
    Settings: ['key', 'value', 'note'],
    Images: ['product_id', 'data', 'updated_at'],
    Expenses: ['id', 'date', 'category', 'amount', 'location_id', 'note', 'created_at'],
    Debts: ['id', 'customer', 'phone', 'amount', 'paid', 'status', 'date', 'due_date', 'receipt_code', 'note', 'created_at'],
    DebtPayments: ['id', 'debt_id', 'amount', 'date', 'method', 'note', 'created_at']
};
const DATE_COLS = new Set(['date', 'created_at', 'updated_at', 'due_date']);
/* Дар сервер калид нест ва варақи login ба браузер намерасад */
const SERVER = !!CONFIG.api;
const RANGES = ['Products!A:Q', 'Locations!A:D', 'Transactions!A:O', 'Settings!A:C', 'Expenses!A:G', 'Debts!A:K', 'DebtPayments!A:G', ...(SERVER ? [] : ['login!A:B'])];
const UNITS = ['дона', 'метр', 'кг', 'қуттӣ', 'ҷуфт', 'литр'];
const TZ_HOURS = 5;          // Тоҷикистон: UTC+5, бе соати тобистона
const PAGE_SIZE = 60;
const CELL_MAX = 45000;      // ҳуҷайраи Google Sheets то 50 000 аломат мегирад

const NAV = [
    { k: 'home', icon: 'home', t: 'Асосӣ', s: '' },
    { k: 'prod', icon: 'tag', t: 'Молҳо', s: 'Рӯйхати мол, нарх ва акс' },
    { k: 'stock', icon: 'box', t: 'Анбор', s: 'Бақияи мол дар ҳар ҷой' },
    { k: 'debt', icon: 'debt', t: 'Қарз', s: 'Насия: кӣ чанд қарздор аст' },
    { k: 'tx', icon: 'list', t: 'Амалиётҳо', s: 'Таърихи фурӯш, воридот ва интиқол' },
    { k: 'rep', icon: 'chart', t: 'Ҳисобот', s: 'Фурӯш, фоида, хароҷот ва воридот' },
    { k: 'set', icon: 'gear', t: 'Танзимот', s: 'Анборҳо, парол ва намуди барнома' }
];

const TYPES = {
    SALE: { t: 'Фурӯш', icon: 'sale' },
    PURCHASE: { t: 'Воридот', icon: 'in' },
    TRANSFER: { t: 'Интиқол', icon: 'move' },
    ADJUSTMENT: { t: 'Шумориши мол', icon: 'fix' },
    RETURN: { t: 'Бозгашт', icon: 'back' },
    EXPENSE: { t: 'Хароҷот', icon: 'wallet' }
};

/* ---------- ёрирасонҳо ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad5 = n => String(n).padStart(5, '0');
const round3 = n => Math.round(n * 1000) / 1000;

function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v ?? '').replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
}
const fmt = (n, d = 0) => num(n).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d });
const qty = n => fmt(n, 3);
const cur = () => S.cfg.currency || 'сомонӣ';
const money = n => `${fmt(n, 2)} ${cur()}`;

/* ---------- сана ва вақт: ҳамеша бо вақти Душанбе ---------- */
const DAY_MS = 864e5;
const nowSerial = () => (Date.now() + TZ_HOURS * 36e5) / DAY_MS + 25569;
const serialToStr = s => new Date(Math.round((s - 25569) * DAY_MS)).toISOString().slice(0, 19).replace('T', ' ');
const strToSerial = s => {
    const t = Date.parse(String(s).trim().replace(' ', 'T') + (String(s).trim().length > 10 ? 'Z' : 'T00:00:00Z'));
    return isNaN(t) ? s : t / DAY_MS + 25569;
};
const nowStr = () => serialToStr(nowSerial());
const today = () => nowStr().slice(0, 10);
const dayShift = n => serialToStr(Math.floor(nowSerial()) + n).slice(0, 10);
const dayOf = x => String(x.date || '').slice(0, 10);

function toDateStr(v) {
    if (typeof v === 'number') return v ? serialToStr(v) : '';
    const s = String(v ?? '').trim();
    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(.*)$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}${m[4]}` : s;
}

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const WEEKDAYS = ['Якшанбе', 'Душанбе', 'Сешанбе', 'Чоршанбе', 'Панҷшанбе', 'Ҷумъа', 'Шанбе'];
function dayLabel(d) {
    if (d === today()) return 'Имрӯз';
    if (d === dayShift(-1)) return 'Дирӯз';
    const [y, m, n] = d.split('-').map(Number);
    if (!m) return d;
    return `${n} ${MONTHS[m - 1]}${y === +today().slice(0, 4) ? '' : ' ' + y}`;
}
function todayLong() {
    const [y, m, d] = today().split('-').map(Number);
    return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MONTHS[m - 1]}`;
}
const timeOf = x => { const t = String(x.date || '').slice(11, 16); return t && t !== '00:00' ? t : ''; };

/* ---------- ҷустуҷӯ: ҳарфҳои тоҷикӣ ва русӣ якхела ҳисоб мешаванд ---------- */
function norm(s) {
    return String(s || '').toLowerCase()
        .replace(/ё/g, 'е').replace(/ӯ/g, 'у').replace(/қ/g, 'к').replace(/ғ/g, 'г')
        .replace(/ҳ/g, 'х').replace(/ҷ/g, 'ч').replace(/ӣ/g, 'и')
        .replace(/[^0-9a-zЀ-ӿ]+/g, ' ').trim();
}
const hasAll = (text, query) => { const h = norm(text); return norm(query).split(' ').every(t => h.includes(t)); };

/* ==================================================================
   ПАЙВАСТ БО GOOGLE SHEETS
   ================================================================== */
const BASE = SERVER ? `${CONFIG.api}/sheets` : `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}`;
const READ_OPTS = 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
const MSG = {
    net: 'Интернет нест. Пайвастро санҷед ва боз кӯшиш кунед.',
    clock: 'Соат ё санаи дастгоҳ нодуруст аст. Онро дуруст кунед.',
    access: 'Дастрасӣ ба ҷадвал нест.',
    busy: 'Ҷадвал ҳоло банд аст. Пас аз як дақиқа боз кӯшиш кунед.',
    secure: 'Барнома бояд аз суроғаи бехатар (https) кушода шавад.',
    fail: 'Амал иҷро нашуд. Боз кӯшиш кунед.',
    noServer: 'Сервери барнома кор намекунад. Барномаро бо файли start.cmd оғоз кунед ва аз суроғаи http://localhost:8080 кушоед.'
};
/* Агар саҳифа на аз сервери барнома, балки аз сервери оддии файлҳо кушода шуда бошад, /api вуҷуд надорад */
const NO_API = new Set([404, 405, 501]);
const known = text => Object.assign(new Error(text), { known: true });

let signKey = null;
let accessToken = null;
try { accessToken = JSON.parse(localStorage.getItem('delus.tok')); } catch (e) { }

const b64url = input => {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function getToken() {
    const now = Math.floor(Date.now() / 1000);
    if (accessToken && now < accessToken.exp - 60) return accessToken.t;
    if (!crypto.subtle) throw known(MSG.secure);

    if (!signKey) {
        const raw = Uint8Array.from(atob(CONFIG.privateKeyPem.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
        signKey = await crypto.subtle.importKey('pkcs8', raw, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    }
    const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({
        iss: CONFIG.clientEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now, exp: now + 3600
    }));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signKey, new TextEncoder().encode(unsigned));

    const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + unsigned + '.' + b64url(sig)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw known(/jwt|token must be/i.test(j.error_description || '') ? MSG.clock : MSG.access);

    accessToken = { t: j.access_token, exp: now + (j.expires_in || 3600) };
    try { localStorage.setItem('delus.tok', JSON.stringify(accessToken)); } catch (e) { }
    return accessToken.t;
}

/* retry: танҳо амалҳое такрор мешаванд, ки дубора сабт намекунанд */
async function gFetch(url, opts = {}, retry = true, attempt = 0) {
    let r;
    try {
        const ct = opts.body ? { 'Content-Type': 'application/json' } : {};
        r = SERVER
            ? await fetch(url, { ...opts, credentials: 'same-origin', headers: ct })
            : await fetch(url, { ...opts, headers: { Authorization: `Bearer ${await getToken()}`, ...ct } });
    } catch (e) {
        if (e.known) throw e;
        if (retry && attempt < 2) { await sleep(600 * (attempt + 1)); return gFetch(url, opts, retry, attempt + 1); }
        throw known(MSG.net);
    }
    if (SERVER && NO_API.has(r.status) && !/json/.test(r.headers.get('content-type') || '')) throw known(MSG.noServer);
    if (SERVER && r.status === 401) {
        if (S.user) logout('Вақти воридшавӣ гузашт. Аз нав ворид шавед.');
        throw known('Аз нав ворид шавед.');
    }
    if (r.status === 401 && attempt < 1) {
        accessToken = null;
        return gFetch(url, opts, retry, attempt + 1);
    }
    if (attempt < 5 && (r.status === 429 || (retry && r.status >= 500))) {
        await sleep(1500 * 2 ** attempt);
        return gFetch(url, opts, retry, attempt + 1);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        console.error('Sheets', r.status, j.error && j.error.message);
        throw known(r.status === 403 ? MSG.access : r.status === 429 ? MSG.busy : MSG.fail);
    }
    return j;
}

/* Дархост ба сервери худи барнома: воридшавӣ, баромадан, парол */
async function serverCall(pathname, body) {
    let r;
    try {
        r = await fetch(CONFIG.api + pathname, {
            method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch (e) { throw known(MSG.net); }
    if (NO_API.has(r.status) && !/json/.test(r.headers.get('content-type') || '')) throw Object.assign(known(MSG.noServer), { status: r.status, noServer: true });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(known(j.error && typeof j.error === 'string' && j.error !== 'auth' ? j.error : r.status === 401 ? 'Аз нав ворид шавед.' : MSG.fail), { status: r.status });
    return j;
}

const colName = i => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const head = sheet => S.heads[sheet] && S.heads[sheet].length ? S.heads[sheet] : COLS[sheet];
const toCell = (h, v) => (v === null || v === undefined) ? '' : (DATE_COLS.has(h) && v !== '' ? strToSerial(v) : v);
const toRow = (sheet, rec) => head(sheet).map(h => toCell(h, rec[h]));

const DB = {
    async get(range) {
        const j = await gFetch(`${BASE}/values/${encodeURIComponent(range)}?${READ_OPTS}`);
        return j.values || [];
    },
    async batchGet(ranges) {
        const j = await gFetch(`${BASE}/values:batchGet?${ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&')}&${READ_OPTS}`);
        return j.valueRanges.map(v => v.values || []);
    },
    /* RAW: матн ҳамчун матн мемонад — формула ё сана шуда намеравад */
    append(sheet, rows) {
        return gFetch(`${BASE}/values/${encodeURIComponent(sheet + '!A1')}:append?valueInputOption=RAW&insertDataOption=OVERWRITE`,
            { method: 'POST', body: JSON.stringify({ values: rows }) }, false);
    },
    setRanges(data) {
        if (!data.length) return Promise.resolve();
        return gFetch(`${BASE}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });
    },
    structure(requests) {
        return gFetch(`${BASE}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) }, false);
    },
    async gids() {
        if (DB._gids) return DB._gids;
        const j = await gFetch(`${BASE}?fields=sheets(properties(sheetId,title))`);
        DB._gids = Object.fromEntries(j.sheets.map(s => [s.properties.title, s.properties.sheetId]));
        return DB._gids;
    },
    /* Рақами воқеии сатрҳоро пеш аз ҳар тағйир аз нав мехонад — касе дигар сатр нест карда бошад ҳам, хато намешавад */
    async locate(sheet, field, value) {
        const c = colName(head(sheet).indexOf(field));
        const rows = await DB.get(`${sheet}!${c}:${c}`);
        const out = [];
        rows.forEach((r, i) => { if (i > 0 && String(r[0] ?? '').trim() === String(value).trim()) out.push(i + 1); });
        return out;
    },
    async setFields(sheet, row, changes) {
        const h = head(sheet);
        await DB.setRanges(Object.entries(changes).map(([k, v]) => {
            const i = h.indexOf(k);
            if (i < 0) throw known(`Дар варақи ${sheet} сутуни ${k} нест.`);
            return { range: `${sheet}!${colName(i)}${row}`, values: [[toCell(k, v)]] };
        }));
    },
    async deleteRows(map) {
        const gids = await DB.gids();
        const requests = [];
        for (const [sheet, rows] of Object.entries(map)) {
            [...new Set(rows)].filter(n => n > 1).sort((a, b) => b - a).forEach(n => requests.push({
                deleteDimension: { range: { sheetId: gids[sheet], dimension: 'ROWS', startIndex: n - 1, endIndex: n } }
            }));
        }
        if (requests.length) await DB.structure(requests);
    }
};

/* ---------- нигоҳдории маҳаллӣ: барнома фавран кушода мешавад ---------- */
const Local = {
    db: null,
    open() {
        if (Local.db) return Local.db;
        Local.db = new Promise((res, rej) => {
            const r = indexedDB.open('delus', 1);
            r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('img'); };
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        });
        return Local.db;
    },
    async run(store, mode, fn) {
        try {
            const db = await Local.open();
            return await new Promise((res, rej) => {
                const q = fn(db.transaction(store, mode).objectStore(store));
                q.onsuccess = () => res(q.result);
                q.onerror = () => rej(q.error);
            });
        } catch (e) { return undefined; }
    },
    get: (store, k) => Local.run(store, 'readonly', s => s.get(k)),
    set: (store, k, v) => Local.run(store, 'readwrite', s => s.put(v, k)),
    del: (store, k) => Local.run(store, 'readwrite', s => s.delete(k)),
    clear: store => Local.run(store, 'readwrite', s => s.clear())
};

/* ==================================================================
   ҲОЛАТИ БАРНОМА
   ================================================================== */
const S = {
    user: null, fp: '',
    products: [], locations: [], tx: [], txSorted: [], exp: [], debts: [], pays: [],
    rep: { tab: 'all', k: 'month', from: '', to: '', loc: '', cat: '', q: '', ecat: '' }, homeK: 'today', fOpen: false, csv: null,
    heads: {}, cfg: { low_stock_default: 10, company_name: 'DELUS', currency: 'сомонӣ' },
    page: 'home', period: 'today', f: {}, limit: PAGE_SIZE,
    seq: 0, sig: '', syncedAt: 0, offline: false, schema: []
};
const I = { prod: new Map(), loc: new Map(), stock: new Map(), total: new Map(), debt: new Map(), cust: new Map() };

const isActive = r => !['INACTIVE', 'ARCHIVED'].includes(String(r.status || 'ACTIVE').trim().toUpperCase());
const activeProds = () => S.products.filter(isActive);
const activeLocs = () => S.locations.filter(isActive);
const prodBy = id => I.prod.get(String(id));
const locBy = id => I.loc.get(String(id));
const locName = id => (locBy(id) || {}).name || '—';
const shopLoc = () => activeLocs().find(l => l.location_type === 'Shop') || activeLocs()[0];
const qtyAt = (p, l) => round3(I.stock.get(`${p}|${l}`) || 0);
const qtyAll = p => round3(I.total.get(String(p)) || 0);
const unitOf = p => (p && p.unit) || 'дона';
const lowLimit = p => (p.min_stock === '' || p.min_stock === undefined) ? num(S.cfg.low_stock_default) : num(p.min_stock);

function stockState(p) {
    const q = qtyAll(p.id);
    if (q < 0) return 'neg';
    if (q === 0) return 'out';
    return q <= lowLimit(p) ? 'low' : 'ok';
}
function stockPill(p) {
    if (!isActive(p)) return '<span class="pill">Дар бойгонӣ</span>';
    const q = `${qty(qtyAll(p.id))} ${esc(unitOf(p))}`;
    return { neg: `<span class="pill bad">${q}</span>`, out: '<span class="pill bad">Тамом шуд</span>', low: `<span class="pill warn">${q}</span>`, ok: `<span class="pill good">${q}</span>` }[stockState(p)];
}

const isSale = x => x.type === 'SALE';
const isRet = x => x.type === 'RETURN';
const txSum = x => num(x.quantity) * num(x.unit_price);
const txCost = x => num(x.quantity) * num(x.unit_cost);
const netRev = list => list.reduce((s, x) => s + (isSale(x) ? txSum(x) : isRet(x) ? -txSum(x) : 0), 0);
const netProfit = list => list.reduce((s, x) => s + (isSale(x) ? txSum(x) - txCost(x) : isRet(x) ? txCost(x) - txSum(x) : 0), 0);
const inRange = (list, from, to) => list.filter(x => { const d = dayOf(x); return (!from || d >= from) && (!to || d <= to); });

function parseTable(name, rows) {
    const h = (rows[0] || []).map(c => String(c).trim());
    S.heads[name] = h;
    const out = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (r[0] === '' || r[0] === undefined || r[0] === null) continue;
        const o = {};
        for (let j = 0; j < h.length; j++) {
            const v = r[j] === undefined ? '' : r[j];
            o[h[j]] = DATE_COLS.has(h[j]) ? toDateStr(v) : v;
        }
        out.push(o);
    }
    return out;
}

function reindex() {
    I.prod = new Map(S.products.map(p => [String(p.id), p]));
    I.loc = new Map(S.locations.map(l => [String(l.id), l]));
    I.stock = new Map();
    I.total = new Map();
    const add = (p, l, q) => {
        const k = `${p}|${l}`;
        I.stock.set(k, (I.stock.get(k) || 0) + q);
        I.total.set(p, (I.total.get(p) || 0) + q);
    };
    for (const x of S.tx) {
        const q = num(x.quantity), p = String(x.product_id);
        if (x.to_location_id !== '') add(p, String(x.to_location_id), q);
        if (x.from_location_id !== '') add(p, String(x.from_location_id), -q);
    }
    S.txSorted = [...S.tx].sort((a, b) => String(b.date).localeCompare(String(a.date)) || num(b.id) - num(a.id));
    reindexDebts();
}

/* ---------- қарз: боқимонда ҳамеша аз пардохтҳо ҳисоб мешавад ---------- */
const MONEY_EPS = 0.005;
const custKey = (name, phone) => {
    const digits = String(phone || '').replace(/\D/g, '').slice(-9);
    return digits.length >= 7 ? 'p' + digits : 'n' + norm(name);
};
function reindexDebts() {
    const paid = new Map();
    for (const p of S.pays) { const k = String(p.debt_id); paid.set(k, (paid.get(k) || 0) + num(p.amount)); }
    I.debt = new Map();
    I.cust = new Map();
    const today_ = today();
    for (const d of S.debts) {
        d._paid = Math.round((paid.get(String(d.id)) || 0) * 100) / 100;
        d._left = Math.max(0, Math.round((num(d.amount) - d._paid) * 100) / 100);
        d._closed = d._left <= MONEY_EPS;
        d._late = !d._closed && !!d.due_date && String(d.due_date).slice(0, 10) < today_;
        d._key = custKey(d.customer, d.phone);
        I.debt.set(String(d.id), d);
        let c = I.cust.get(d._key);
        if (!c) { c = { key: d._key, name: d.customer, phone: d.phone, debts: [], amount: 0, paid: 0, left: 0, late: false, last: '' }; I.cust.set(d._key, c); }
        c.debts.push(d);
        if (String(d.date) >= String(c.debts[0].date)) { c.name = d.customer || c.name; c.phone = d.phone || c.phone; }
        c.amount += num(d.amount); c.paid += d._paid; c.left += d._left; c.late = c.late || d._late;
    }
    for (const p of S.pays) {
        const d = I.debt.get(String(p.debt_id));
        if (d) { const c = I.cust.get(d._key); if (String(p.date) > c.last) c.last = String(p.date); }
    }
    for (const c of I.cust.values()) { c.left = Math.round(c.left * 100) / 100; c.debts.sort((a, b) => String(a.date).localeCompare(String(b.date))); }
}
const customers = () => [...I.cust.values()];
const custBy = key => I.cust.get(key);
const debtOfReceipt = rc => rc ? S.debts.find(d => d.receipt_code === rc) : null;
const isCash = p => String(p.method || 'CASH').toUpperCase() !== 'RETURN';

function applyData([p, l, t, c, e, d, dp]) {
    S.debts = parseTable('Debts', d || []);
    S.pays = parseTable('DebtPayments', dp || []);
    S.products = parseTable('Products', p);
    S.locations = parseTable('Locations', l);
    S.tx = parseTable('Transactions', t);
    S.tx.forEach(x => { x.type = String(x.type).trim().toUpperCase(); });
    S.exp = parseTable('Expenses', e || []);
    const cfg = { low_stock_default: 10, company_name: 'DELUS', currency: 'сомонӣ' };
    (c || []).slice(1).forEach(r => { if (r[0] !== '' && r[0] !== undefined) cfg[String(r[0]).trim()] = r[1] ?? ''; });
    S.cfg = cfg;
    S.schema = ['Products', 'Locations', 'Transactions'].flatMap(s => COLS[s].filter(k => !S.heads[s].includes(k)).map(k => `${s}.${k}`));
    reindex();
}

const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const fingerprint = (u, p) => sha(`delus|${String(u).trim().toLowerCase()}|${String(p).trim()}`);

/* Маълумотро аз ҷадвал мехонад. Агар ҳангоми хондан сабти нав шуда бошад, натиҷаи кӯҳна партофта мешавад. */
let syncing = null;
function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
        const btn = $('#syncBtn');
        if (btn) btn.classList.add('spin');
        try {
            for (let i = 0; i < 3; i++) {
                const seq = S.seq;
                const data = await DB.batchGet(RANGES);
                if (seq !== S.seq) continue;
                const logins = SERVER ? null : data.pop();
                if (S.user && !SERVER) {
                    const ok = await Promise.all(logins.slice(1).map(r => fingerprint(r[0], r[1])));
                    if (!ok.includes(S.fp)) { logout('Логин ё парол иваз шудааст. Аз нав ворид шавед.'); return; }
                }
                const sig = JSON.stringify(data);
                if (sig !== S.sig) {
                    S.sig = sig;
                    applyData(data);
                    Local.set('kv', 'snapshot', data);
                    refresh();
                    loadImages();
                }
                break;
            }
            S.syncedAt = Date.now();
            setOffline(false);
        } catch (e) {
            console.error(e);
            if (e.message === MSG.net || e.message === MSG.noServer) setOffline(e.message === MSG.noServer ? 'server' : true);
            throw e;
        } finally {
            syncing = null;
            if (btn) btn.classList.remove('spin');
        }
    })();
    return syncing;
}
const syncQuiet = () => sync().catch(() => { });
let syncTimer = 0;
function syncSoon() { clearTimeout(syncTimer); syncTimer = setTimeout(syncQuiet, 1500); }

function setOffline(v) {
    S.offline = v;
    drawBanner();
}
function drawBanner() {
    const b = $('#banner');
    if (!b) return;
    const items = [];
    if (S.offline === 'server') items.push(`<div class="note bad">${ic('warn', 16)}<span>${esc(MSG.noServer)}</span></div>`);
    else if (S.offline) items.push(`<div class="offline">${ic('warn', 16)}<span>Пайваст нест. Маълумоти охирин нишон дода мешавад, сабти нав ҳоло имкон надорад.</span></div>`);
    if (S.schema.length) items.push(`<div class="note bad">${ic('warn', 16)}<span>Дар ҷадвал ин сутунҳо нестанд: ${esc(S.schema.join(', '))}</span></div>`);
    b.innerHTML = items.join('');
}

/* ==================================================================
   САБТ ДАР ҶАДВАЛ
   ================================================================== */
const wrote = () => { S.seq++; reindex(); refresh(); syncSoon(); };

const maxId = rows => rows.reduce((m, r, i) => i === 0 ? m : Math.max(m, parseInt(r[0], 10) || 0), 0);

/* Як ё якчанд сатри амалиёт. Дар ду дастгоҳ якбора сабт шавад ҳам, рақамҳо такрор намемонанд. */
async function addTx(lines, { receipt = false } = {}) {
    const first = await nextIdOf('Transactions', S.tx, lines.length);
    const rc = receipt ? 'R-' + pad5(first) : '';
    const recs = lines.map((l, i) => ({
        ...l,
        id: first + i,
        transaction_code: 'TR-' + pad5(first + i),
        base_quantity: l.quantity,
        created_at: nowStr(),
        receipt_code: l.receipt_code || rc
    }));
    const res = await DB.append('Transactions', recs.map(r => toRow('Transactions', r)));
    S.tx.push(...recs);
    wrote();
    /* бе сервер рақам дар браузер ҳисоб мешавад, бинобар ин такрор санҷида мешавад; бо сервер рақам ҳамеша ягона аст */
    if (!SERVER) fixDuplicateIds(recs, res).catch(e => console.error(e));
    return recs;
}

async function fixDuplicateIds(recs, res) {
    const m = /!\D+(\d+)/.exec(res.updates && res.updates.updatedRange || '');
    if (!m) return;
    const start = +m[1];
    const idCol = colName(head('Transactions').indexOf('id'));
    const rows = await DB.get(`Transactions!${idCol}:${idCol}`);
    const before = new Set(rows.slice(1, start - 1).map(r => String(r[0])));
    if (!recs.some(r => before.has(String(r.id)))) return;
    let next = maxId(rows) + 1;
    S.seq++;
    for (let i = 0; i < recs.length; i++, next++) {
        recs[i].id = next;
        recs[i].transaction_code = 'TR-' + pad5(next);
        await DB.setFields('Transactions', start + i, { id: next, transaction_code: recs[i].transaction_code });
    }
    syncSoon();
}

async function updateTx(x, changes) {
    const [row] = await DB.locate('Transactions', 'id', x.id);
    if (!row) throw known('Ин амалиёт дар ҷадвал ёфт нашуд. Навсозӣ кунед.');
    await DB.setFields('Transactions', row, changes);
    Object.assign(txById(x.id) || x, changes);
    wrote();
}

async function deleteTx(x) {
    const rows = await DB.locate('Transactions', 'id', x.id);
    await DB.deleteRows({ Transactions: rows });
    S.tx = S.tx.filter(t => String(t.id) !== String(x.id));
    wrote();
}

async function addProduct(rec) {
    let id;
    if (SERVER) id = await nextIdOf('Products', S.products);
    else {
        const a = await DB.batchGet(['Products!A:A', 'Transactions!E:E']);
        id = Math.max(maxId(a[0]), maxId(a[1]), ...S.products.map(p => num(p.id))) + 1;
    }
    const p = {
        ...rec, id,
        product_code: rec.product_code || 'DL-' + pad5(id),
        status: 'ACTIVE',
        created_at: nowStr()
    };
    if (rec._photo) p.image_url = await saveImage(id, rec._photo);
    delete p._photo;
    await DB.append('Products', [toRow('Products', p)]);
    S.products.push(p);
    wrote();
    return p;
}

async function updateProduct(p, changes) {
    const [row] = await DB.locate('Products', 'id', p.id);
    if (!row) throw known('Ин мол дар ҷадвал ёфт нашуд. Навсозӣ кунед.');
    await DB.setFields('Products', row, changes);
    Object.assign(p, changes);
    Object.assign(prodBy(p.id) || p, changes);
    wrote();
}

async function deleteProduct(p) {
    const [pr, tr, im] = await Promise.all([
        DB.locate('Products', 'id', p.id),
        DB.locate('Transactions', 'product_id', p.id),
        DB.locate('Images', 'product_id', p.id)
    ]);
    await DB.deleteRows({ Transactions: tr, Images: im, Products: pr });
    S.products = S.products.filter(x => String(x.id) !== String(p.id));
    S.tx = S.tx.filter(t => String(t.product_id) !== String(p.id));
    IMG.delete(String(p.id));
    Local.del('img', String(p.id));
    wrote();
}

async function setSetting(key, value, note) {
    const rows = await DB.locate('Settings', 'key', key);
    if (rows.length) await DB.setFields('Settings', rows[0], { value });
    else await DB.append('Settings', [[key, value, note || '']]);
    S.cfg[key] = value;
    wrote();
}

async function saveExpense(e, rec) {
    if (e) {
        const [row] = await DB.locate('Expenses', 'id', e.id);
        if (!row) throw known('Ин хароҷот дар ҷадвал ёфт нашуд. Навсозӣ кунед.');
        await DB.setFields('Expenses', row, rec);
        Object.assign(S.exp.find(x => String(x.id) === String(e.id)) || e, rec);
    } else {
        const id = await nextIdOf('Expenses', S.exp);
        const full = { ...rec, id, created_at: nowStr() };
        await DB.append('Expenses', [toRow('Expenses', full)]);
        S.exp.push(full);
    }
    wrote();
}

async function deleteExpense(e) {
    await DB.deleteRows({ Expenses: await DB.locate('Expenses', 'id', e.id) });
    S.exp = S.exp.filter(x => String(x.id) !== String(e.id));
    wrote();
}

/* ---------- қарз: сабт ---------- */
/* Рақами нав. Бо сервер рақамро сервер медиҳад, то ду дастгоҳ як рақам нагиранд. n: чанд рақами пайдарпай */
async function nextIdOf(sheet, local, n = 1) {
    if (SERVER) return (await serverCall('/ids', { sheet, n })).first;
    const c = colName(head(sheet).indexOf('id'));
    return Math.max(maxId(await DB.get(`${sheet}!${c}:${c}`)), ...local.map(x => num(x.id)), 0) + 1;
}

/* Ҳолати қарз дар ҷадвал (suporid / status) аз рӯи пардохтҳо нав мешавад, то соҳиби мағоза дар ҷадвал ҳам дуруст бинад */
async function syncDebtRows(ids) {
    reindexDebts();
    const idCol = colName(head('Debts').indexOf('id'));
    const rows = await DB.get(`Debts!${idCol}:${idCol}`);
    const rowOf = new Map(rows.map((r, i) => [String(r[0]), i + 1]));
    const h = head('Debts'), data = [];
    for (const id of new Set(ids.map(String))) {
        const d = I.debt.get(id), row = rowOf.get(id);
        if (!d || !row) continue;
        d.paid = d._paid;
        d.status = d._closed ? 'CLOSED' : 'OPEN';
        data.push({ range: `Debts!${colName(h.indexOf('paid'))}${row}`, values: [[d._paid]] });
        data.push({ range: `Debts!${colName(h.indexOf('status'))}${row}`, values: [[d.status]] });
    }
    await DB.setRanges(data);
}

async function addDebt(rec) {
    const id = await nextIdOf('Debts', S.debts);
    const d = { status: 'OPEN', paid: 0, note: '', receipt_code: '', due_date: '', ...rec, id, created_at: nowStr() };
    await DB.append('Debts', [toRow('Debts', d)]);
    S.debts.push(d);
    wrote();
    return d;
}

async function updateDebt(d, changes) {
    const [row] = await DB.locate('Debts', 'id', d.id);
    if (!row) throw known('Ин қарз дар ҷадвал ёфт нашуд. Навсозӣ кунед.');
    await DB.setFields('Debts', row, changes);
    Object.assign(I.debt.get(String(d.id)) || d, changes);
    reindexDebts();
    await syncDebtRows([d.id]);
    wrote();
}

async function deleteDebt(d) {
    const [dr, pr] = await Promise.all([DB.locate('Debts', 'id', d.id), DB.locate('DebtPayments', 'debt_id', d.id)]);
    await DB.deleteRows({ DebtPayments: pr, Debts: dr });
    S.debts = S.debts.filter(x => String(x.id) !== String(d.id));
    S.pays = S.pays.filter(p => String(p.debt_id) !== String(d.id));
    wrote();
}

/* Пардохтҳо: якчанд сатр якбора; баъд ҳолати қарзҳо нав мешавад */
async function addPayments(list) {
    if (!list.length) return [];
    const first = await nextIdOf('DebtPayments', S.pays);
    const recs = list.map((p, i) => ({ method: 'CASH', note: '', date: nowStr(), ...p, id: first + i, created_at: nowStr() }));
    await DB.append('DebtPayments', recs.map(r => toRow('DebtPayments', r)));
    S.pays.push(...recs);
    await syncDebtRows(recs.map(r => r.debt_id));
    wrote();
    return recs;
}

/* Пардохти мизоҷ ба қарзҳои кушодаи ӯ аз кӯҳнатарин сар карда тақсим мешавад */
async function payCustomer(c, amount, { method = 'CASH', note = '', date = nowStr() } = {}) {
    let rest = Math.round(num(amount) * 100) / 100;
    const open = c.debts.filter(d => !d._closed);
    const total = open.reduce((s, d) => s + d._left, 0);
    if (rest <= 0) throw known('Маблағро нависед.');
    if (rest - total > MONEY_EPS) throw known(`Қарзи боқимонда ҳамагӣ ${money(total)} аст.`);
    const list = [];
    for (const d of open) {
        if (rest <= MONEY_EPS) break;
        const part = Math.min(rest, d._left);
        list.push({ debt_id: d.id, amount: Math.round(part * 100) / 100, method, note, date });
        rest = Math.round((rest - part) * 100) / 100;
    }
    return addPayments(list);
}

async function deletePayment(p) {
    await DB.deleteRows({ DebtPayments: await DB.locate('DebtPayments', 'id', p.id) });
    S.pays = S.pays.filter(x => String(x.id) !== String(p.id));
    await syncDebtRows([p.debt_id]);
    wrote();
}

async function saveLocation(l, changes) {
    if (l) {
        const [row] = await DB.locate('Locations', 'id', l.id);
        if (!row) throw known('Ин ҷой дар ҷадвал ёфт нашуд. Навсозӣ кунед.');
        await DB.setFields('Locations', row, changes);
        Object.assign(l, changes);
        Object.assign(locBy(l.id) || l, changes);
    } else {
        const id = await nextIdOf('Locations', S.locations);
        const rec = { id, status: 'ACTIVE', ...changes };
        await DB.append('Locations', [toRow('Locations', rec)]);
        S.locations.push(rec);
    }
    wrote();
}

async function deleteLocation(l) {
    await DB.deleteRows({ Locations: await DB.locate('Locations', 'id', l.id) });
    S.locations = S.locations.filter(x => String(x.id) !== String(l.id));
    wrote();
}

/* ---------- аксҳо: дар варақи Images, бе Google Drive ---------- */
const IMG = new Map();
const BAD_IMG = new Set();

function imgSrc(p) {
    const u = String(p.image_url || '');
    if (u.startsWith('img:')) return IMG.get(String(p.id)) || '';
    return u && !BAD_IMG.has(u) ? u : '';
}

async function saveImage(id, data) {
    const stamp = nowStr();
    const rows = await DB.locate('Images', 'product_id', id);
    if (rows.length) await DB.setFields('Images', rows[0], { data, updated_at: stamp });
    else await DB.append('Images', [toRow('Images', { product_id: id, data, updated_at: stamp })]);
    const v = 'img:' + Date.now();
    IMG.set(String(id), data);
    Local.set('img', String(id), { v, data });
    return v;
}

async function removeImage(id) {
    await DB.deleteRows({ Images: await DB.locate('Images', 'product_id', id) });
    IMG.delete(String(id));
    Local.del('img', String(id));
}

let imagesBusy = false;
async function loadImages() {
    if (imagesBusy) return;
    imagesBusy = true;
    try {
        const need = [];
        for (const p of S.products) {
            const v = String(p.image_url || '');
            if (!v.startsWith('img:') || IMG.has(String(p.id))) continue;
            const c = await Local.get('img', String(p.id));
            if (c && c.v === v) { IMG.set(String(p.id), c.data); paintImage(p); }
            else need.push(p);
        }
        if (!need.length) return;
        const ids = await DB.get('Images!A:A');
        const rowOf = new Map(ids.map((r, i) => [String(r[0]), i + 1]));
        const list = need.filter(p => rowOf.has(String(p.id)));
        for (let i = 0; i < list.length; i += 30) {
            const part = list.slice(i, i + 30);
            const got = await DB.batchGet(part.map(p => `Images!B${rowOf.get(String(p.id))}`));
            got.forEach((v, n) => {
                const data = v[0] && v[0][0], p = part[n];
                if (!data) return;
                IMG.set(String(p.id), data);
                Local.set('img', String(p.id), { v: p.image_url, data });
                paintImage(p);
            });
        }
    } catch (e) { console.error(e); } finally { imagesBusy = false; }
}

function paintImage(p) {
    const src = imgSrc(p);
    if (!src) return;
    $$(`.thumb[data-pid="${p.id}"]`).forEach(t => {
        if (t.querySelector('.ph')) return;
        const im = new Image();
        im.className = 'ph';
        im.alt = p.name;
        im.src = src;
        t.append(im);
    });
}

/* Моли бе акс тасвири навъи худро мегирад */
const ART = [
    [/автомат|предохран|дифавтомат|узо/, 'breaker', 'green'],
    [/розет|удлин|сетев|вилк/, 'socket', 'blue'],
    [/выключ|переключ|клавиш/, 'switch', 'violet'],
    [/кабел|провод|шнур|сим/, 'cable', 'amber'],
    [/светил|ламп|led|прожект|люстр|чарог/, 'bulb', 'amber']
];
function artOf(p) {
    const name = norm(p.name), cat = norm(p.category);
    return ART.find(a => a[0].test(name)) || ART.find(a => a[0].test(cat)) || [null, 'box', 'slate'];
}
function thumb(p, cls = '') {
    const src = imgSrc(p), a = artOf(p);
    return `<span class="thumb ${cls} a-${a[2]}" data-pid="${esc(p.id)}"><img class="art" src="assets/img/products/${a[1]}.svg" alt="">${src ? `<img class="ph" src="${esc(src)}" alt="${esc(p.name)}" loading="lazy">` : ''}</span>`;
}
document.addEventListener('error', e => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('ph')) {
        BAD_IMG.add(e.target.getAttribute('src'));
        e.target.remove();
    }
}, true);

function loadImageFile(file) {
    return new Promise((res, rej) => {
        const url = URL.createObjectURL(file);
        const im = new Image();
        im.onload = () => { URL.revokeObjectURL(url); res(im); };
        im.onerror = () => { URL.revokeObjectURL(url); rej(known('Ин файл акс нест.')); };
        im.src = url;
    });
}
/* PHOTO-START
   Акс пеш аз сабт ба шакли ягона меояд:
   1. ҳошияи сафеди зиёдатӣ бурида мешавад, то худи мол калон намояд;
   2. мол дар маркази квадрат бо ҳошияи якхела ҷой мегирад — ҳамаи кортҳо якранг мешаванд;
   3. андоза то 800×800, бе калонкунии сунъӣ (акси хурд хира намешавад);
   4. акси калони камера зина ба зина хурд мешавад, то канорҳо тез ва тоза монанд;
   5. баландтарин сифате интихоб мешавад, ки ба ҳуҷайраи ҷадвал (45 000 аломат) мегунҷад.
   Формат JPEG аст, чунки дар ҳамаи телефонҳо, ҳатто кӯҳна, кушода мешавад. */
const PHOTO_MAX = 800, PHOTO_MIN = 240, PHOTO_PAD = .06;

async function decodePhoto(file) {
    if (window.createImageBitmap) {
        try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { }
    }
    return loadImageFile(file);
}

/* Минтақаи мол: ҳама чизе, ки сафед ё шаффоф нест */
function photoBox(img) {
    const W = img.width, H = img.height, k = Math.min(1, 200 / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (px[i + 3] > 16 && (px[i] < 238 || px[i + 1] < 238 || px[i + 2] < 238)) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    }
    if (x1 < 0) return { x: 0, y: 0, w: W, h: H };
    const m = 2;   // як-ду пиксел захира, то соя бурида нашавад
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
    return { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k };
}

/* Хурдкунии зина ба зина: ҳар қадам на зиёда аз ду маротиба */
function photoScaled(img, box, tw, th) {
    let src = img, sx = box.x, sy = box.y, sw = box.w, sh = box.h;
    while (sw / 2 > tw && sh / 2 > th) {
        const c = document.createElement('canvas');
        c.width = Math.round(sw / 2); c.height = Math.round(sh / 2);
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
        src = c; sx = 0; sy = 0; sw = c.width; sh = c.height;
    }
    return { src, sx, sy, sw, sh };
}

function photoRender(img, box, side) {
    const inner = side * (1 - 2 * PHOTO_PAD), k = Math.min(inner / box.w, inner / box.h);
    const tw = Math.max(1, Math.round(box.w * k)), th = Math.max(1, Math.round(box.h * k));
    const s = photoScaled(img, box, tw, th);
    const c = document.createElement('canvas');
    c.width = side; c.height = side;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, side, side);
    g.imageSmoothingQuality = 'high';
    g.drawImage(s.src, s.sx, s.sy, s.sw, s.sh, Math.round((side - tw) / 2), Math.round((side - th) / 2), tw, th);
    return c;
}

async function shrinkPhoto(file) {
    const img = await decodePhoto(file);
    if (!img.width || !img.height) throw known('Ин файл акс нест.');
    const box = photoBox(img);
    let side = Math.round(Math.min(PHOTO_MAX, Math.max(PHOTO_MIN, Math.max(box.w, box.h) / (1 - 2 * PHOTO_PAD))));
    for (; side >= 200; side = Math.round(side * .85)) {
        const c = photoRender(img, box, side);
        let lo = .5, hi = .93, best = '';
        for (let i = 0; i < 6; i++) {
            const q = (lo + hi) / 2, d = c.toDataURL('image/jpeg', q);
            if (d.length <= CELL_MAX) { best = d; lo = q; } else hi = q;
        }
        if (!best) { const d = c.toDataURL('image/jpeg', .5); if (d.length <= CELL_MAX) best = d; }
        if (best) {
            const small = Math.max(box.w, box.h) < 300;   // худи мол дар акси аслӣ хурд аст
            if (img.close) img.close();
            return { data: best, size: side, kb: Math.round(best.length * .75 / 1024), small };
        }
    }
    throw known('Акс хеле калон аст. Акси дигар интихоб кунед.');
}
/* PHOTO-END */
