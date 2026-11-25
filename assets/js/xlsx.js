/* DELUS — рӯйхати молҳо ба Excel (.xlsx)
   Як варақ: акси мол, бақия дар ҳар анбор, ҳамагӣ, нархҳо, арзиш, фоида ва ҷамъ.
   Файл дар худи браузер сохта мешавад, бе китобхонаи бегона: XML-и Office Open дар ZIP.
   Excel, WPS, LibreOffice ва Google Sheets онро мекушоянд. */
'use strict';

const XL = {};

/* ---------- ZIP (бе фишурдан: аксҳо аллакай JPEG-и фишурдаанд, XML хурд аст) ---------- */
XL.crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
})();
XL.crc = bytes => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = XL.crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
XL.zip = files => {
    const enc = new TextEncoder(), parts = [], central = [];
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0;
    for (const f of files) {
        const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = XL.crc(data);
        const h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
        h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
        parts.push(new Uint8Array(h.buffer), name, data);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
        c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
        c.setUint32(42, offset, true);
        central.push(new Uint8Array(c.buffer), name);
        offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, a) => s + a.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, size, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

/* ---------- ёрирасонҳои XML ---------- */
XL.head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
XL.x = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
XL.ref = (c, r) => colName(c) + r;
XL.str = (c, r, text, s) => `<c r="${XL.ref(c, r)}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${XL.x(text)}</t></is></c>`;
XL.num = (c, r, v, s) => `<c r="${XL.ref(c, r)}" s="${s}"><v>${Number.isFinite(+v) ? +v : 0}</v></c>`;
XL.fx = (c, r, f, v, s) => `<c r="${XL.ref(c, r)}" s="${s}"><f>${XL.x(f)}</f><v>${Number.isFinite(+v) ? +v : 0}</v></c>`;
XL.blank = (c, r, s) => `<c r="${XL.ref(c, r)}" s="${s}"/>`;
XL.r3 = n => Math.round(n * 1000) / 1000;
XL.r2 = n => Math.round(n * 100) / 100;

/* ---------- услубҳо: ҳар омезиши ҳарф/ранг/хат/формат як бор сохта мешавад ---------- */
XL.Styles = class {
    constructor() {
        this.fonts = []; this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
        this.borders = []; this.fmts = []; this.xfs = []; this.seen = new Map();
        this.font({}); this.border(''); this.xf({});
    }
    add(list, kind, key, xml) { const k = kind + key; if (!this.seen.has(k)) { this.seen.set(k, list.length); list.push(xml); } return this.seen.get(k); }
    font({ b, i, sz = 10, color = '0F1A33' }) {
        return this.add(this.fonts, 'f', [b, i, sz, color].join(), `<font>${b ? '<b/>' : ''}${i ? '<i/>' : ''}<sz val="${sz}"/><color rgb="FF${color}"/><name val="Arial"/><family val="2"/></font>`);
    }
    fill(rgb) {
        return rgb ? this.add(this.fills, 'p', rgb, `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    }
    border(kind) {
        const thin = c => `style="thin"><color rgb="FF${c}"/>`;
        const xml = kind === 'cell' ? `<border><left ${thin('DCE2EE')}</left><right ${thin('DCE2EE')}</right><top ${thin('DCE2EE')}</top><bottom ${thin('DCE2EE')}</bottom><diagonal/></border>`
            : kind === 'head' ? `<border><left ${thin('24305A')}</left><right ${thin('24305A')}</right><top ${thin('24305A')}</top><bottom style="medium"><color rgb="FFF7B733"/></bottom><diagonal/></border>`
                : kind === 'total' ? `<border><left ${thin('DCE2EE')}</left><right ${thin('DCE2EE')}</right><top style="medium"><color rgb="FF0B1430"/></top><bottom style="medium"><color rgb="FF0B1430"/></bottom><diagonal/></border>`
                    : '<border><left/><right/><top/><bottom/><diagonal/></border>';
        return this.add(this.borders, 'b', kind, xml);
    }
    fmt(code) {
        const builtin = { '': 0, General: 0, '#,##0': 3, '#,##0.00': 4 };
        if (code in builtin) return builtin[code];
        return 164 + this.add(this.fmts, 'n', code, `<numFmt numFmtId="${164 + this.fmts.length}" formatCode="${XL.x(code)}"/>`);
    }
    xf({ font = {}, fill = '', border = '', fmt = '', h = '', v = 'center', wrap = false, indent = 0 }) {
        const f = this.font(font), p = this.fill(fill), b = this.border(border), n = this.fmt(fmt);
        const al = `<alignment${h ? ` horizontal="${h}"` : ''} vertical="${v}"${wrap ? ' wrapText="1"' : ''}${indent ? ` indent="${indent}"` : ''}/>`;
        return this.add(this.xfs, 'x', [f, p, b, n, al].join('|'),
            `<xf numFmtId="${n}" fontId="${f}" fillId="${p}" borderId="${b}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${al}</xf>`);
    }
    xml() {
        return XL.head + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${this.fmts.length ? `<numFmts count="${this.fmts.length}">${this.fmts.join('')}</numFmts>` : ''}
<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>
<fills count="${this.fills.length}">${this.fills.join('')}</fills>
<borders count="${this.borders.length}">${this.borders.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
    }
};

/* Аксҳо: data:image/jpeg;base64,… → байтҳо */
XL.image = src => {
    const m = /^data:image\/(jpeg|jpg|png);base64,(.+)$/i.exec(String(src || ''));
    if (!m) return null;
    try { return { ext: m[1].toLowerCase() === 'png' ? 'png' : 'jpeg', bytes: Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)) }; }
    catch (e) { return null; }
};

/* Ҷойҳое, ки дар Excel сутун мегиранд: фаъол ва ғайрифаъоле, ки ҳанӯз мол дорад */
XL.places = () => S.locations
    .filter(l => isActive(l) || S.products.some(p => qtyAt(p.id, l.id) !== 0))
    .sort((a, b) => num(a.id) - num(b.id));

/* Китоби Excel-и рӯйхати молҳо */
XL.products = () => {
    const locs = XL.places(), L = locs.length;
    const prods = [...S.products].sort((a, b) => (isActive(b) - isActive(a)) || String(a.name).localeCompare(String(b.name), 'ru'));
    const C = { n: 0, id: 1, img: 2, name: 3, code: 4, cat: 5, unit: 6, loc0: 7, total: 7 + L, buy: 8 + L, sell: 9 + L, vBuy: 10 + L, vSell: 11 + L, profit: 12 + L, status: 13 + L };
    const last = C.status, H = 7, first = H + 1, end = H + Math.max(prods.length, 1), tot = end + 1;
    const rows = [], merges = [], anchors = [], media = [];
    const col = c => colName(c);
    const row = (r, ht, cells) => rows.push(`<row r="${r}" ht="${ht}" customHeight="1">${cells.join('')}</row>`);
    const span = (r, c0, c1) => merges.push(`${XL.ref(c0, r)}:${XL.ref(c1, r)}`);
    const fill = (r, c0, c1, s) => { const out = []; for (let c = c0; c <= c1; c++) out.push(XL.blank(c, r, s)); return out; };

    /* ранг ва услубҳо */
    const NAVY = '0B1430', INK = '0F1A33', GREY = '6B768C', GOLD_BG = 'FFF4D6', ZEBRA = 'F6F8FC';
    const st = new XL.Styles();
    const QTY_INT = '#,##0', QTY_DEC = '#,##0.0##', MONEY = '#,##0.00';
    const qf = v => Number.isInteger(+v) ? QTY_INT : QTY_DEC;
    const Y = {
        title: st.xf({ font: { b: 1, sz: 20, color: NAVY } }),
        sub: st.xf({ font: { color: GREY } }),
        bar: st.xf({ fill: 'F7B733' }),
        kpiL: st.xf({ font: { b: 1, sz: 8, color: GREY }, fill: 'F4F6FB', v: 'bottom', indent: 1 }),
        head: st.xf({ font: { b: 1, color: 'FFFFFF' }, fill: NAVY, border: 'head', h: 'center', wrap: true }),
        totL: st.xf({ font: { b: 1, sz: 11, color: NAVY }, fill: GOLD_BG, border: 'total', indent: 1 }),
        totM: st.xf({ font: { b: 1, color: INK }, fill: GOLD_BG, border: 'total', fmt: MONEY }),
        note: st.xf({ font: { i: 1, sz: 9, color: GREY }, v: 'top', wrap: true })
    };
    const kpiV = fmt => st.xf({ font: { b: 1, sz: 15, color: NAVY }, fill: 'F4F6FB', fmt, h: 'left', indent: 1 });
    const totQ = v => st.xf({ font: { b: 1, color: INK }, fill: GOLD_BG, border: 'total', fmt: qf(v), h: 'center' });
    /* услуби ҳуҷраи маълумот: z — сатри ҷуфт (заминаи сабук), то сатрҳо дар ҷадвали дароз омехта нашаванд */
    const cell = (z, { font, fill, fmt = '', h = '', wrap = false, indent = 0 } = {}) =>
        st.xf({ font, fill: fill || (z ? ZEBRA : ''), border: 'cell', fmt, h, wrap, indent });

    /* ҳисоби ҳар мол: ҳамин рақамҳо ҳамчун қимати тайёр дар файл меистанд, формулаҳо онҳоро тасдиқ мекунанд */
    const data = prods.map(p => {
        const per = locs.map(l => XL.r3(qtyAt(p.id, l.id)));
        const total = XL.r3(per.reduce((s, q) => s + q, 0));
        const buy = num(p.purchase_price), sell = num(p.sale_price), have = Math.max(total, 0);
        return { p, per, total, buy, sell, vBuy: XL.r2(have * buy), vSell: XL.r2(have * sell), on: isActive(p), st: stockState(p) };
    });
    const sum = k => XL.r2(data.reduce((s, d) => s + d[k], 0));
    const units = XL.r3(data.reduce((s, d) => s + d.total, 0));
    const lowCount = data.filter(d => d.on && d.st !== 'ok').length;

    /* 1–3: сарлавҳа ва хати тиллоӣ */
    row(1, 36, [XL.str(0, 1, `${S.cfg.company_name || 'DELUS'}: рӯйхати пурраи молҳо`, Y.title), ...fill(1, 1, last, Y.title)]);
    span(1, 0, last);
    row(2, 18, [XL.str(0, 2, `Ҳолат ба ${dateLong(today())}, соати ${nowStr().slice(11, 16)} · маълумот ҳамин лаҳза аз ҷадвал гирифта шуд · ${fmt(prods.length)} мол, ${fmt(L)} анбор`, Y.sub), ...fill(2, 1, last, Y.sub)]);
    span(2, 0, last);
    row(3, 5, fill(3, 0, last, Y.bar));

    /* 4–5: хулоса */
    const rest = last - 3, g = Math.max(1, Math.floor(rest / 4));
    const kp = [[0, 2], [3, 3], [4, 3 + g], [4 + g, 3 + 2 * g], [4 + 2 * g, 3 + 3 * g], [4 + 3 * g, last]].filter(([a, b]) => a <= b);
    const rng = c => `${col(c)}${first}:${col(c)}${end}`;
    const kpis = [
        ['ШУМОРАИ МОЛ', 0, `COUNTA(${rng(C.name)})`, prods.length, QTY_INT],
        ['ҲАМАГӢ ДАР АНБОРҲО', 0, `SUM(${rng(C.total)})`, units, qf(units)],
        ['АРЗИШ БО НАРХИ ХАРИД', 0, `SUM(${rng(C.vBuy)})`, sum('vBuy'), MONEY],
        ['АРЗИШ БО НАРХИ ФУРӮШ', 0, `SUM(${rng(C.vSell)})`, sum('vSell'), MONEY],
        ['ФОИДАИ ИНТИЗОРӢ', 0, `SUM(${rng(C.profit)})`, XL.r2(sum('vSell') - sum('vBuy')), MONEY],
        ['КАМ МОНДААСТ Ё ТАМОМ', 0, '', lowCount, QTY_INT]
    ].slice(0, kp.length);
    const r4 = [], r5 = [];
    kpis.forEach(([label, , f, v, nf], i) => {
        const [a, b] = kp[i], vs = kpiV(nf);
        r4.push(XL.str(a, 4, label, Y.kpiL), ...fill(4, a + 1, b, Y.kpiL));
        r5.push(f ? XL.fx(a, 5, f, v, vs) : XL.num(a, 5, v, vs), ...fill(5, a + 1, b, vs));
        if (b > a) { span(4, a, b); span(5, a, b); }
    });
    row(4, 22, r4);
    row(5, 30, r5);
    row(6, 10, []);

    /* 7: сарлавҳаи ҷадвал */
    const heads = ['№', 'ID', 'Акс', 'Номи мол', 'Рамз', 'Гурӯҳ', 'Воҳид', ...locs.map(l => l.name), 'Ҳамагӣ', 'Нархи харид', 'Нархи фурӯш', 'Арзиш (нархи харид)', 'Арзиш (нархи фурӯш)', 'Фоидаи интизорӣ', 'Ҳолат'];
    row(H, 36, heads.map((t, c) => XL.str(c, H, t, Y.head)));

    /* маълумот: ҳар мол як сатр; акс 76×76 дар мобайни ҳуҷра */
    const IMG = 76, ROW_PT = 62, ROW_PX = Math.round(ROW_PT * 4 / 3), IMG_COL = 13;
    const hasImg = data.some(d => XL.image(imgSrc(d.p)));
    const ht = hasImg ? ROW_PT : 24;
    const STATUS = { ok: ['Ҳаст', '0B8A63'], low: ['Кам мондааст', 'B4690E'], out: ['Тамом шуд', 'C9342A'], neg: ['Камомад', 'C9342A'] };
    data.forEach((d, i) => {
        const r = first + i, p = d.p, z = i % 2 === 1, cells = [];
        cells.push(XL.num(C.n, r, i + 1, cell(z, { font: { color: GREY }, h: 'center' })));
        cells.push(XL.num(C.id, r, num(p.id) || 0, cell(z, { font: { color: GREY }, h: 'center' })));
        const im = XL.image(imgSrc(p));
        if (im) {
            media.push(im);
            anchors.push({ r, n: media.length, name: p.name });
            cells.push(XL.blank(C.img, r, cell(z, { h: 'center' })));
        } else cells.push(XL.str(C.img, r, 'бе акс', cell(z, { font: { sz: 8, color: '9AA3B8' }, h: 'center' })));
        cells.push(XL.str(C.name, r, p.name, cell(z, { font: { b: 1 }, wrap: true, indent: 1 })));
        cells.push(XL.str(C.code, r, p.product_code || '', cell(z, { font: { color: GREY }, h: 'center' })));
        cells.push(XL.str(C.cat, r, p.category || '', cell(z, { wrap: true })));
        cells.push(XL.str(C.unit, r, unitOf(p), cell(z, { font: { color: GREY }, h: 'center' })));
        d.per.forEach((q, j) => cells.push(XL.num(C.loc0 + j, r, q, cell(z, q < 0 ? { font: { b: 1, color: 'C9342A' }, fill: 'FDEBE9', fmt: qf(q), h: 'center' } : { fmt: qf(q), h: 'center' }))));
        const tf = L ? `SUM(${col(C.loc0)}${r}:${col(C.loc0 + L - 1)}${r})` : '0';
        const tLook = !d.on || d.st === 'ok' ? { font: { b: 1 } } : d.st === 'low' ? { font: { b: 1, color: 'B4690E' }, fill: 'FFF4E0' } : { font: { b: 1, color: 'C9342A' }, fill: 'FDEBE9' };
        cells.push(XL.fx(C.total, r, tf, d.total, cell(z, { ...tLook, fmt: qf(d.total), h: 'center' })));
        cells.push(XL.num(C.buy, r, d.buy, cell(z, { fmt: MONEY })), XL.num(C.sell, r, d.sell, cell(z, { fmt: MONEY })));
        cells.push(XL.fx(C.vBuy, r, `MAX(${col(C.total)}${r},0)*${col(C.buy)}${r}`, d.vBuy, cell(z, { fmt: MONEY })));
        cells.push(XL.fx(C.vSell, r, `MAX(${col(C.total)}${r},0)*${col(C.sell)}${r}`, d.vSell, cell(z, { fmt: MONEY })));
        cells.push(XL.fx(C.profit, r, `${col(C.vSell)}${r}-${col(C.vBuy)}${r}`, XL.r2(d.vSell - d.vBuy), cell(z, { font: { color: '0B8A63' }, fmt: MONEY })));
        const [stText, stColor] = d.on ? STATUS[d.st] : ['Бойгонӣ', '9AA3B8'];
        cells.push(XL.str(C.status, r, stText, cell(z, { font: { b: 1, color: stColor }, h: 'center' })));
        row(r, ht, cells);
    });
    if (!data.length) row(first, 24, [XL.str(0, first, 'Ҳоло мол нест', cell(false, { font: { color: GREY } })), ...fill(first, 1, last, cell(false))]);

    /* ҷамъ */
    const tc = [XL.str(0, tot, 'ҲАМАГӢ', Y.totL), ...fill(tot, 1, C.unit, Y.totL)];
    span(tot, 0, C.unit);
    locs.forEach((l, j) => { const v = XL.r3(data.reduce((s, d) => s + d.per[j], 0)); tc.push(XL.fx(C.loc0 + j, tot, `SUM(${rng(C.loc0 + j)})`, v, totQ(v))); });
    tc.push(XL.fx(C.total, tot, `SUM(${rng(C.total)})`, units, totQ(units)));
    tc.push(XL.blank(C.buy, tot, Y.totL), XL.blank(C.sell, tot, Y.totL));
    tc.push(XL.fx(C.vBuy, tot, `SUM(${rng(C.vBuy)})`, sum('vBuy'), Y.totM));
    tc.push(XL.fx(C.vSell, tot, `SUM(${rng(C.vSell)})`, sum('vSell'), Y.totM));
    tc.push(XL.fx(C.profit, tot, `SUM(${rng(C.profit)})`, XL.r2(sum('vSell') - sum('vBuy')), Y.totM));
    tc.push(XL.blank(C.status, tot, Y.totL));
    row(tot, 30, tc);
    row(tot + 2, 30, [XL.str(0, tot + 2, 'Арзиш бо бақияи мусбат ҳисоб мешавад. «Ҳамагӣ», арзиш ва ҷамъ бо формула ҳисоб мешаванд: агар рақамеро иваз кунед, ҷамъ худаш нав мешавад. Файл аз барномаи DELUS.', Y.note), ...fill(tot + 2, 1, last, Y.note)]);
    span(tot + 2, 0, last);

    /* бари сутунҳо (ба аломат) */
    const widths = [5, 6, IMG_COL, 34, 13, 15, 8, ...locs.map(() => 12), 11, 12, 12, 15, 15, 14, 17];
    const cols = widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('');
    const area = `$A$${H}:$${col(last)}$${end}`;

    const sheet = XL.head + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${col(last)}${tot + 2}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="4" ySplit="${H}" topLeftCell="E${first}" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="E${first}" sqref="E${first}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rows.join('')}</sheetData>
${data.length ? `<autoFilter ref="A${H}:${col(last)}${end}"/>` : ''}
<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>
<pageMargins left="0.35" right="0.35" top="0.45" bottom="0.45" header="0.25" footer="0.25"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
<headerFooter><oddFooter>&amp;L${XL.x(S.cfg.company_name || 'DELUS')}&amp;RСаҳифаи &amp;P аз &amp;N</oddFooter></headerFooter>
${media.length ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;

    /* аксҳо: дар мобайни ҳуҷраи «Акс» */
    const EMU = 9525, cellW = IMG_COL * 7 + 5;
    const drawing = XL.head + `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.map(a => `
<xdr:oneCellAnchor><xdr:from><xdr:col>${C.img}</xdr:col><xdr:colOff>${Math.round((cellW - IMG) / 2) * EMU}</xdr:colOff><xdr:row>${a.r - 1}</xdr:row><xdr:rowOff>${Math.round((ROW_PX - IMG) / 2) * EMU}</xdr:rowOff></xdr:from><xdr:ext cx="${IMG * EMU}" cy="${IMG * EMU}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${a.n + 1}" name="Акс ${a.n}" descr="${XL.x(a.name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${a.n}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${IMG * EMU}" cy="${IMG * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="9525"><a:solidFill><a:srgbClr val="DCE2EE"/></a:solidFill></a:ln></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join('')}
</xdr:wsDr>`;

    const rels = list => XL.head + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    const title = 'Молҳо';
    const files = [
        { name: '[Content_Types].xml', data: XL.head + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${media.length ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>` },
        { name: '_rels/.rels', data: rels([['rId1', R + 'officeDocument', 'xl/workbook.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'], ['rId3', R + 'extended-properties', 'docProps/app.xml']]) },
        { name: 'docProps/core.xml', data: XL.head + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${XL.x((S.cfg.company_name || 'DELUS') + ': рӯйхати молҳо')}</dc:title><dc:creator>DELUS</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
        { name: 'docProps/app.xml', data: XL.head + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>DELUS</Application></Properties>' },
        { name: 'xl/workbook.xml', data: XL.head + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets><sheet name="${title}" sheetId="1" r:id="rId1"/></sheets>
<definedNames>${data.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${title}'!${area}</definedName>` : ''}<definedName name="_xlnm.Print_Titles" localSheetId="0">'${title}'!$${H}:$${H}</definedName></definedNames>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>` },
        { name: 'xl/_rels/workbook.xml.rels', data: rels([['rId1', R + 'worksheet', 'worksheets/sheet1.xml'], ['rId2', R + 'styles', 'styles.xml']]) },
        { name: 'xl/worksheets/sheet1.xml', data: sheet },
        { name: 'xl/styles.xml', data: st.xml() }
    ];
    if (media.length) {
        files.push({ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: rels([['rId1', R + 'drawing', '../drawings/drawing1.xml']]) });
        files.push({ name: 'xl/drawings/drawing1.xml', data: drawing });
        files.push({ name: 'xl/drawings/_rels/drawing1.xml.rels', data: rels(media.map((m, i) => [`rId${i + 1}`, R + 'image', `../media/image${i + 1}.${m.ext}`])) });
        media.forEach((m, i) => files.push({ name: `xl/media/image${i + 1}.${m.ext}`, data: m.bytes }));
    }
    return { blob: XL.zip(files), name: `DELUS-Molho-${today()}.xlsx`, count: prods.length, images: media.length };
};

/* Пеш аз ҳар боргирӣ маълумот ва аксҳо аз ҷадвал тоза гирифта мешаванд */
async function exportProductsXlsx() {
    await sync();
    for (let i = 0; i < 60 && imagesBusy; i++) await sleep(250);
    await loadImages();
    const out = XL.products();
    const url = URL.createObjectURL(out.blob);
    const a = document.createElement('a');
    a.href = url; a.download = out.name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return out;
}
