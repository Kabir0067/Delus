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

/* Услубҳо: рақами ҳар услуб дар S_ (cellXfs). Ранги бренд: кабуди торик ва тиллоӣ. */
const S_ = { title: 1, sub: 2, head: 3, text: 4, center: 5, qty: 6, money: 7, name: 8, qWarn: 9, qBad: 10, stOk: 11, stWarn: 12, stBad: 13, stArch: 14, totL: 15, totQ: 16, totM: 17, kpiL: 18, kpiM: 19, kpiN: 20, muted: 21, bar: 22, note: 23, totalQ: 24 };
XL.styles = () => XL.head + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="12">
<font><sz val="10"/><color rgb="FF0F1A33"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="18"/><color rgb="FF0B1430"/><name val="Arial"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF6B768C"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF0F1A33"/><name val="Arial"/><family val="2"/></font>
<font><sz val="9"/><color rgb="FF6B768C"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FF0B1430"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF0B8A63"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFB4690E"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFC9342A"/><name val="Arial"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF9AA3B8"/><name val="Arial"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="FF6B768C"/><name val="Arial"/><family val="2"/></font>
</fonts>
<fills count="8">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0B1430"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF4D6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF4E0"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDEBE9"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4F6FB"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF7B733"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD3D9E6"/></left><right style="thin"><color rgb="FFD3D9E6"/></right><top style="thin"><color rgb="FFD3D9E6"/></top><bottom style="thin"><color rgb="FFD3D9E6"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="FFD3D9E6"/></left><right style="thin"><color rgb="FFD3D9E6"/></right><top style="medium"><color rgb="FF0B1430"/></top><bottom style="medium"><color rgb="FF0B1430"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="25">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="8" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="9" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="8" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="9" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="10" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="4" fontId="4" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="bottom" indent="1"/></xf>
<xf numFmtId="4" fontId="6" fillId="6" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="3" fontId="6" fillId="6" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="10" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="7" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="0" fontId="11" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

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

const XL_STATUS = { ok: ['Ҳаст', S_.stOk], low: ['Кам мондааст', S_.stWarn], out: ['Тамом шуд', S_.stBad], neg: ['Камомад', S_.stBad] };

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

    /* ҳисоби ҳар мол: ҳамин рақамҳо ҳамчун қимати тайёр дар файл меистанд, формулаҳо онҳоро тасдиқ мекунанд */
    const data = prods.map(p => {
        const per = locs.map(l => XL.r3(qtyAt(p.id, l.id)));
        const total = XL.r3(per.reduce((s, q) => s + q, 0));
        const buy = num(p.purchase_price), sell = num(p.sale_price), have = Math.max(total, 0);
        return { p, per, total, buy, sell, vBuy: XL.r2(have * buy), vSell: XL.r2(have * sell), on: isActive(p), st: stockState(p) };
    });
    const sum = k => XL.r2(data.reduce((s, d) => s + d[k], 0));
    const lowCount = data.filter(d => d.on && d.st !== 'ok').length;

    /* 1–3: сарлавҳа ва хати тиллоӣ */
    row(1, 34, [XL.str(0, 1, `${S.cfg.company_name || 'DELUS'} — рӯйхати пурраи молҳо`, S_.title), ...fill(1, 1, last, S_.title)]);
    span(1, 0, last);
    row(2, 18, [XL.str(0, 2, `Ҳолат ба ${dateLong(today())}, соати ${nowStr().slice(11, 16)} · маълумот ҳамин лаҳза аз ҷадвал гирифта шуд · ${fmt(prods.length)} мол, ${fmt(L)} анбор`, S_.sub), ...fill(2, 1, last, S_.sub)]);
    span(2, 0, last);
    row(3, 5, fill(3, 0, last, S_.bar));

    /* 4–5: хулоса */
    const rest = last - 3, g = Math.max(1, Math.floor(rest / 4));
    const kp = [[0, 2], [3, 3], [4, 3 + g], [4 + g, 3 + 2 * g], [4 + 2 * g, 3 + 3 * g], [4 + 3 * g, last]].filter(([a, b]) => a <= b);
    const rng = c => `${col(c)}${first}:${col(c)}${end}`;
    const kpis = [
        ['ШУМОРАИ МОЛ', XL.fx(kp[0][0], 5, `COUNTA(${rng(C.name)})`, prods.length, S_.kpiN)],
        ['ҲАМАГӢ ДАР АНБОРҲО (ВОҲИД)', XL.fx(kp[1][0], 5, `SUM(${rng(C.total)})`, XL.r3(data.reduce((s, d) => s + d.total, 0)), S_.kpiN)],
        ['АРЗИШ БО НАРХИ ХАРИД', XL.fx(kp[2][0], 5, `SUM(${rng(C.vBuy)})`, sum('vBuy'), S_.kpiM)],
        ['АРЗИШ БО НАРХИ ФУРӮШ', XL.fx(kp[3][0], 5, `SUM(${rng(C.vSell)})`, sum('vSell'), S_.kpiM)],
        ['ФОИДАИ ИНТИЗОРӢ', XL.fx(kp[4][0], 5, `SUM(${rng(C.profit)})`, XL.r2(sum('vSell') - sum('vBuy')), S_.kpiM)],
        ['КАМ МОНДААСТ Ё ТАМОМ', XL.num(kp[5][0], 5, lowCount, S_.kpiN)]
    ].slice(0, kp.length);
    const r4 = [], r5 = [];
    kpis.forEach(([label, cell], i) => {
        const [a, b] = kp[i];
        r4.push(XL.str(a, 4, label, S_.kpiL), ...fill(4, a + 1, b, S_.kpiL));
        r5.push(cell, ...fill(5, a + 1, b, S_.kpiN));
        if (b > a) { span(4, a, b); span(5, a, b); }
    });
    row(4, 20, r4);
    row(5, 28, r5);
    row(6, 8, []);

    /* 7: сарлавҳаи ҷадвал */
    const heads = ['№', 'ID', 'Акс', 'Номи мол', 'Рамз', 'Гурӯҳ', 'Воҳид', ...locs.map(l => l.name), 'Ҳамагӣ', 'Нархи харид', 'Нархи фурӯш', 'Арзиш (нархи харид)', 'Арзиш (нархи фурӯш)', 'Фоидаи интизорӣ', 'Ҳолат'];
    row(H, 34, heads.map((t, c) => XL.str(c, H, t, S_.head)));

    /* маълумот: ҳар мол як сатр */
    const hasImg = data.some(d => XL.image(imgSrc(d.p)));
    const ht = hasImg ? 48 : 22;
    data.forEach((d, i) => {
        const r = first + i, p = d.p, cells = [];
        cells.push(XL.num(C.n, r, i + 1, S_.center), XL.num(C.id, r, num(p.id) || 0, S_.center));
        const im = XL.image(imgSrc(p));
        if (im) {
            media.push(im);
            anchors.push({ r, n: media.length, name: p.name });
            cells.push(XL.blank(C.img, r, S_.center));
        } else cells.push(XL.str(C.img, r, '—', S_.muted));
        cells.push(XL.str(C.name, r, p.name, S_.name), XL.str(C.code, r, p.product_code || '', S_.center),
            XL.str(C.cat, r, p.category || '', S_.text), XL.str(C.unit, r, unitOf(p), S_.center));
        d.per.forEach((q, j) => cells.push(XL.num(C.loc0 + j, r, q, q < 0 ? S_.qBad : S_.qty)));
        const tf = L ? `SUM(${col(C.loc0)}${r}:${col(C.loc0 + L - 1)}${r})` : '0';
        const tStyle = !d.on ? S_.totalQ : d.st === 'ok' ? S_.totalQ : d.st === 'low' ? S_.qWarn : S_.qBad;
        cells.push(XL.fx(C.total, r, tf, d.total, tStyle));
        cells.push(XL.num(C.buy, r, d.buy, S_.money), XL.num(C.sell, r, d.sell, S_.money));
        cells.push(XL.fx(C.vBuy, r, `MAX(${col(C.total)}${r},0)*${col(C.buy)}${r}`, d.vBuy, S_.money));
        cells.push(XL.fx(C.vSell, r, `MAX(${col(C.total)}${r},0)*${col(C.sell)}${r}`, d.vSell, S_.money));
        cells.push(XL.fx(C.profit, r, `${col(C.vSell)}${r}-${col(C.vBuy)}${r}`, XL.r2(d.vSell - d.vBuy), S_.money));
        const [stText, stStyle] = d.on ? XL_STATUS[d.st] : ['Бойгонӣ', S_.stArch];
        cells.push(XL.str(C.status, r, stText, stStyle));
        row(r, ht, cells);
    });
    if (!data.length) row(first, 22, [XL.str(0, first, 'Ҳоло мол нест', S_.muted), ...fill(first, 1, last, S_.muted)]);

    /* ҷамъ */
    const tc = [XL.str(0, tot, 'ҲАМАГӢ', S_.totL), ...fill(tot, 1, C.unit, S_.totL)];
    span(tot, 0, C.unit);
    locs.forEach((l, j) => tc.push(XL.fx(C.loc0 + j, tot, `SUM(${rng(C.loc0 + j)})`, XL.r3(data.reduce((s, d) => s + d.per[j], 0)), S_.totQ)));
    tc.push(XL.fx(C.total, tot, `SUM(${rng(C.total)})`, XL.r3(data.reduce((s, d) => s + d.total, 0)), S_.totQ));
    tc.push(XL.blank(C.buy, tot, S_.totL), XL.blank(C.sell, tot, S_.totL));
    tc.push(XL.fx(C.vBuy, tot, `SUM(${rng(C.vBuy)})`, sum('vBuy'), S_.totM));
    tc.push(XL.fx(C.vSell, tot, `SUM(${rng(C.vSell)})`, sum('vSell'), S_.totM));
    tc.push(XL.fx(C.profit, tot, `SUM(${rng(C.profit)})`, XL.r2(sum('vSell') - sum('vBuy')), S_.totM));
    tc.push(XL.blank(C.status, tot, S_.totL));
    row(tot, 26, tc);
    row(tot + 2, 16, [XL.str(0, tot + 2, 'Арзиш бо бақияи мусбат ҳисоб мешавад. Ҳамагӣ ва арзиш бо формула ҳисоб мешаванд: агар рақамро иваз кунед, ҷамъ худаш нав мешавад. Файл аз барномаи DELUS.', S_.note)]);

    /* бари сутунҳо (ба аломат) */
    const widths = [5, 7, 11, 34, 13, 15, 8, ...locs.map(() => 12), 11, 12, 12, 15, 15, 14, 14];
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
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
${media.length ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;

    /* аксҳо: дар мобайни ҳуҷраи «Акс», 56×56 пиксел */
    const EMU = 9525, size = 56, cellW = 11 * 7 + 5;
    const drawing = XL.head + `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.map(a => `
<xdr:oneCellAnchor><xdr:from><xdr:col>${C.img}</xdr:col><xdr:colOff>${Math.round((cellW - size) / 2) * EMU}</xdr:colOff><xdr:row>${a.r - 1}</xdr:row><xdr:rowOff>${4 * EMU}</xdr:rowOff></xdr:from><xdr:ext cx="${size * EMU}" cy="${size * EMU}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${a.n + 1}" name="Акс ${a.n}" descr="${XL.x(a.name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${a.n}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${size * EMU}" cy="${size * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join('')}
</xdr:wsDr>`;

    const rels = (list) => XL.head + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;
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
        { name: 'docProps/core.xml', data: XL.head + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${XL.x((S.cfg.company_name || 'DELUS') + ' — рӯйхати молҳо')}</dc:title><dc:creator>DELUS</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
        { name: 'docProps/app.xml', data: XL.head + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>DELUS</Application></Properties>' },
        { name: 'xl/workbook.xml', data: XL.head + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets><sheet name="${title}" sheetId="1" r:id="rId1"/></sheets>
<definedNames>${data.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${title}'!${area}</definedName>` : ''}<definedName name="_xlnm.Print_Titles" localSheetId="0">'${title}'!$${H}:$${H}</definedName></definedNames>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>` },
        { name: 'xl/_rels/workbook.xml.rels', data: rels([['rId1', R + 'worksheet', 'worksheets/sheet1.xml'], ['rId2', R + 'styles', 'styles.xml']]) },
        { name: 'xl/styles.xml', data: XL.styles() },
        { name: 'xl/worksheets/sheet1.xml', data: sheet }
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
