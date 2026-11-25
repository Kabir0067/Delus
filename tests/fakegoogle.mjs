/* Ҷадвали сохтаи Google Sheets дар хотира — барои санҷишҳо.
   sheetsApi(tables).google(pathAndQuery, opts) ҳамон шакли ҷавобро медиҳад, ки server.js аз Google мегирад: { status, text }.
   Амалҳо: хондан (values, values:batchGet), append, values:batchUpdate, :batchUpdate (appendCells, updateCells, deleteDimension).
   :batchUpdate мисли Google ё пурра иҷро мешавад ё тамоман не.
   serveGoogle(api, port) — ҳамин ҷадвал ҳамчун сервери HTTP, то server.js-и воқеӣ бо он кор кунад (GOOGLE_API). */
import http from 'node:http';

const letters = s => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export function parseRange(range) {
    const [sheetRaw, part = ''] = decodeURIComponent(range).split('!');
    const sheet = sheetRaw.replace(/^'|'$/g, '');
    const m = /^([A-Z]+)?(\d+)?(?::([A-Z]+)?(\d+)?)?$/i.exec(part);
    if (!part || !m) return { sheet, c0: 0, c1: 999, r0: 0, r1: Infinity };
    const c0 = m[1] ? letters(m[1]) : 0, r0 = m[2] ? +m[2] - 1 : 0;
    const single = m[3] === undefined && m[4] === undefined;
    const c1 = single ? (m[1] ? c0 : 999) : (m[3] ? letters(m[3]) : 999), r1 = single ? (m[2] ? r0 : Infinity) : (m[4] ? +m[4] - 1 : Infinity);
    return { sheet, c0, c1, r0, r1 };
}

export function sheetsApi(tables) {
    const log = { appends: [], updates: [], deletes: [], reads: 0, batches: 0 };
    const gid = name => Object.keys(tables).indexOf(name) + 10;
    const byGid = id => Object.keys(tables).find(t => gid(t) === id);
    const read = range => {
        const { sheet, c0, c1, r0, r1 } = parseRange(range);
        const rows = tables[sheet] || [];
        const out = [];
        for (let r = r0; r < rows.length && r <= r1; r++) {
            const row = (rows[r] || []).slice(c0, c1 + 1);
            while (row.length && (row[row.length - 1] === '' || row[row.length - 1] === undefined)) row.pop();
            out.push(row.map(v => v === undefined ? '' : v));
        }
        while (out.length && !out[out.length - 1].length) out.pop();
        return { range, values: out };
    };
    const lastRow = rows => { let n = rows.length; while (n > 0 && !(rows[n - 1] || []).some(v => v !== '' && v !== undefined)) n--; return n; };
    const val = c => !c || !c.userEnteredValue ? '' : 'numberValue' in c.userEnteredValue ? c.userEnteredValue.numberValue : c.userEnteredValue.stringValue ?? '';
    const ok = body => ({ status: 200, text: JSON.stringify(body) });
    const fail = (status, message) => ({ status, text: JSON.stringify({ error: { code: status, message } }) });

    async function google(pathAndQuery, opts = {}) {
        const method = opts.method || 'GET';
        const u = new URL('http://x' + (pathAndQuery.startsWith('/') || pathAndQuery.startsWith(':') || pathAndQuery.startsWith('?') ? '' : '/') + pathAndQuery.replace(/^:/, '/:'));
        const p = decodeURIComponent(u.pathname);
        const body = opts.body ? JSON.parse(opts.body) : {};
        if (method === 'GET' && (p === '/' || p === '') && u.searchParams.get('fields')) return ok({ sheets: Object.keys(tables).map(t => ({ properties: { title: t, sheetId: gid(t) } })) });
        if (method === 'GET' && p === '/values:batchGet') { log.reads++; return ok({ valueRanges: u.searchParams.getAll('ranges').map(read) }); }
        if (method === 'GET' && p.startsWith('/values/')) { log.reads++; return ok(read(p.slice(8))); }
        const ap = /^\/values\/(.+):append$/.exec(p);
        if (method === 'POST' && ap) {
            const sheet = parseRange(ap[1]).sheet, rows = body.values;
            const t = (tables[sheet] = tables[sheet] || [[]]);
            const at = lastRow(t);
            rows.forEach((r, i) => { t[at + i] = [...r]; });
            log.appends.push({ sheet, rows });
            return ok({ updates: { updatedRange: `${sheet}!A${at + 1}` } });
        }
        if (method === 'PUT' && p.startsWith('/values/')) {
            const { sheet, c0, r0 } = parseRange(p.slice(8));
            body.values.forEach((vals, i) => vals.forEach((v, j) => { const row = (tables[sheet][r0 + i] = tables[sheet][r0 + i] || []); row[c0 + j] = v; }));
            return ok({});
        }
        if (method === 'POST' && p === '/values:batchUpdate') {
            for (const d of body.data) {
                const { sheet, c0, r0 } = parseRange(d.range);
                if (!tables[sheet]) return fail(400, 'Unable to parse range: ' + d.range);
                d.values.forEach((vals, i) => vals.forEach((v, j) => { const row = (tables[sheet][r0 + i] = tables[sheet][r0 + i] || []); row[c0 + j] = v; }));
                log.updates.push({ range: d.range, values: d.values });
            }
            return ok({});
        }
        if (method === 'POST' && p === '/:batchUpdate') {
            /* аввал санҷиш, баъд иҷро: ё ҳама, ё ҳеҷ */
            for (const r of body.requests) {
                const k = Object.keys(r)[0], x = r[k];
                const sid = k === 'deleteDimension' ? x.range.sheetId : k === 'updateCells' ? x.range.sheetId : x.sheetId;
                if (!byGid(sid)) return fail(400, 'No grid with id: ' + sid);
                if (!['appendCells', 'updateCells', 'deleteDimension'].includes(k)) return fail(400, 'unsupported ' + k);
            }
            log.batches++;
            const work = structuredClone(Object.fromEntries(Object.keys(tables).map(t => [t, tables[t]])));
            for (const r of body.requests) {
                if (r.deleteDimension) {
                    const d = r.deleteDimension.range, sheet = byGid(d.sheetId);
                    work[sheet].splice(d.startIndex, d.endIndex - d.startIndex);
                    log.deletes.push({ sheet, row: d.startIndex + 1 });
                } else if (r.appendCells) {
                    const sheet = byGid(r.appendCells.sheetId), t = work[sheet], at = lastRow(t);
                    r.appendCells.rows.forEach((row, i) => { t[at + i] = row.values.map(val); });
                    log.appends.push({ sheet, rows: r.appendCells.rows.map(row => row.values.map(val)) });
                } else if (r.updateCells) {
                    const g = r.updateCells.range, sheet = byGid(g.sheetId), t = work[sheet];
                    r.updateCells.rows.forEach((row, i) => row.values.forEach((c, j) => { const tr = (t[g.startRowIndex + i] = t[g.startRowIndex + i] || []); tr[g.startColumnIndex + j] = val(c); }));
                    log.updates.push({ sheet, row: g.startRowIndex + 1, col: g.startColumnIndex, values: r.updateCells.rows.map(row => row.values.map(val)) });
                }
            }
            for (const t of Object.keys(work)) tables[t] = work[t];
            return ok({ replies: body.requests.map(() => ({})) });
        }
        return fail(404, 'unknown ' + method + ' ' + p);
    }
    return { google, gid, log, read };
}

/* Ҳамин ҷадвал ҳамчун сервери HTTP. fault: { fail: n } — n дархости навбатии сабт бо 503 ва бе сабт; { lose: n } — сабт мешавад, вале ҷавоб намеравад. */
export function serveGoogle(api, port, sheetId = 'TEST') {
    const fault = { fail: 0, lose: 0 };
    const srv = http.createServer(async (req, res) => {
        let raw = '';
        for await (const c of req) raw += c;
        const prefix = '/' + sheetId;
        if (!req.url.startsWith(prefix)) { res.writeHead(404); return res.end('{}'); }
        const write = req.method !== 'GET';
        if (write && fault.fail > 0) { fault.fail--; res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"error":{"code":503,"message":"backend"}}'); }
        const r = await api.google(req.url.slice(prefix.length), { method: req.method, body: raw || undefined });
        if (write && fault.lose > 0) { fault.lose--; return req.socket.destroy(); }
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(r.text);
    });
    return new Promise(res => srv.listen(port, '127.0.0.1', () => res({ url: `http://127.0.0.1:${port}`, fault, close: () => srv.close() })));
}
