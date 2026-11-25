/* DELUS — маълумот, ҳисоб ва сабт дар ҷадвал */
'use strict';

/* ------------------------------------------------------------------
   Сохтори ҷадвал. Сутунҳо аз рӯи ном ёфта мешаванд, на аз рӯи ҷой.
   ------------------------------------------------------------------ */
const COLS = {
    Products: ['id', 'product_code', 'name', 'category', 'series', 'color', 'mesta', 'taga', 'unit', 'units_per_box', 'purchase_price', 'sale_price', 'image_url', 'description', 'status', 'created_at', 'min_stock', 'barcode'],
    Locations: ['id', 'name', 'location_type', 'status'],
    Transactions: ['id', 'transaction_code', 'date', 'type', 'product_id', 'from_location_id', 'to_location_id', 'quantity', 'unit', 'base_quantity', 'unit_cost', 'unit_price', 'note', 'created_at', 'receipt_code'],
    Settings: ['key', 'value', 'note'],
    Images: ['product_id', 'data', 'updated_at'],
    Expenses: ['id', 'date', 'category', 'amount', 'location_id', 'note', 'created_at'],
    Debts: ['id', 'customer', 'phone', 'amount', 'paid', 'status', 'date', 'due_date', 'receipt_code', 'note', 'created_at'],
    DebtPayments: ['id', 'debt_id', 'amount', 'date', 'method', 'note', 'created_at']
};
const DATE_COLS = new Set(['date', 'created_at', 'updated_at', 'due_date']);
/* Браузер калиди Google надорад: ҳамаи дархостҳо тавассути сервери худи барнома мераванд. Варақи login ба браузер намерасад. */
/* Сутунҳои иловагӣ: агар дар ҷадвал набошанд, огоҳӣ намеояд (барнома худаш илова мекунад) */
const OPTIONAL_COLS = new Set(['Products.barcode']);
const RANGES = ['Products!A:Z', 'Locations!A:D', 'Transactions!A:O', 'Settings!A:C', 'Expenses!A:G', 'Debts!A:K', 'DebtPayments!A:G'];
const UNITS = ['дона', 'метр', 'кг', 'қуттӣ', 'ҷуфт', 'литр'];
const TZ_HOURS = 5;          // Тоҷикистон: UTC+5, бе соати тобистона
const PAGE_SIZE = 60;
const CELL_MAX = 45000;      // ҳуҷайраи Google Sheets то 50 000 аломат мегирад

const NAV = [
    { k: 'home', icon: 'home', t: 'Асосӣ', s: '' },
    { k: 'prod', icon: 'tag', t: 'Молҳо', s: 'Рӯйхати борҳо, нарх ва акс' },
    { k: 'stock', icon: 'box', t: 'Анбор', s: 'Миқдори мол дар анбор ва мағоза' },
    { k: 'debt', icon: 'debt', t: 'Қарз', s: 'Насия: кӣ чанд қарздор аст' },
    { k: 'tx', icon: 'list', t: 'Амалиётҳо', s: 'Рӯйхати фурӯш, воридот ва интиқол' },
    { k: 'rep', icon: 'chart', t: 'Ҳисобот', s: 'Натиҷаи фурӯш, фоида ва хароҷот' },
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

/* ---------- ҷустуҷӯ ----------
   Корбар номи молро чӣ хеле ки мешунавад, ҳамон хел менависад: «разетка», «виключател», «афтомат 16», «кабел 2,5», «razetka».
   1. Ҳарфҳо ба як шакл меоянд: тоҷикӣ ва русӣ (қ→к, ӯ→у, ы→и, ь нест), лотинӣ ба кириллӣ (razetka → разетка).
   2. Овозҳои наздик якхела ҳисоб мешаванд: о/а, е/и, д/т, з/с, б/п, в/ф, г/к (разедка = розетка).
   3. Як-ду ҳарфи хато ё партофта бахшида мешавад (калимаи дароз — бештар).
   4. Номҳои маъмул: «чароғ» лампа ва светильникро меёбад, «сим» — кабел ва провод, «калид» — выключатель.
   Рақамҳо («16», «2.5») ҳамеша аниқ ҷустуҷӯ мешаванд: 16 ҳеҷ гоҳ 18-ро намеёбад. */
const LAT2 = [['shch', 'щ'], ['sch', 'щ'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'], ['kh', 'х'], ['gh', 'г'], ['ts', 'ц'], ['ya', 'я'], ['yu', 'ю'], ['yo', 'е'], ['ck', 'к']];
const LAT1 = { a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'и', z: 'з' };
function norm(s) {
    let v = String(s ?? '').toLowerCase();
    if (/[a-z]/.test(v)) {
        for (const [a, b] of LAT2) v = v.split(a).join(b);
        v = v.replace(/[a-z]/g, c => LAT1[c]);
    }
    return v
        .replace(/ё/g, 'е').replace(/ӯ/g, 'у').replace(/қ/g, 'к').replace(/ғ/g, 'г').replace(/ҳ/g, 'х').replace(/ҷ/g, 'ч').replace(/ӣ/g, 'и')
        .replace(/[ыйі]/g, 'и').replace(/э/g, 'е').replace(/ю/g, 'у').replace(/я/g, 'а').replace(/[ьъ]/g, '')
        .replace(/(\d)[.,](?=\d)/g, '$1d')
        .replace(/[^0-9a-zа-яd]+/g, ' ').replace(/d/g, '.').trim();
}
const SOUND = { о: 'а', е: 'и', д: 'т', з: 'с', б: 'п', в: 'ф', г: 'к', ж: 'ш', щ: 'ш', ц: 'с' };
const skel = w => w.replace(/[оедзбвгжщц]/g, c => SOUND[c]).replace(/(.)\1+/g, '$1');
const hasDigit = w => /\d/.test(w);

/* Номҳои маъмул. Решаҳо: калима бо ин сар шавад кофист. */
const SYN = [
    ['ламп', 'светил', 'свет', 'чарог', 'чарок', 'люстр', 'прожект', 'бра', 'led', 'лед', 'панел', 'софит'],
    ['розет', 'разет', 'розетк'],
    ['виключ', 'выключ', 'калид', 'клавиш', 'тугма', 'переключ'],
    ['кабел', 'провод', 'сим', 'шнур', 'ввг', 'пвс'],
    ['автомат', 'афтомат', 'предохран', 'узо', 'дифавт', 'пробк'],
    ['удлин', 'тройник', 'переноск', 'пилот', 'сетев'],
    ['коробк', 'кутти', 'бокс', 'щит', 'щиток'],
    ['бел', 'сафед', 'white', 'вайт'],
    ['черн', 'сиех', 'сиах', 'black', 'блек'],
    ['сер', 'хокистар', 'grey', 'gray', 'грей'],
    ['золот', 'тилло', 'gold', 'голд']
].map(g => [...new Set(g.map(x => skel(norm(x))))]);

/* Масофаи таҳрир (бо ҷойивазкунии ду ҳарфи ҳамсоя), бо ҳадди max: зиёдтар бошад — max + 1 */
function editDist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const m = a.length, n = b.length;
    let pp = null, p = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const c = [i];
        let low = i;
        for (let j = 1; j <= n; j++) {
            let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, pp[j - 2] + 1);
            c.push(v);
            if (v < low) low = v;
        }
        if (low > max) return max + 1;
        pp = p; p = c;
    }
    return p[n];
}
const typos = len => len >= 8 ? 2 : len >= 5 ? 1 : 0;

/* Матн барои ҷустуҷӯ ба калимаҳо тақсим мешавад ва нигоҳ дошта мешавад (ҳар ҳарф як бор коркард мешавад, на ҳар бор ҳангоми навиштан) */
const SEARCH_IX = new Map();
function searchIndex(text) {
    let ix = SEARCH_IX.get(text);
    if (ix) return ix;
    const words = norm(text).split(' ').filter(Boolean);
    ix = { words, sk: words.map(skel), first: words[0] || '' };
    if (SEARCH_IX.size > 5000) SEARCH_IX.clear();
    SEARCH_IX.set(text, ix);
    return ix;
}

/* [баҳо, суст]. Баҳо 0 — мувофиқ нест: ҳар калимаи ҷустуҷӯ бояд дар матн бошад.
   «Суст» — ягон калима танҳо бо хатои имло ё номи маъмул ёфт шуд. */
function matchInfo(text, query) {
    const q = norm(query).split(' ').filter(Boolean);
    if (!q.length) return [1, false];
    const ix = searchIndex(text);
    let score = 0, weak = false;
    for (let k = 0; k < q.length; k++) {
        const t = q[k];
        let best = 0;
        if (hasDigit(t)) {
            for (const w of ix.words) if (w.includes(t)) { best = w === t || w.startsWith(t) ? 6 : 4; if (best === 6) break; }
        } else {
            const ts = skel(t), max = typos(ts.length);
            for (let i = 0; i < ix.words.length && best < 6; i++) {
                const w = ix.words[i], ws = ix.sk[i];
                if (w.startsWith(t)) best = Math.max(best, w === t ? 6 : 5);
                else if (ws.startsWith(ts)) best = Math.max(best, 4);
                else if (t.length >= 4 && w.includes(t)) best = Math.max(best, 3);
                else if (max && ws.length >= ts.length) {
                    const d = Math.min(editDist(ts, ws.slice(0, ts.length), max), editDist(ts, ws.slice(0, ts.length + 1), max), editDist(ts, ws.slice(0, Math.max(1, ts.length - 1)), max));
                    if (d <= max) best = Math.max(best, d === 1 ? 2.5 : 2);
                }
            }
            if (!best && ts.length >= 3) {
                const g = SYN.find(list => list.some(s => ts.startsWith(s) || (s.startsWith(ts) && ts.length >= 3)));
                if (g && ix.sk.some(ws => g.some(s => ws.startsWith(s)))) best = 1.5;
            }
        }
        if (!best) return [0, true];
        if (best < 3) weak = true;
        score += best;
    }
    if (ix.first.startsWith(q[0])) score += 3;
    return [score, weak];
}
const matchScore = (text, query) => matchInfo(text, query)[0];
const hasAll = (text, query) => matchScore(text, query) > 0;
/* Ҳама чизе, ки мол бо он ёфт мешавад */
const prodText = p => [p.name, p.product_code, p.category, p.series, p.color, p.description, p.barcode].filter(x => x !== undefined && x !== '').join(' ');
/* Рӯйхат бо ҷустуҷӯ: беҳтарин мувофиқат аввал.
   Агар моли аниқ ёфт шавад, мувофиқатҳои суст (хатои имло, номи маъмул) нишон дода намешаванд:
   «прожектор» танҳо прожекторро медиҳад, «чароғ» бошад (ки дар номҳо нест) ҳамаи лампаҳоро. */
function rankBy(list, text, q, boost) {
    let hits = list.map(x => { const [s, weak] = matchInfo(text(x), q); return { x, s: s + (boost ? boost(x) : 0), weak }; }).filter(h => h.s > 0);
    if (hits.some(h => !h.weak)) hits = hits.filter(h => !h.weak);
    return hits.sort((a, b) => b.s - a.s).map(h => h.x);
}

/* ==================================================================
   ПАЙВАСТ БО GOOGLE SHEETS
   ================================================================== */
const BASE = `${CONFIG.api}/sheets`;
const READ_OPTS = 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
const MSG = {
    net: 'Интернет нест. Пайвастро санҷед ва боз кӯшиш кунед.',
    access: 'Барнома ба ҷадвал дастрасӣ надорад. Ба соҳиби барнома хабар диҳед.',
    busy: 'Ҷадвал ҳоло банд аст. Пас аз як дақиқа боз кӯшиш кунед.',
    fail: 'Амал иҷро нашуд. Боз кӯшиш кунед.',
    noServer: 'Сервери барнома ҳоло ҷавоб намедиҳад. Пас аз чанд дақиқа саҳифаро аз нав кушоед.'
};
/* Агар саҳифа на аз сервери барнома, балки аз сервери оддии файлҳо кушода шуда бошад, /api вуҷуд надорад */
const NO_API = new Set([404, 405, 501]);
const known = text => Object.assign(new Error(text), { known: true });

try { localStorage.removeItem('delus.tok'); } catch (e) { }   // аз версияи кӯҳна мондааст

/* retry: танҳо амалҳое такрор мешаванд, ки дубора сабт намекунанд */
async function gFetch(url, opts = {}, retry = true, attempt = 0) {
    let r;
    try {
        r = await fetch(url, { ...opts, credentials: 'same-origin', headers: opts.body ? { 'Content-Type': 'application/json' } : {} });
    } catch (e) {
        if (e.known) throw e;
        if (retry && attempt < 2) { await sleep(600 * (attempt + 1)); return gFetch(url, opts, retry, attempt + 1); }
        throw known(MSG.net);
    }
    if (NO_API.has(r.status) && !/json/.test(r.headers.get('content-type') || '')) throw known(MSG.noServer);
    if (r.status === 401) {
        if (S.user) logout('Вақти воридшавӣ гузашт. Аз нав ворид шавед.');
        throw known('Аз нав ворид шавед.');
    }
    /* квотаи Google (429) дар як дақиқа барқарор мешавад — 5 кӯшиш; хатои сервер — 3 кӯшиш (~10 сония), то корбар дароз интизор нашавад */
    if ((r.status === 429 && attempt < 5) || (retry && r.status >= 500 && attempt < 3)) {
        await sleep(1500 * 2 ** attempt);
        return gFetch(url, opts, retry, attempt + 1);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        console.error('Sheets', r.status, j.error && (j.error.message || j.error));
        /* сервер барои хатои пайваст бо Google паёми тайёр мефиристад */
        throw known(typeof j.error === 'string' && j.error !== 'server' ? j.error : r.status === 403 ? MSG.access : r.status === 429 ? MSG.busy : MSG.fail);
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
    user: null, sheet: '',
    products: [], locations: [], tx: [], txSorted: [], exp: [], debts: [], pays: [],
    rep: { tab: 'all', k: 'month', from: '', to: '', loc: '', cat: '', q: '', ecat: '' }, homeK: 'today', fOpen: false, csv: null,
    heads: {}, cfg: { low_stock_default: 10, company_name: 'DELUS', currency: 'сомонӣ' },
    page: 'home', period: 'today', f: {}, limit: PAGE_SIZE, sel: new Set(), selOn: false,
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
const nameKey = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/ӯ/g, 'у').replace(/қ/g, 'к').replace(/ғ/g, 'г').replace(/ҳ/g, 'х').replace(/ҷ/g, 'ч').replace(/ӣ/g, 'и').replace(/[^0-9a-zЀ-ӿ]+/g, ' ').trim();
const custKey = (name, phone) => {
    const digits = String(phone || '').replace(/\D/g, '').slice(-9);
    return digits.length >= 7 ? 'p' + digits : 'n' + nameKey(name);
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

/* ==================================================================
   НАВБАТИ САБТ
   Фурӯш, воридот, интиқол, шумориш, бозгашт, хароҷот, қарз ва пардохт аввал дар худи телефон сабт мешаванд
   ва дарҳол дар экран пайдо мешаванд. Баъд навбат ба навбат ба сервер мераванд (/api/op).
   - Интернет набошад, навбат дар хотираи телефон (IndexedDB) мемонад ва худаш баъдтар меравад.
   - Агар ҷавоби сервер нарасад ва ҳамон сабт боз равад, сервер онро аз рӯи рақамаш мешиносад ва ду бор наменависад.
   Сабти навбат рақами муваққатӣ дорад («q:…»). Пас аз фиристодан рақами воқеии ҷадвалро мегирад.
   ================================================================== */
const Q = { list: [], busy: null, timer: 0, wait: 0 };
const isQueued = id => String(id ?? '').startsWith('q:');
const showCode = c => isQueued(c) ? 'дар навбат' : c;
const QUEUED_MSG = 'Ин сабт ҳанӯз ба ҷадвал нарафтааст. Пас аз фиристодан тағйир додан мумкин аст.';
const qWaiting = () => Q.list.filter(j => j.state === 'wait' || j.state === 'send');
const qFailed = () => Q.list.filter(j => j.state === 'fail');
const saveQueue = () => Local.set('kv', 'queue', Q.list);
function qid() {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return [...a].map(x => x.toString(16).padStart(2, '0')).join('');
}
const jobOf = id => Q.list.find(j => j.id === String(id).split(':')[1]);
/* Рақами воқеии қарзе, ки дар кори дигари навбат сохта шуд */
function realDebtId(id) {
    if (!isQueued(id)) return id;
    const j = jobOf(id);
    return j && j.res ? j.res.debt : id;
}

/* Сабтҳои навбат ба маълумоти ҷадвал илова мешаванд (пас аз ҳар хондан аз ҷадвал низ) */
function applyJob(j) {
    const r = j.res, t = `q:${j.id}:`;
    const rc = r ? r.receipt : (j.op.receipt ? t + 'r' : '');
    const debtId = j.op.debt ? (r ? r.debt : t + 'd') : '';
    j.op.tx.forEach((x, i) => S.tx.push({
        ...x, id: r ? r.tx + i : t + i, transaction_code: r ? 'TR-' + pad5(r.tx + i) : '', base_quantity: x.quantity,
        receipt_code: x.receipt_code || rc, _q: j.id
    }));
    if (j.op.debt) S.debts.push({ ...j.op.debt, id: debtId, receipt_code: j.op.debt.receipt_code || rc, paid: 0, status: 'OPEN', _q: j.id });
    j.op.pays.forEach((x, i) => S.pays.push({ ...x, id: r ? r.pays + i : t + 'p' + i, debt_id: x.debt_id === '$debt' ? debtId : realDebtId(x.debt_id), _q: j.id }));
    if (j.op.exp) S.exp.push({ ...j.op.exp, id: r ? r.exp : t + 'e', _q: j.id });
    j.op.prices.forEach(u => {
        const p = S.products.find(x => String(x.id) === String(u.id));
        if (p) Object.assign(p, { purchase_price: u.purchase_price, sale_price: u.sale_price });
    });
}
const dropJob = j => {
    const own = x => x._q !== j.id;
    S.tx = S.tx.filter(own); S.debts = S.debts.filter(own); S.pays = S.pays.filter(own); S.exp = S.exp.filter(own);
};
/* Пас аз фиристодан сабтҳои муваққатӣ бо рақамҳои воқеӣ иваз мешаванд */
function settleJob(j) {
    dropJob(j);
    applyJob(j);
    /* пардохтҳои кори дигар, ки ба қарзи ҳамин кор пайваст буданд */
    for (const p of S.pays) if (isQueued(p.debt_id)) p.debt_id = realDebtId(p.debt_id);
    S.seq++;
    reindex();
}

/* Сабти нав ба навбат. label — барои паём, агар фиристодан нашавад. */
function queueOp(label, op) {
    const j = {
        id: qid(), at: Date.now(), label, state: 'wait', tries: 0, err: '',
        op: { tx: op.tx || [], receipt: !!op.receipt, debt: op.debt || null, pays: op.pays || [], exp: op.exp || null, prices: op.prices || [] }
    };
    Q.list.push(j);
    saveQueue();
    applyJob(j);
    S.seq++;
    reindex();
    refresh();
    drawBanner();
    flush();
    return j;
}

/* Сабти навбатро бекор кардан (танҳо то фиристодан) */
function cancelJob(id) {
    const j = Q.list.find(x => x.id === id);
    if (!j || j.state === 'send' || j.state === 'done') return false;
    Q.list = Q.list.filter(x => x !== j);
    saveQueue();
    dropJob(j);
    S.seq++;
    reindex();
    refresh();
    drawBanner();
    syncSoon();
    return true;
}
function retryJob(id) {
    const j = Q.list.find(x => x.id === id);
    if (j && j.state === 'fail') { j.state = 'wait'; j.err = ''; saveQueue(); }
    Q.wait = 0;
    drawBanner();
    return flush();
}

/* Маълумот барои сервер: санаҳо ба рақами Google мегарданд, қарзи кори дигар бо рақами воқеиаш */
function wireOp(j) {
    const cells = rec => Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, toCell(k, v)]));
    const pays = j.op.pays.map(p => {
        let d = p.debt_id;
        if (isQueued(d)) {
            const dep = jobOf(d);
            if (!dep || dep.state === 'fail') throw known('Қарзе, ки ин пардохт ба он аст, сабт нашудааст.');
            if (!dep.res) return null;
            d = dep.res.debt;
        }
        return { ...cells(p), debt_id: d };
    });
    if (pays.includes(null)) return null;
    return {
        id: j.id, receipt: j.op.receipt, tx: j.op.tx.map(cells), debt: j.op.debt && cells(j.op.debt), pays,
        exp: j.op.exp && cells(j.op.exp), prices: j.op.prices
    };
}

async function opCall(body) {
    let r;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 45000);
    try {
        r = await fetch(CONFIG.api + '/op', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal
        });
    } catch (e) { throw Object.assign(new Error(MSG.net), { net: true }); }
    finally { clearTimeout(timer); }
    if (NO_API.has(r.status) && !/json/.test(r.headers.get('content-type') || '')) throw Object.assign(new Error(MSG.noServer), { server: true });
    const j = await r.json().catch(() => ({}));
    const text = typeof j.error === 'string' && j.error !== 'server' ? j.error : MSG.fail;
    if (r.status === 401) throw Object.assign(new Error(text), { auth: true });
    if (r.status === 400) throw Object.assign(new Error(text), { permanent: true });
    if (!r.ok || !j.ok) throw new Error(text);
    return j;
}

/* Фиристодан навбат ба навбат. Хатои интернет — боз кӯшиш баъд аз 3, 6, 12 … то 60 сония. */
function flush() {
    if (Q.busy) return Q.busy;
    if (!S.user || !Q.list.some(j => j.state === 'wait')) return Promise.resolve();
    clearTimeout(Q.timer);
    Q.busy = (async () => {
        for (; ;) {
            const j = Q.list.find(x => x.state === 'wait');
            if (!j || !S.user) break;
            let body;
            try { body = wireOp(j); } catch (e) { j.state = 'fail'; j.err = errText(e); saveQueue(); continue; }
            if (!body) { j.state = 'fail'; j.err = 'Қарзе, ки ин пардохт ба он аст, ҳанӯз сабт нашудааст.'; saveQueue(); continue; }
            j.state = 'send';
            S.seq++;
            try {
                j.res = await opCall(body);
                j.state = 'done';
                j.doneAt = Date.now();
                j.err = '';
                Q.wait = 0;
                saveQueue();
                settleJob(j);
                if (S.offline) setOffline(false);
                refresh();
            } catch (e) {
                j.err = e.message;
                if (e.permanent) { j.state = 'fail'; saveQueue(); refresh(); continue; }
                j.state = 'wait';
                j.tries++;
                saveQueue();
                if (e.auth) { logout('Вақти воридшавӣ гузашт. Аз нав ворид шавед. Сабтҳои дар навбат буда гум намешаванд.'); break; }
                if (e.net || e.server) setOffline(e.server ? 'server' : true);
                Q.wait = Math.min(60000, Q.wait ? Q.wait * 2 : 3000);
                Q.timer = setTimeout(flush, Q.wait);
                break;
            } finally { S.seq++; }
        }
    })().catch(e => console.error(e)).finally(() => { Q.busy = null; drawBanner(); if (!Q.wait) syncSoon(800); });
    return Q.busy;
}

async function loadQueue() {
    const list = await Local.get('kv', 'queue');
    Q.list = Array.isArray(list) ? list : [];
    /* сабте, ки ҳангоми бастани барнома фиристода мешуд, боз меравад: сервер онро ду бор наменависад */
    Q.list.forEach(j => { if (j.state === 'send') j.state = 'wait'; });
}

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
    S.schema = ['Products', 'Locations', 'Transactions'].flatMap(s => COLS[s].filter(k => !S.heads[s].includes(k) && !OPTIONAL_COLS.has(`${s}.${k}`)).map(k => `${s}.${k}`));
    Q.list.forEach(applyJob);
    for (const x of S.pays) if (isQueued(x.debt_id)) x.debt_id = realDebtId(x.debt_id);
    reindex();
}

/* Маълумотро аз ҷадвал мехонад. Агар ҳангоми хондан сабти нав шуда бошад, натиҷаи кӯҳна партофта мешавад. */
let syncing = null;
function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
        const btn = $('#syncBtn');
        if (btn) btn.classList.add('spin');
        try {
            for (let i = 0; i < 4; i++) {
                if (Q.busy) await Q.busy;
                const seq = S.seq, started = Date.now();
                const data = await DB.batchGet(RANGES);
                if (seq !== S.seq) continue;
                /* корҳое, ки пеш аз ин хондан фиристода шуданд, акнун дар худи ҷадвал ҳастанд */
                const seen = Q.list.filter(j => j.state === 'done' && j.doneAt < started);
                if (seen.length) { Q.list = Q.list.filter(j => !seen.includes(j)); saveQueue(); }
                const sig = JSON.stringify(data) + '|' + Q.list.map(j => j.id + j.state).join(',');
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
            ensureBarcodeCol();
            if (Q.list.some(j => j.state === 'wait')) flush();
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
function syncSoon(ms = 1500) { clearTimeout(syncTimer); syncTimer = setTimeout(syncQuiet, ms); }

/* Сутуни штрихкод дар варақи Products: агар нест, барнома худаш дар охири сарлавҳа илова мекунад */
let barcodeJob = null;
function ensureBarcodeCol() {
    const h = S.heads.Products;
    if (!h || !h.length || h.includes('barcode')) return Promise.resolve();
    return barcodeJob = barcodeJob || addBarcodeCol().finally(() => { barcodeJob = null; });
}
async function addBarcodeCol() {
    try {
        const [row] = await DB.get('Products!1:1');
        const cells = (row || []).map(v => String(v).trim());
        if (cells.includes('barcode')) return;
        let n = cells.length;
        while (n > 0 && !cells[n - 1]) n--;
        await DB.setRanges([{ range: `Products!${colName(n)}1`, values: [['barcode']] }]);
        S.heads.Products = [...cells.slice(0, n), 'barcode'];
        syncSoon(300);
    } catch (e) { console.error(e); }
}

function setOffline(v) {
    if (S.offline === v) return;
    S.offline = v;
    drawBanner();
}
function drawBanner() {
    const b = $('#banner');
    const wait = qWaiting().length, failed = qFailed();
    const sb = $('#syncBtn');
    if (sb) {
        let n = $('.sync-n', sb);
        if (wait && !n) { n = document.createElement('b'); n.className = 'sync-n'; sb.append(n); }
        if (n) { if (wait) n.textContent = wait; else n.remove(); }
        sb.title = wait ? `${wait} сабт ҳанӯз ба ҷадвал нарафтааст` : 'Навсозӣ';
    }
    if (!b) return;
    const items = [];
    const kept = wait ? ` ${fmt(wait)} сабт дар телефон нигоҳ дошта шуд ва худаш ба ҷадвал меравад.` : '';
    if (S.offline === 'server') items.push(`<div class="note bad">${ic('warn', 16)}<span>${esc(MSG.noServer)}${esc(kept)}</span></div>`);
    else if (S.offline) items.push(`<div class="offline">${ic('warn', 16)}<span>Интернет нест. Маълумоти охирин нишон дода мешавад.${esc(kept)}</span></div>`);
    else if (wait && Q.wait) items.push(`<div class="note warn">${ic('sync', 16)}<span>${fmt(wait)} сабт ҳанӯз нарафт. Барнома худаш боз мефиристад. <button class="link" data-act="qRetry">Ҳозир фиристодан</button></span></div>`);
    for (const j of failed) items.push(`<div class="note bad">${ic('warn', 16)}<span><b>Сабт нашуд: ${esc(j.label)}.</b> ${esc(j.err)}
        <span class="note-a"><button class="btn sm" data-act="qRetry" data-id="${esc(j.id)}">Боз кӯшиш</button><button class="btn sm danger" data-act="qDrop" data-id="${esc(j.id)}">Нест кардан</button></span></span></div>`);
    if (S.schema.length) items.push(`<div class="note bad">${ic('warn', 16)}<span>Дар ҷадвал ин сутунҳо нестанд: ${esc(S.schema.join(', '))}</span></div>`);
    b.innerHTML = items.join('');
}

/* ==================================================================
   САБТИ ДИГАР ДАР ҶАДВАЛ (мол, ҷой, танзимот, тағйир ва нест кардан): бо интернет
   ================================================================== */
const wrote = () => { S.seq++; reindex(); refresh(); syncSoon(); };
const notQueued = x => { if (isQueued(x.id)) { flush(); throw known(QUEUED_MSG); } };

async function updateTx(x, changes) {
    notQueued(x);
    const [row] = await DB.locate('Transactions', 'id', x.id);
    if (!row) throw known('Ин амалиёт дар ҷадвал ёфт нашуд. Навсозӣ кунед.');
    await DB.setFields('Transactions', row, changes);
    Object.assign(txById(x.id) || x, changes);
    wrote();
}

async function deleteTx(x) {
    notQueued(x);
    const rows = await DB.locate('Transactions', 'id', x.id);
    await DB.deleteRows({ Transactions: rows });
    S.tx = S.tx.filter(t => String(t.id) !== String(x.id));
    wrote();
}

async function addProduct(rec) {
    const id = await nextIdOf('Products', S.products);
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

const deleteProduct = p => deleteProducts([p]);

/* Якчанд мол якбора: як хондан ва як дархости нест кардан барои ҳамаашон (на се дархост барои ҳар мол).
   Ҳамроҳи мол амалиётҳо ва акси он низ нест мешаванд. */
async function deleteProducts(list) {
    const ids = new Set(list.map(p => String(p.id)));
    if (!ids.size) return;
    if (S.tx.some(t => t._q && ids.has(String(t.product_id)))) { flush(); throw known('Ин мол сабти ба ҷадвал нарафта дорад. Пас аз фиристодани он нест кунед.'); }
    const col = (sheet, field) => { const c = colName(head(sheet).indexOf(field)); return `${sheet}!${c}:${c}`; };
    const [pr, tr, im] = await DB.batchGet([col('Products', 'id'), col('Transactions', 'product_id'), col('Images', 'product_id')]);
    const rowsOf = rows => rows.map((r, i) => i > 0 && ids.has(String(r[0] ?? '').trim()) ? i + 1 : 0).filter(Boolean);
    await DB.deleteRows({ Transactions: rowsOf(tr), Images: rowsOf(im), Products: rowsOf(pr) });
    S.products = S.products.filter(p => !ids.has(String(p.id)));
    S.tx = S.tx.filter(t => !ids.has(String(t.product_id)));
    ids.forEach(id => { IMG.delete(id); Local.del('img', id); });
    wrote();
}

/* Ба бойгонӣ гузоштан ё баргардонидани якчанд мол: як хондан ва як сабт */
async function setProductsStatus(list, status) {
    const ids = new Set(list.map(p => String(p.id)));
    if (!ids.size) return;
    const h = head('Products'), c = colName(h.indexOf('id')), sc = colName(h.indexOf('status'));
    const rows = await DB.get(`Products!${c}:${c}`);
    const data = [];
    rows.forEach((r, i) => { if (i > 0 && ids.has(String(r[0] ?? '').trim())) data.push({ range: `Products!${sc}${i + 1}`, values: [[status]] }); });
    if (!data.length) throw known('Ин молҳо дар ҷадвал ёфт нашуданд. Навсозӣ кунед.');
    await DB.setRanges(data);
    S.products.forEach(p => { if (ids.has(String(p.id))) p.status = status; });
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
        notQueued(e);
        const [row] = await DB.locate('Expenses', 'id', e.id);
        if (!row) throw known('Ин хароҷот дар ҷадвал ёфт нашуд. Навсозӣ кунед.');
        await DB.setFields('Expenses', row, rec);
        Object.assign(S.exp.find(x => String(x.id) === String(e.id)) || e, rec);
        wrote();
    } else {
        queueOp(`Хароҷот ${money(rec.amount)}`, { exp: { ...rec, created_at: nowStr() } });
    }
}

async function deleteExpense(e) {
    notQueued(e);
    await DB.deleteRows({ Expenses: await DB.locate('Expenses', 'id', e.id) });
    S.exp = S.exp.filter(x => String(x.id) !== String(e.id));
    wrote();
}

/* ---------- қарз: сабт ---------- */
/* Рақами нав: сервер медиҳад, то ду дастгоҳ ҳеҷ гоҳ як рақам нагиранд. n: чанд рақами пайдарпай */
async function nextIdOf(sheet, local, n = 1) {
    return (await serverCall('/ids', { sheet, n })).first;
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

/* Қарзи дастӣ (масалан, қарзи кӯҳна) */
function addDebt(rec) {
    const j = queueOp(`Қарзи ${rec.customer}`, { debt: { status: 'OPEN', paid: 0, note: '', receipt_code: '', due_date: '', ...rec, created_at: nowStr() } });
    return S.debts.find(d => d._q === j.id);
}

async function updateDebt(d, changes) {
    notQueued(d);
    const [row] = await DB.locate('Debts', 'id', d.id);
    if (!row) throw known('Ин қарз дар ҷадвал ёфт нашуд. Навсозӣ кунед.');
    await DB.setFields('Debts', row, changes);
    Object.assign(I.debt.get(String(d.id)) || d, changes);
    reindexDebts();
    await syncDebtRows([d.id]);
    wrote();
}

async function deleteDebt(d) {
    notQueued(d);
    if (S.pays.some(p => String(p.debt_id) === String(d.id) && isQueued(p.id))) { flush(); throw known(QUEUED_MSG); }
    const [dr, pr] = await Promise.all([DB.locate('Debts', 'id', d.id), DB.locate('DebtPayments', 'debt_id', d.id)]);
    await DB.deleteRows({ DebtPayments: pr, Debts: dr });
    S.debts = S.debts.filter(x => String(x.id) !== String(d.id));
    S.pays = S.pays.filter(p => String(p.debt_id) !== String(d.id));
    wrote();
}

/* Пардохти мизоҷ ба қарзҳои кушодаи ӯ аз кӯҳнатарин сар карда тақсим мешавад */
function payCustomer(c, amount, { method = 'CASH', note = '', date = nowStr() } = {}) {
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
    queueOp(`Пардохти ${c.name} ${money(amount)}`, { pays: list.map(p => ({ ...p, created_at: nowStr() })) });
    return list;
}

async function deletePayment(p) {
    notQueued(p);
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
/* калимаҳо пас аз norm(): «выключатель» → «виключател», «LED» → «лед», «люстра» → «лустра» */
const ART = [
    [/автомат|предохран|узо/, 'breaker', 'green'],
    [/розет|разет|удлин|сетев|вилк/, 'socket', 'blue'],
    [/виключ|переключ|клавиш|калид/, 'switch', 'violet'],
    [/кабел|провод|шнур|сим/, 'cable', 'amber'],
    [/светил|ламп|лед|прожект|лустр|чарог/, 'bulb', 'amber']
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
