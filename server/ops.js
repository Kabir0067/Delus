/* ==================================================================
   DELUS — сабти амалиётҳо дар сервер (/api/op)

   Телефон як амалро (фурӯш, воридот, қарз, пардохт, хароҷот) бо як дархост мефиристад.
   Сервер рақамҳоро медиҳад ва ҳамаи сатрҳоро бо як дархости batchUpdate ба Google менависад:
   - як дархост: дар интернети суст тез аст;
   - ҳамааш ё ҳеҷ чиз: фурӯш бе қарзаш ё қарз бе пешпардохташ намемонад (Google batchUpdate-ро пурра иҷро мекунад ё тамоман не);
   - як бор: ҳар амал рақами худро (id) дорад. Агар ҷавоб ба телефон нарасид ва телефон ҳамон амалро боз фиристад,
     сервер онро дубора наменависад, балки натиҷаи пешинаро медиҳад. Ҳатто агар сервер дар байни сабт хомӯш шавад,
     пас аз бозоғозӣ месанҷад, ки сатрҳо дар ҷадвал ҳастанд ё не.
   ================================================================== */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const pad5 = n => String(n).padStart(5, '0');
const MONEY_EPS = 0.005;
const KEEP_DAYS = 30;
const HEADS_MS = 5 * 60e3;

/* Хатое, ки бо такрор ислоҳ намешавад: телефон онро ба корбар нишон медиҳад */
const bad = msg => Object.assign(new Error(msg), { status: 400, known: true });

function createOps({ google, inTurn, reserveNow, sheetIdOf, dataDir, log = () => { }, onWrite = () => { } }) {
    const FILE = path.join(dataDir, 'ops.json');
    let store = {};
    try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (e) { }
    const save = () => {
        const old = Date.now() - KEEP_DAYS * 864e5;
        for (const [k, v] of Object.entries(store)) if (v.at < old) delete store[k];
        try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(store)); fs.renameSync(FILE + '.tmp', FILE); }
        catch (e) { log('ops', e.message); }
    };

    /* ---------- сарлавҳаи варақҳо: сутун аз рӯи ном ёфта мешавад ---------- */
    const heads = new Map();
    async function readHeads(sheets) {
        const need = sheets.filter(s => { const h = heads.get(s); return !h || Date.now() - h.at > HEADS_MS; });
        if (need.length) {
            const r = await google('/values:batchGet?' + need.map(s => 'ranges=' + encodeURIComponent(s + '!1:1')).join('&') + '&valueRenderOption=UNFORMATTED_VALUE');
            if (r.status !== 200) throw Object.assign(new Error('heads ' + r.status), { gstatus: r.status });
            JSON.parse(r.text).valueRanges.forEach((v, i) => heads.set(need[i], { at: Date.now(), list: ((v.values || [])[0] || []).map(c => String(c).trim()) }));
        }
        const out = {};
        for (const s of sheets) {
            const list = heads.get(s).list;
            if (!list.length || list[0] !== (s === 'Images' ? 'product_id' : 'id')) throw bad(`Варақи ${s} дар ҷадвал сарлавҳа надорад.`);
            out[s] = list;
        }
        return out;
    }
    async function readValues(ranges) {
        const r = await google('/values:batchGet?' + ranges.map(x => 'ranges=' + encodeURIComponent(x)).join('&') + '&valueRenderOption=UNFORMATTED_VALUE');
        if (r.status !== 200) throw Object.assign(new Error('read ' + r.status), { gstatus: r.status });
        return JSON.parse(r.text).valueRanges.map(v => v.values || []);
    }

    /* ---------- санҷиши дархост ---------- */
    const okVal = v => v === '' || v === null || typeof v === 'number' && isFinite(v) || typeof v === 'string' && v.length <= 2000;
    function rec(r, what) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) throw bad(`Маълумоти ${what} нодуруст аст.`);
        const out = {};
        for (const [k, v] of Object.entries(r)) {
            if (!/^[a-z_]{1,40}$/.test(k) || !okVal(v)) throw bad(`Маълумоти ${what} нодуруст аст.`);
            out[k] = v === null ? '' : v;
        }
        return out;
    }
    function parse(body) {
        const id = String(body.id || '');
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw bad('Рақами амал нодуруст аст.');
        const list = (v, max, what) => {
            if (v === undefined || v === null) return [];
            if (!Array.isArray(v) || v.length > max) throw bad(`Маълумоти ${what} нодуруст аст.`);
            return v.map(x => rec(x, what));
        };
        const op = {
            id,
            tx: list(body.tx, 500, 'амалиёт'),
            receipt: body.receipt === true,
            debt: body.debt ? rec(body.debt, 'қарз') : null,
            pays: list(body.pays, 100, 'пардохт'),
            exp: body.exp ? rec(body.exp, 'хароҷот') : null,
            prices: list(body.prices, 500, 'нарх')
        };
        if (!op.tx.length && !op.debt && !op.pays.length && !op.exp && !op.prices.length) throw bad('Амал холӣ аст.');
        if (op.pays.some(p => p.debt_id === '$debt') && !op.debt) throw bad('Пардохт ба қарзи нав, вале қарз нест.');
        return op;
    }

    /* ---------- ячейкаҳо барои Google ---------- */
    const cell = v => v === '' || v === undefined ? {} : typeof v === 'number' ? { userEnteredValue: { numberValue: v } } : { userEnteredValue: { stringValue: String(v) } };
    const rowOf = (list, r) => ({ values: list.map(h => cell(r[h])) });
    const append = (sheet, sid, list, recs) => ({ appendCells: { sheetId: sid, rows: recs.map(r => rowOf(list, r)), fields: 'userEnteredValue' } });
    const setCell = (sid, row, col, v) => ({
        updateCells: { range: { sheetId: sid, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: col, endColumnIndex: col + 1 }, rows: [{ values: [cell(v)] }], fields: 'userEnteredValue' }
    });

    /* Рақамҳои ин амал: як бор дода мешаванд ва дар файл мемонанд */
    async function reserve(op) {
        const ids = {};
        if (op.tx.length) ids.Transactions = await reserveNow('Transactions', op.tx.length);
        if (op.debt) ids.Debts = await reserveNow('Debts', 1);
        if (op.pays.length) ids.DebtPayments = await reserveNow('DebtPayments', op.pays.length);
        if (op.exp) ids.Expenses = await reserveNow('Expenses', 1);
        return ids;
    }

    /* Пас аз хомӯшии сервер: оё сатрҳои ин амал аллакай дар ҷадвал ҳастанд? */
    async function written(ids) {
        const sheet = ['Transactions', 'Expenses', 'Debts', 'DebtPayments'].find(s => ids[s]);
        if (!sheet) return false;
        const [col] = await readValues([`${sheet}!A:A`]);
        return col.slice(1).some(r => parseInt(r[0], 10) === ids[sheet]);
    }

    function resultOf(op, ids) {
        const rc = op.receipt && ids.Transactions ? 'R-' + pad5(ids.Transactions) : '';
        return { ok: true, tx: ids.Transactions || null, receipt: rc, debt: ids.Debts || null, pays: ids.DebtPayments || null, exp: ids.Expenses || null };
    }

    async function write(op, ids) {
        const res = resultOf(op, ids);
        const sheets = [...new Set([
            ...(op.tx.length ? ['Transactions'] : []), ...(op.debt ? ['Debts'] : []), ...(op.pays.length ? ['DebtPayments'] : []),
            ...(op.exp ? ['Expenses'] : []), ...(op.prices.length ? ['Products'] : []),
            ...(op.pays.some(p => p.debt_id !== '$debt') ? ['Debts', 'DebtPayments'] : [])
        ])];
        const H = await readHeads(sheets);
        const sid = {};
        for (const s of sheets) {
            sid[s] = await sheetIdOf(s);
            if (sid[s] === undefined) throw bad(`Дар ҷадвал варақи ${s} нест.`);
        }
        const requests = [];

        const tx = op.tx.map((r, i) => ({
            ...r, id: ids.Transactions + i, transaction_code: 'TR-' + pad5(ids.Transactions + i),
            base_quantity: r.base_quantity === undefined || r.base_quantity === '' ? r.quantity : r.base_quantity,
            receipt_code: r.receipt_code || res.receipt
        }));
        const pays = op.pays.map((r, i) => ({ ...r, id: ids.DebtPayments + i, debt_id: r.debt_id === '$debt' ? ids.Debts : r.debt_id }));
        let debt = null;
        if (op.debt) {
            const paid = Math.round(pays.filter(p => p.debt_id === ids.Debts).reduce((s, p) => s + (+p.amount || 0), 0) * 100) / 100;
            debt = { ...op.debt, id: ids.Debts, paid, status: (+op.debt.amount || 0) - paid <= MONEY_EPS ? 'CLOSED' : 'OPEN', receipt_code: op.debt.receipt_code || res.receipt };
        }

        /* Пардохт ба қарзҳои мавҷуда: ҳисоби «пардохт шуд» ва ҳолати қарз аз ҳамаи пардохтҳо, на аз маълумоти телефон */
        const old = [...new Set(pays.filter(p => p.debt_id !== ids.Debts).map(p => String(p.debt_id)))];
        const updates = [];
        if (old.length) {
            const [D, P] = await readValues(['Debts!A:Z', 'DebtPayments!A:Z']);
            const dh = H.Debts, ph = H.DebtPayments;
            const di = k => dh.indexOf(k), pi = k => ph.indexOf(k);
            for (const id of old) {
                const row = D.findIndex((r, i) => i > 0 && String(r[di('id')]) === id);
                if (row < 0) throw bad('Қарз дар ҷадвал ёфт нашуд. Навсозӣ кунед.');
                const before = P.slice(1).filter(r => String(r[pi('debt_id')]) === id).reduce((s, r) => s + (+r[pi('amount')] || 0), 0);
                const paid = Math.round((before + pays.filter(p => String(p.debt_id) === id).reduce((s, p) => s + (+p.amount || 0), 0)) * 100) / 100;
                const status = (+D[row][di('amount')] || 0) - paid <= MONEY_EPS ? 'CLOSED' : 'OPEN';
                if (di('paid') >= 0) updates.push(setCell(sid.Debts, row, di('paid'), paid));
                if (di('status') >= 0) updates.push(setCell(sid.Debts, row, di('status'), status));
            }
        }
        if (op.prices.length) {
            const [col] = await readValues(['Products!A:A']);
            const h = H.Products;
            for (const u of op.prices) {
                const row = col.findIndex((r, i) => i > 0 && String(r[0]) === String(u.id));
                if (row < 0) continue;
                for (const k of ['purchase_price', 'sale_price']) if (u[k] !== undefined && h.indexOf(k) >= 0) updates.push(setCell(sid.Products, row, h.indexOf(k), u[k]));
            }
        }

        if (tx.length) requests.push(append('Transactions', sid.Transactions, H.Transactions, tx));
        if (debt) requests.push(append('Debts', sid.Debts, H.Debts, [debt]));
        if (pays.length) requests.push(append('DebtPayments', sid.DebtPayments, H.DebtPayments, pays));
        if (op.exp) requests.push(append('Expenses', sid.Expenses, H.Expenses, [{ ...op.exp, id: ids.Expenses }]));
        requests.push(...updates);

        onWrite();
        const r = await google(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
        onWrite();
        if (r.status !== 200) {
            heads.clear();   // шояд сутунҳо иваз шуда бошанд
            log('op', op.id, 'google', r.status, r.text.slice(0, 300));
            throw Object.assign(new Error('google ' + r.status), { gstatus: r.status });
        }
        return res;
    }

    /* Иҷрои амал. Ҳамон id ду бор — як сабт. */
    function run(body) {
        const op = parse(body || {});
        return inTurn(async () => {
            let e = store[op.id];
            if (e && e.state === 'done') return e.result;
            if (e && e.ids && await written(e.ids)) {
                e.state = 'done'; e.result = resultOf(op, e.ids); save();
                log('op', op.id, 'already written');
                return e.result;
            }
            if (!e) {
                e = store[op.id] = { at: Date.now(), state: 'started', ids: await reserve(op) };
                save();
            }
            const result = await write(op, e.ids);
            e.state = 'done'; e.result = result; save();
            return result;
        });
    }

    return { run };
}

module.exports = { createOps };
