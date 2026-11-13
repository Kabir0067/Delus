/* DELUS — қарз (насия): кӣ чанд қарздор аст, пардохти қисман ва пурра */
'use strict';

const METHODS = { CASH: 'Нақд', CARD: 'Корт ё интиқол', RETURN: 'Бозгашти мол' };
const telHref = phone => 'tel:' + String(phone || '').replace(/[^\d+]/g, '');
const custDatalist = id => `<datalist id="${id}">${customers().map(c => `<option value="${esc(c.name)}">${esc(c.phone || '')}</option>`).join('')}</datalist>`;
const initial = s => (String(s || '?').trim()[0] || '?').toUpperCase();
const pctPaid = c => c.amount > 0 ? Math.min(100, Math.round(c.paid / c.amount * 100)) : 0;
const thisMonth = () => [today().slice(0, 8) + '01', today()];
const debtItems = d => d.receipt_code ? S.tx.filter(t => t.receipt_code === d.receipt_code && isSale(t)) : [];

/* ==================================================================
   САҲИФАИ «ҚАРЗ»
   ================================================================== */
PAGES.debt = {
    head: () => `<div class="toolbar">
        ${searchBox('Ном ё телефони мизоҷ')}
        <button class="btn primary" data-act="debtNew">${ic('plus', 16)}Қарзи нав</button>
        ${chips('dst', [['', 'Кушода'], ['late', 'Мӯҳлат гузашт'], ['closed', 'Пӯшида'], ['all', 'Ҳама']])}
    </div>`,

    body() {
        const all = customers();
        const st = S.f.dst || '';
        let list = all;
        if (st === '') list = list.filter(c => c.left > MONEY_EPS);
        if (st === 'late') list = list.filter(c => c.late);
        if (st === 'closed') list = list.filter(c => c.left <= MONEY_EPS);
        if (S.f.q) list = list.filter(c => hasAll(`${c.name} ${c.phone} ${String(c.phone).replace(/\D/g, '')}`, S.f.q));
        list.sort((a, b) => (b.late - a.late) || (b.left - a.left) || String(a.name).localeCompare(String(b.name), 'ru'));

        const open = all.filter(c => c.left > MONEY_EPS);
        const lateSum = all.filter(c => c.late).reduce((s, c) => s + c.debts.filter(d => d._late).reduce((t, d) => t + d._left, 0), 0);
        const [m0, m1] = thisMonth();
        const back = inRange(S.pays.filter(isCash), m0, m1).reduce((s, p) => s + num(p.amount), 0);
        const box = (icon, tone, label, value) => `<div><span class="tile ${tone}">${ic(icon, 18)}</span><span><small>${label}</small><b>${value}</b></span></div>`;
        const head = `<div class="sum-line">
            ${box('debt', 'tone-warn', 'Ҳамагӣ қарз', money(open.reduce((s, c) => s + c.left, 0)))}
            ${box('user', 'tone-buy', 'Қарздорон', `${fmt(open.length)} нафар`)}
            ${box('warn', 'tone-bad', 'Мӯҳлат гузашт', money(lateSum))}
            ${box('wallet', 'tone-sale', 'Баргашт дар ин моҳ', money(back))}
        </div>`;

        if (!all.length) return head + `<div class="empty">${ic('debt', 30)}<b>Ҳоло қарз нест</b>
            Вақте молро ба қарз мефурӯшед, дар тирезаи «Фурӯш» «Ба қарз (насия)»-ро интихоб кунед — қарздор худаш дар ин ҷо пайдо мешавад.
            <br><button class="btn primary" data-act="debtNew">${ic('plus', 16)}Қарзи кӯҳнаро сабт кардан</button></div>`;
        if (!list.length) return head + empty(
            st === 'late' ? 'Мӯҳлати ҳеҷ кас нагузаштааст' : st === 'closed' ? 'Ҳоло қарзи пӯшида нест' : S.f.q ? 'Чунин мизоҷ ёфт нашуд' : 'Ҳамаи қарзҳо пардохт шудаанд',
            S.f.q ? 'Ном ё телефонро дигар нависед.' : '');

        const shown = list.slice(0, S.limit);
        return head + `<div class="debtors">${shown.map(c => {
            const nDebts = c.debts.filter(d => !d._closed).length;
            return `<article class="debtor ${c.late ? 'late' : ''} ${c.left <= MONEY_EPS ? 'closed' : ''}">
                <button class="debtor-main" data-act="debtorView" data-id="${esc(c.key)}">
                    <span class="avatar-l">${esc(initial(c.name))}</span>
                    <span class="debtor-t"><b>${esc(c.name)}</b><small>${esc(c.phone || 'бе телефон')}${nDebts > 1 ? ` · ${nDebts} қарз` : ''}${c.last ? ` · охирин пардохт ${esc(dayLabel(c.last.slice(0, 10)))}` : ''}</small></span>
                    <span class="debtor-v"><b>${c.left > MONEY_EPS ? money(c.left) : 'Пӯшида'}</b><small>аз ${fmt(c.amount, 2)}</small></span>
                </button>
                <div class="debtor-bar" title="Супорид ${pctPaid(c)}%"><i style="width:${pctPaid(c)}%"></i></div>
                <div class="debtor-a">
                    ${c.late ? `<span class="pill bad">${ic('warn', 13)}Мӯҳлат гузашт</span>` : c.left <= MONEY_EPS ? `<span class="pill good">${ic('check', 13)}Пардохт шуд</span>` : `<span class="pill">Супорид ${pctPaid(c)}%</span>`}
                    <span class="debtor-btns">
                        ${c.phone ? `<a class="btn sm" href="${esc(telHref(c.phone))}" aria-label="Занг задан">${ic('phone', 14)}<span>Занг</span></a>` : ''}
                        <button class="btn sm t-buy" data-act="debtReceipt" data-id="${esc(c.key)}" aria-label="Чеки насия" title="Чеки насия: фиристодан ба муштарӣ ё боргирӣ">${ic('receipt', 14)}<span>Чек</span></button>
                        ${c.left > MONEY_EPS ? `<button class="btn sm t-sale" data-act="debtPay" data-id="${esc(c.key)}">${ic('wallet', 14)}Пардохт</button>` : ''}
                    </span>
                </div>
            </article>`;
        }).join('')}</div>${moreBtn(shown.length, list.length)}`;
    }
};

/* ==================================================================
   КОРТИ МИЗОҶ
   ================================================================== */
function debtorView(key) {
    const c = custBy(key);
    if (!c) return toast('Мизоҷ ёфт нашуд.', 'err');
    const pays = S.pays.filter(p => c.debts.some(d => String(d.id) === String(p.debt_id)))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || num(b.id) - num(a.id));
    const m = Modal.open({
        title: c.name, sub: c.phone || 'бе телефон', icon: 'user', tone: c.late ? 'tone-bad' : 'tone-warn',
        body: `<div class="facts">
                <div><small>Ҳаҷми харид</small><b>${fmt(c.amount, 2)}</b></div>
                <div><small>Пардохтшуда</small><b class="pos">${fmt(c.paid, 2)}</b></div>
                <div><small>Маблағи боқимонда</small><b class="${c.left > MONEY_EPS ? 'neg' : 'pos'}">${fmt(c.left, 2)}</b></div>
                <div><small>Ҳиссаи пардохт</small><b>${pctPaid(c)}%</b></div>
            </div>
            <div class="debtor-bar big"><i style="width:${pctPaid(c)}%"></i></div>
            <div class="quick">
                ${c.left > MONEY_EPS ? `<button class="btn t-sale" data-pay>${ic('wallet', 16)}Пардохт</button>
                <button class="btn t-buy" data-full>${ic('check', 16)}Пурра бастан</button>` : ''}
                <button class="btn t-move" data-receipt>${ic('receipt', 16)}Чеки насия</button>
                <button class="btn" data-new>${ic('plus', 16)}Қарзи нав</button>
                ${c.phone ? `<a class="btn" href="${esc(telHref(c.phone))}">${ic('phone', 16)}Занг</a>` : ''}
            </div>

            <p class="sec-t">Рӯйхати харидҳо</p>
            ${[...c.debts].reverse().map(d => {
                const items = debtItems(d);
                return `<div class="debt-row ${d._closed ? 'closed' : ''}">
                    <div class="debt-row-h">
                        <span><b>${money(d.amount)}</b><small>${esc(dayLabel(dayOf(d)))}${d.receipt_code ? ` · чеки № ${esc(d.receipt_code)}` : ' · хариди пешина'}${d.due_date ? ` · то ${esc(dotDate(String(d.due_date).slice(0, 10)))}` : ''}</small></span>
                        <span class="debt-row-v">${d._closed ? `<span class="pill good">Пӯшида</span>` : `${d._late ? '<span class="pill bad">Мӯҳлат гузашт</span>' : ''}<b>${money(d._left)}</b><small>боқимонда</small>`}</span>
                        <button type="button" class="icon-btn" data-rc="${esc(d.id)}" aria-label="Чеки ҳамин харид" title="Чеки ҳамин харид">${ic('receipt', 16)}</button>
                        <button type="button" class="icon-btn" data-edit="${esc(d.id)}" aria-label="Тағйири қарз" title="Тағйири қарз">${ic('edit', 16)}</button>
                    </div>
                    ${items.length ? `<div class="debt-items">${items.map(t => { const p = prodBy(t.product_id) || {}; return `<span>${esc(p.name || 'Мол')} — ${qty(t.quantity)} × ${fmt(t.unit_price, 2)}</span>`; }).join('')}</div>` : ''}
                    ${d.note ? `<div class="debt-items"><span>${esc(d.note)}</span></div>` : ''}
                </div>`;
            }).join('')}

            <p class="sec-t">Пардохтҳо</p>
            ${pays.length ? pays.map(p => `<div class="pay-row">
                <span class="tile sm ${p.method === 'RETURN' ? 'tone-bad' : 'tone-sale'}">${ic(p.method === 'RETURN' ? 'back' : 'wallet', 15)}</span>
                <span class="mini-b"><b>${money(p.amount)}</b><small>${esc(dayLabel(dayOf(p)))} · ${METHODS[String(p.method).toUpperCase()] || 'Нақд'}${p.note ? ' · ' + esc(p.note) : ''}</small></span>
                <button type="button" class="icon-btn" data-delpay="${esc(p.id)}" aria-label="Нест кардани пардохт" title="Нест кардани пардохт">${ic('trash', 15)}</button>
            </div>`).join('') : '<p class="muted">Ҳоло пардохт нашудааст.</p>'}`,
        foot: c.left > MONEY_EPS
            ? `<button class="btn sale-solid lg" data-pay>${ic('wallet', 17)}Пардохт қабул кардан</button>`
            : `<button class="btn primary lg" data-new>${ic('plus', 17)}Қарзи нав</button>`
    });
    const again = () => setTimeout(() => { if (custBy(key)) debtorView(key); }, 0);
    $$('[data-pay]', m.el).forEach(b => b.onclick = () => { m.close(); payForm(c, { onDone: again }); });
    $$('[data-full]', m.el).forEach(b => b.onclick = () => { m.close(); payForm(c, { full: true, onDone: again }); });
    $$('[data-new]', m.el).forEach(b => b.onclick = () => { m.close(); debtForm(null, c, again); });
    $$('[data-receipt]', m.el).forEach(b => b.onclick = () => debtReceipt(key));
    $$('[data-rc]', m.el).forEach(b => b.onclick = () => debtReceipt(key, { debt: b.dataset.rc }));
    $$('[data-edit]', m.el).forEach(b => b.onclick = () => { m.close(); debtForm(I.debt.get(b.dataset.edit), null, again); });
    $$('[data-delpay]', m.el).forEach(b => b.onclick = async () => {
        const p = S.pays.find(x => String(x.id) === b.dataset.delpay);
        const yes = await ask({ title: 'Нест кардани пардохт', text: `Пардохти ${money(p.amount)} аз ${dayLabel(dayOf(p))} нест мешавад ва қарз ҳамин қадар зиёд мегардад.`, ok: 'Нест кардан', danger: true });
        if (!yes) return;
        try { await deletePayment(p); toast('Пардохт нест карда шуд'); m.close(); again(); }
        catch (e) { showErr(e); }
    });
}

/* ==================================================================
   ЧЕКИ ҚАРЗ — акси PNG барои фиристодан (Telegram, WhatsApp, …) ё боргирӣ
   Чек ҳамеша равшан аст (мисли коғаз), новобаста ба мавзӯи барнома.
   ================================================================== */
const dateLong = d => { const [y, m, n] = String(d || '').slice(0, 10).split('-').map(Number); return m ? `${n}\u00a0${MONTHS[m - 1]}и\u00a0${y}` : ''; };
const daysTo = d => Math.round(strToSerial(String(d).slice(0, 10)) - strToSerial(today()));
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* Кадом харидҳо дар чек:
   - { debt: id } — танҳо ҳамон як харид бо пардохтҳояш (чеки алоҳида, масалан барои хариди пурра супоридашуда);
   - 'open'      — ҳамаи харидҳои ҳанӯз пардохтнашуда; агар ҳама супорида шуда бошанд — се хариди охирин;
   - 'all'       — ҳисоби умумӣ: ҳамаи харидҳои мизоҷ аз аввал то имрӯз. */
const receiptMode = (c, mode) => {
    const one = mode && typeof mode === 'object' ? c.debts.find(d => String(d.id) === String(mode.debt)) : null;
    if (one) return { kind: 'one', list: [one] };
    if (mode === 'all') return { kind: 'all', list: c.debts };
    const open = c.debts.filter(d => !d._closed);
    return { kind: 'open', list: open.length ? open : c.debts.slice(-3) };
};
function receiptData(c, mode = 'open') {
    const sel = receiptMode(c, mode);
    const debts = sel.list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const ids = new Set(debts.map(d => String(d.id)));
    const pays = S.pays.filter(p => ids.has(String(p.debt_id))).sort((a, b) => String(a.date).localeCompare(String(b.date)) || num(a.id) - num(b.id));
    const amount_ = debts.reduce((s, d) => s + num(d.amount), 0);
    const paid = debts.reduce((s, d) => s + d._paid, 0);
    const left = Math.max(0, Math.round((amount_ - paid) * 100) / 100);
    const dues = debts.filter(d => !d._closed && d.due_date).map(d => String(d.due_date).slice(0, 10)).sort();
    const closed = left <= MONEY_EPS;
    const late = !closed && debts.some(d => d._late);
    const maxId = pad5(Math.max(...debts.map(d => num(d.id))));
    return { c, debts, pays, amount: amount_, paid, left, due: dues[0] || '', closed, late, kind: sel.kind, no: (sel.kind === 'all' ? 'ҲУ-' : 'Қ-') + maxId };
}

async function receiptFonts() {
    if (!document.fonts || !document.fonts.load) return;
    const sample = 'Ҳҷӯӣқғ АБВабв ABCabc 0123,.';
    await Promise.race([Promise.all(['400', '500', '600', '700'].map(w => document.fonts.load(`${w} 32px Inter`, sample))), sleep(3000)]).catch(() => { });
}

/* Чекро мекашад. H = null: танҳо баландиро ҳисоб мекунад. */
function receiptPaint(g, R, H) {
    const W = 1080, M = 40, X = M + 64, XR = W - X, CW = XR - X;
    const C = { ink: '#0f1a33', ink2: '#47536b', ink3: '#7a8499', line: '#e3e7f0', soft: '#f4f6fb', navy1: '#0b1430', navy2: '#1b2c6b', gold: '#f7b733', gold2: '#f09819', green: '#0b8a63', greenBg: '#e3f6ee', red: '#c9342a', redBg: '#fdebe9', amber: '#b4690e', amberBg: '#fff4e0', brand: '#2f56e0', brandBg: '#ebf0ff' };
    const draw = H !== null;
    const F = (w, s) => `${w} ${s}px Inter, "Segoe UI", Roboto, Arial, sans-serif`;
    const T = (t, x, y, s, w = 400, col = C.ink, align = 'left') => { if (!draw) return; g.font = F(w, s); g.fillStyle = col; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(t, x, y); };
    const width = (t, s, w = 400) => { g.font = F(w, s); return g.measureText(t).width; };
    const fit = (t, max, s, w = 400) => { t = String(t); if (width(t, s, w) <= max) return t; while (t.length > 1 && width(t + '…', s, w) > max) t = t.slice(0, -1); return t + '…'; };
    const wrap = (t, max, s, w = 400) => {
        const out = []; let line = '';
        for (const word of String(t).split(/[ \t\n]+/)) { const next = line ? line + ' ' + word : word; if (line && width(next, s, w) > max) { out.push(line); line = word; } else line = next; }
        if (line) out.push(line); return out;
    };
    const box = (x, y, w, h, r, fill) => { if (!draw) return; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); g.fillStyle = fill; g.fill(); };
    const caps = (t, x, y, col = C.ink3, align = 'left', s = 21) => { if (!draw) return; if ('letterSpacing' in g) g.letterSpacing = '2.5px'; T(t, x, y, s, 700, col, align); if ('letterSpacing' in g) g.letterSpacing = '0px'; };
    const dash = y => { if (!draw) return; g.save(); g.strokeStyle = C.line; g.lineWidth = 2; g.setLineDash([10, 9]); g.beginPath(); g.moveTo(X, y); g.lineTo(XR, y); g.stroke(); g.restore(); };
    const pill = (t, xr, y, fg, bg) => { const w = width(t, 23, 700) + 66; box(xr - w, y - 34, w, 48, 24, bg); if (draw) { g.beginPath(); g.arc(xr - w + 26, y - 10, 6, 0, Math.PI * 2); g.fillStyle = fg; g.fill(); } T(t, xr - 22, y - 2, 23, 700, fg, 'right'); };
    const nf = n => fmt(n, 2), cur_ = cur();
    const sum = n => nf(n) + '\u00a0' + cur_;
    const st = R.closed ? { t: 'Пурра пардохт шуд', fg: C.green, bg: C.greenBg } : R.late ? { t: 'Мӯҳлат гузаштааст', fg: C.red, bg: C.redBg } : { t: 'Боқимонда дорад', fg: C.amber, bg: C.amberBg };

    /* ---- замина ва коғаз ---- */
    if (draw) {
        g.fillStyle = '#e8ecf4'; g.fillRect(0, 0, W, H);
        const bottom = H - M - 18;
        g.save();
        g.shadowColor = 'rgba(15,26,51,.16)'; g.shadowBlur = 50; g.shadowOffsetY = 18;
        g.beginPath();
        g.moveTo(M, M + 36); g.arcTo(M, M, M + 36, M, 36); g.lineTo(W - M - 36, M); g.arcTo(W - M, M, W - M, M + 36, 36);
        g.lineTo(W - M, bottom);
        const teeth = 30, tw_ = (W - 2 * M) / teeth;
        for (let i = 0; i < teeth; i++) { const x0 = W - M - i * tw_; g.lineTo(x0 - tw_ / 2, bottom + 18); g.lineTo(x0 - tw_, bottom); }
        g.closePath(); g.fillStyle = '#fff'; g.fill(); g.restore();
    }

    /* ---- сарлавҳа ---- */
    const HH = 236;
    if (draw) {
        g.save(); g.beginPath();
        if (g.roundRect) g.roundRect(M, M, W - 2 * M, HH, [36, 36, 0, 0]); else g.rect(M, M, W - 2 * M, HH);
        const gr = g.createLinearGradient(M, M, W - M, M + HH); gr.addColorStop(0, C.navy1); gr.addColorStop(1, C.navy2);
        g.fillStyle = gr; g.fill(); g.clip();
        const glow = g.createRadialGradient(W - M - 60, M + 10, 0, W - M - 60, M + 10, 360); glow.addColorStop(0, 'rgba(247,183,51,.28)'); glow.addColorStop(1, 'rgba(247,183,51,0)');
        g.fillStyle = glow; g.fillRect(M, M, W - 2 * M, HH);
        g.restore();
        // нишонаи бренд: квадрати тиллоӣ бо барқ
        const bx = X, by = M + 58, bs = 84;
        const bg_ = g.createLinearGradient(bx, by, bx + bs, by + bs); bg_.addColorStop(0, '#ffd45e'); bg_.addColorStop(1, C.gold2);
        box(bx, by, bs, bs, 24, bg_);
        g.save(); g.translate(bx + 14, by + 14); g.scale(56 / 24, 56 / 24); g.fillStyle = '#3a2300'; g.fill(new Path2D('M13.2 2 4 14h6.2L9.4 22 19 10h-6.4z')); g.restore();
    }
    T(fit(S.cfg.company_name || 'DELUS', 440, 44, 700), X + 108, M + 108, 44, 700, '#fff');
    const stamp = dateLong(today()) + ', ' + nowStr().slice(11, 16);
    T(fit('Мағозаи асбобҳои барқӣ ва таҷҳизот', XR - width(stamp, 24, 500) - 28 - (X + 108), 25, 500), X + 108, M + 148, 25, 500, 'rgba(255,255,255,.75)');
    caps(R.kind === 'all' ? 'ҲИСОБИ УМУМИИ НАСИЯ' : R.debts.length > 1 ? 'ҲИСОБИ НАСИЯ' : 'ЧЕКИ ХАРИДИ НАСИЯ', XR, M + 84, C.gold, 'right', 22);
    T('№ ' + R.no, XR, M + 128, 32, 700, '#fff', 'right');
    T(dateLong(today()) + ', ' + nowStr().slice(11, 16), XR, M + 166, 24, 500, 'rgba(255,255,255,.62)', 'right');
    let y = M + HH + 70;

    /* ---- мизоҷ ---- */
    caps('ХАРИДОР (МУШТАРӢ)', X, y);
    pill(st.t, XR, y + 6, st.fg, st.bg);
    y += 70;
    for (const l of wrap(R.c.name, CW, 50, 700).slice(0, 2)) { T(l, X, y, 50, 700); y += 60; }
    if (R.c.phone) { T('Тел.: ' + R.c.phone, X, y - 6, 29, 500, C.ink2); y += 44; }
    y += 18;

    /* ---- маблағи асосӣ ---- */
    const panelH = 248, py = y;
    box(X - 28, py, CW + 56, panelH, 30, R.closed ? C.greenBg : R.late ? C.redBg : C.brandBg);
    caps(R.closed ? 'ҲИСОБ ПУРРА СУПОРИДА ШУДААСТ' : 'МАБЛАҒИ БОҚИМОНДА БАРОИ ПАРДОХТ', X, py + 56, R.closed ? C.green : R.late ? C.red : C.brand);
    const big = nf(R.closed ? R.amount : R.left);
    T(big, X, py + 150, 92, 700, R.closed ? C.green : R.late ? C.red : C.ink);
    T(cur_, X + width(big, 92, 700) + 18, py + 150, 34, 600, C.ink2);
    const pct = R.amount > 0 ? Math.min(1, R.paid / R.amount) : 0;
    box(X, py + 180, CW, 14, 7, 'rgba(15,26,51,.08)');
    if (pct > 0) box(X, py + 180, Math.max(14, CW * pct), 14, 7, C.green);
    T(`Пардохтшуда: ${nf(R.paid)} аз ${nf(R.amount)} ${cur_}`, X, py + 228, 24, 500, C.ink2);
    T(Math.round(pct * 100) + '%', XR, py + 228, 24, 700, C.green, 'right');
    if (R.closed && draw) {   // мӯҳри «Пардохт шуд»
        g.save(); g.translate(XR - 100, py + 88); g.rotate(-0.22);
        g.strokeStyle = 'rgba(11,138,99,.75)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 76, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 65, 0, Math.PI * 2); g.stroke();
        T('ПАРДОХТ', 0, -2, 24, 700, 'rgba(11,138,99,.85)', 'center'); T('ШУД', 0, 28, 24, 700, 'rgba(11,138,99,.85)', 'center');
        g.restore();
    }
    y = py + panelH + 56;

    /* ---- ҷумлаи асосӣ: муроҷиати боэҳтиром ба харидор ---- */
    const first = R.debts[0], lastD = R.debts[R.debts.length - 1];
    let story = '';
    if (R.closed && R.debts.length === 1) {
        story = `Харидори муҳтарам ${R.c.name}! Хариди насияи шумо аз санаи ${dateLong(first.date)} ба маблағи ${sum(R.amount)} пурра пардохт шудааст. Аз ҳамкорӣ ва боварии шумо самимона сипосгузорем!`;
    } else if (R.closed) {
        story = `Харидори муҳтарам ${R.c.name}! Ҳамаи ҳисобҳои хариди насияи шумо ба маблағи умумии ${sum(R.amount)} пурра пардохт шудаанд. Аз ҳамкорӣ ва боварии шумо самимона сипосгузорем!`;
    } else if (R.debts.length === 1) {
        story = `Харидори гиромӣ ${R.c.name}, хариди насияи шумо аз санаи ${dateLong(first.date)} маблағи ${sum(first.amount)}-ро ташкил медиҳад.`;
        if (R.paid > MONEY_EPS) story += ` Аз ин маблағ ${sum(R.paid)} супорида шуда, маблағи боқимонда ${sum(R.left)} мебошад.`;
        if (R.due) story += ` Муҳлати баргардонидани маблағ: то ${dateLong(R.due)}.`;
    } else {
        story = `Харидори гиромӣ ${R.c.name}, ҳисоби умумии ${R.debts.length} хариди насияи шумо аз ${dateLong(first.date)} то ${dateLong(lastD.date)} ба маблағи ${sum(R.amount)} мебошад.`;
        if (R.paid > MONEY_EPS) story += ` То имрӯз ${sum(R.paid)} пардохт шуда, боқимонда ${sum(R.left)} мебошад.`;
        if (R.due) story += ` Муҳлати баргардонидани маблағ: то ${dateLong(R.due)}.`;
    }
    const sl = wrap(story, CW - 34, 30, 500);
    if (draw) box(X, y - 34, 6, sl.length * 46 + 8, 3, C.gold);
    for (const l of sl) { T(l, X + 30, y, 30, 500, C.ink2); y += 46; }
    y += 34;

    /* ---- тафсилоти харидҳо ---- */
    dash(y); y += 62;
    caps(R.debts.length > 1 ? `РӮЙХАТИ ХАРИДҲО (${R.debts.length})` : 'ТАФСИЛОТИ ХАРИДИ МОЛҲО', X, y); y += 56;
    for (const d of R.debts) {
        T('Харид аз санаи ' + dateLong(d.date), X, y, 31, 700);
        T(nf(d.amount), XR, y, 31, 700, C.ink, 'right');
        y += 42;
        const dd = d.due_date ? daysTo(d.due_date) : null;
        const meta = [d.receipt_code ? 'Чеки № ' + d.receipt_code : 'Хариди пешина', d.due_date ? 'Муҳлат: ' + dateLong(d.due_date) : ''].filter(Boolean).join(' · ');
        T(fit(meta, CW - 230, 24, 500), X, y, 24, 500, C.ink3);
        const tag = d._closed ? ['Пардохт шуд', C.green] : dd === null ? ['', C.ink3] : dd < 0 ? [`${-dd} рӯз гузашт`, C.red] : dd === 0 ? ['Имрӯз', C.amber] : [`${dd} рӯз монд`, dd <= 3 ? C.amber : C.green];
        if (tag[0]) T(tag[0], XR, y, 24, 700, tag[1], 'right');
        y += 40;
        const items = debtItems(d);
        for (const t of items.slice(0, 10)) {
            const p = prodBy(t.product_id) || {};
            const right = `${qty(t.quantity)} × ${nf(t.unit_price)} = ${nf(num(t.quantity) * num(t.unit_price))}`;
            const rw = width(right, 25, 500);
            T('•  ' + fit(p.name || 'Мол', CW - rw - 40, 25, 400), X + 4, y, 25, 400, C.ink2);
            T(right, XR, y, 25, 500, C.ink2, 'right');
            y += 38;
        }
        if (items.length > 10) { T(`… ва боз ${items.length - 10} номгӯи мол`, X + 4, y, 24, 500, C.ink3); y += 38; }
        if (d.note) for (const l of wrap('Эзоҳ: ' + d.note, CW, 24, 400).slice(0, 2)) { T(l, X, y, 24, 400, C.ink3); y += 36; }
        if (d._paid > MONEY_EPS && !d._closed) { T(`Пардохтшуда: ${nf(d._paid)} · Боқимонда: ${nf(d._left)} ${cur_}`, X, y, 24, 600, C.brand); y += 38; }
        y += 26;
        if (d !== lastD) { if (draw) { g.fillStyle = C.line; g.fillRect(X, y - 20, CW, 2); } y += 24; }
    }

    /* ---- пардохтҳо ---- */
    if (R.pays.length) {
        dash(y); y += 62;
        caps(`ТАЪРИХИ ПАРДОХТҲО (${R.pays.length})`, X, y); y += 54;
        const shown = R.pays.slice(-12);
        if (R.pays.length > 12) { T(`… пеш аз ин боз ${R.pays.length - 12} пардохт`, X, y, 24, 500, C.ink3); y += 38; }
        for (const p of shown) {
            const ret = String(p.method).toUpperCase() === 'RETURN';
            T(dateLong(p.date) + (timeOf(p) ? ', ' + timeOf(p) : ''), X, y, 26, 500, C.ink);
            T(METHODS[String(p.method).toUpperCase()] || METHODS.CASH, X + 470, y, 24, 500, C.ink3);
            T((ret ? '−' : '+') + nf(p.amount), XR, y, 27, 700, ret ? C.ink2 : C.green, 'right');
            y += 44;
        }
        y += 6;
    }

    /* ---- ҷамъ ---- */
    dash(y); y += 64;
    const row = (k, v, s, w, col) => { T(k, X, y, s, w === 700 ? 700 : 500, w === 700 ? C.ink : C.ink2); T(v, XR, y, s, w, col || C.ink, 'right'); y += s + 22; };
    row('Маблағи умумии харид', `${nf(R.amount)} ${cur_}`, 28, 600);
    row('Маблағи пардохтшуда', `${nf(R.paid)} ${cur_}`, 28, 600, C.green);
    if (draw) { g.fillStyle = C.ink; g.fillRect(X, y - 22, CW, 3); }
    y += 26;
    row('Маблағи боқимонда', `${nf(R.left)} ${cur_}`, 40, 700, R.closed ? C.green : R.late ? C.red : C.ink);
    y += 16;

    /* ---- огоҳӣ дар бораи мӯҳлат ---- */
    const dDue = R.due ? daysTo(R.due) : null;
    const notice = R.closed ? ['Ҳисоби ин харидҳо пурра пардохт шуд. Ташаккур барои боварӣ ва ҳамкории нек!', C.green, C.greenBg]
        : R.late ? [`Муҳлати муайяншудаи пардохт ба анҷом расид. Эҳтиромона хоҳиш мекунем, ки маблағи боқимондаро ба наздикӣ супоред.`, C.red, C.redBg]
            : R.due ? [`Эҳтиромона хоҳиш мекунем, ки маблағи боқимонда то санаи ${dateLong(R.due)} пардохт шавад${dDue > 0 ? ` (боз\u00a0${dDue}\u00a0рӯз\u00a0мондааст)` : dDue === 0 ? ' (имрӯз)' : ''}.`, C.amber, C.amberBg] : null;
    if (notice) {
        const nl = wrap(notice[0], CW - 60, 27, 600), nh = nl.length * 40 + 44;
        box(X - 28, y, CW + 56, nh, 24, notice[2]);
        let ny = y + 50;
        for (const l of nl) { T(l, X + 2, ny, 27, 600, notice[1]); ny += 40; }
        y += nh + 50;
    }

    /* ---- поён ---- */
    dash(y); y += 70;
    T('Ташаккур барои интихоб!', W / 2, y, 30, 700, C.ink, 'center'); y += 46;
    T(`${S.cfg.company_name || 'DELUS'} · ${dateLong(today())}, соати ${nowStr().slice(11, 16)}`, W / 2, y, 23, 500, C.ink3, 'center'); y += 36;
    T('Ҳисоботи расмии электронии дӯкон', W / 2, y, 21, 500, '#8d98af', 'center');
    y += 60;
    return y + M + 18;
}

async function receiptBlob(c, mode = 'open') {
    await receiptFonts();
    const R = receiptData(c, mode);
    const probe = document.createElement('canvas').getContext('2d');
    const H = Math.min(9000, Math.ceil(receiptPaint(probe, R, null)));
    const cv = document.createElement('canvas');
    cv.width = 1080; cv.height = H;
    receiptPaint(cv.getContext('2d'), R, H);
    const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(known('Чек сохта нашуд. Боз кӯшиш кунед.')), 'image/png'));
    return { blob, R };
}

function debtReceipt(key, mode = 'open') {
    const c = custBy(key);
    if (!c) return toast('Мизоҷ ёфт нашуд.', 'err');
    const single = mode && typeof mode === 'object';
    const d1 = single ? c.debts.find(d => String(d.id) === String(mode.debt)) : null;
    if (single && !d1) return toast('Ин харид ёфт нашуд.', 'err');
    const hasOpen = c.debts.some(d => !d._closed);
    const seg = !single && c.debts.length > 1 ? `<div class="seg rcpt-seg" role="radiogroup" aria-label="Навъи чек">
            <button type="button" class="${mode === 'all' ? '' : 'on'}" data-mode="open" role="radio" aria-checked="${mode !== 'all'}">${hasOpen ? 'Боқимонда' : 'Харидҳои охирин'}</button>
            <button type="button" class="${mode === 'all' ? 'on' : ''}" data-mode="all" role="radio" aria-checked="${mode === 'all'}">Ҳамаи харидҳо (${c.debts.length})</button>
        </div>` : '';
    const m = Modal.open({
        title: single ? 'Чеки харид' : 'Чеки насия (қарз)',
        sub: single ? `${c.name} · ${dateLong(d1.date)}` : c.name, icon: 'receipt', tone: 'tone-buy',
        body: `${seg}<div class="rcpt-prev" data-prev><div class="rcpt-wait"><span class="lb-spin"></span>Чек омода мешавад…</div></div>
            <p class="rcpt-hint">${isIOS() ? 'Барои захира дар Галерея: «Фиристодан» → «Сохранить изображение».' : 'Шумо метавонед ин чекро мустақиман тавассути Telegram ё WhatsApp ба мизоҷ фиристед.'}</p>`,
        foot: `<button type="button" class="btn lg" data-dl disabled>${ic('download', 17)}Боргирӣ</button>
            <button type="button" class="btn primary lg" data-share disabled>${ic('share', 17)}Фиристодан<span class="wide-only">&nbsp;ба мизоҷ</span></button>`
    });
    let file = null, url = '', name = '', cur = mode, turn = 0;
    const download = (quiet = false) => {
        const a = document.createElement('a');
        a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
        if (!quiet) toast('Чек бо муваффақият боргирӣ шуд');
    };
    $('[data-dl]', m.el).onclick = () => download();
    /* share бояд фавран дар ҳамон пахши тугма даъват шавад (iPhone дигар иҷозат намедиҳад), бинобар ин акс пешакӣ тайёр аст */
    $('[data-share]', m.el).onclick = () => {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: `Чеки насия — ${c.name}` }).catch(e => {
                if (e && e.name === 'AbortError') return;
                download();
            });
        } else {
            download(true);
            toast('Дар ин дастгоҳ фиристодан дастрас нест — чек ҳамчун акс боргирӣ шуд.');
        }
    };
    const prevOnClose = m.onClose;
    m.onClose = () => { if (url) setTimeout(() => URL.revokeObjectURL(url), 60000); if (prevOnClose) prevOnClose(); };
    /* чекро месозад; агар корбар дар ин миён навъи дигарро интихоб кунад, натиҷаи кӯҳна партофта мешавад */
    const build = md => {
        const my = ++turn;
        $$('[data-dl], [data-share]', m.el).forEach(b => { b.disabled = true; });
        $('[data-prev]', m.el).innerHTML = '<div class="rcpt-wait"><span class="lb-spin"></span>Чек омода мешавад…</div>';
        receiptBlob(c, md).then(({ blob, R }) => {
            if (!m.el.isConnected || my !== turn) return;
            if (url) URL.revokeObjectURL(url);
            name = `DELUS-${R.kind === 'all' ? 'hisob' : 'qarz'}-${R.no.replace(/\D/g, '')}-${today()}.png`;
            file = new File([blob], name, { type: 'image/png' });
            url = URL.createObjectURL(blob);
            $('[data-prev]', m.el).innerHTML = `<img src="${url}" alt="Чеки насия — ${esc(c.name)}">`;
            $$('[data-dl], [data-share]', m.el).forEach(b => { b.disabled = false; });
        }).catch(e => {
            if (my !== turn) return;
            $('[data-prev]', m.el).innerHTML = `<div class="rcpt-wait">${esc(errText(e))}</div>`;
            if (!e.known) console.error(e);
        });
    };
    const sg = $('.rcpt-seg', m.el);
    if (sg) sg.addEventListener('click', e => {
        const b = e.target.closest('[data-mode]');
        if (!b || b.dataset.mode === cur) return;
        cur = b.dataset.mode;
        $$('[data-mode]', sg).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
        build(cur);
    });
    build(cur);
    return m;
}

/* ==================================================================
   ПАРДОХТ: ҚИСМАН Ё ПУРРА
   ================================================================== */
function payForm(c, { full = false, onDone } = {}) {
    if (!c) return toast('Мизоҷ ёфт нашуд.', 'err');
    const left = c.left;
    const m = formModal({
        title: full ? 'Пурра бастани қарз' : 'Пардохти қарз', sub: `${c.name} · боқимонда ${money(left)}`,
        icon: 'wallet', tone: 'tone-sale', submit: full ? 'Қарзро бастан' : 'Сабт кардан', submitClass: 'sale-solid', size: 'sm',
        body: `${field(`Маблағ (${esc(cur())})`, `<input type="text" inputmode="decimal" name="amount" value="${full ? esc(left) : ''}" data-auto autocomplete="off" placeholder="Чанд овард?">`)}
            <div class="qchips" data-chips>
                <button type="button" class="qchip" data-v="${left}">Ҳама — ${fmt(left, 2)}</button>
                ${left >= 2 ? `<button type="button" class="qchip" data-v="${Math.round(left / 2 * 100) / 100}">Нисф — ${fmt(left / 2, 2)}</button>` : ''}
            </div>
            <p class="pay-after" data-after></p>
            <div class="grid2">
                ${field('Сана', `<input type="date" name="date" value="${today()}" max="${today()}">`)}
                ${field('Чӣ тавр', `<select name="method">${options([['CASH', METHODS.CASH], ['CARD', METHODS.CARD]], 'CASH')}</select>`)}
            </div>
            ${field('Эзоҳ <em>(ихтиёрӣ)</em>', '<input type="text" name="note" maxlength="120">')}`,
        async onSubmit(d) {
            const amount_ = Math.round(num(d.amount) * 100) / 100;
            if (amount_ <= 0) throw bad('Маблағро нависед.');
            if (amount_ - left > MONEY_EPS) throw bad(`Қарзи боқимонда ҳамагӣ ${money(left)} аст.`);
            if (d.date > today()) throw bad('Санаи оянда интихоб шудааст.');
            await payCustomer(custBy(c.key), amount_, { method: d.method, note: String(d.note || '').trim(), date: d.date + nowStr().slice(10) });
            const rest = custBy(c.key).left;
            toast(rest <= MONEY_EPS ? `Қарзи ${c.name} пурра баста шуд` : `Пардохт қабул шуд: ${money(amount_)}. Боқимонда: ${money(rest)}`);
            if (onDone) onDone();
        }
    });
    const inp = $('[name=amount]', m.el), after = $('[data-after]', m.el);
    const draw = () => {
        const v = num(inp.value), rest = Math.round((left - v) * 100) / 100;
        after.className = 'pay-after ' + (v <= 0 ? '' : rest < -MONEY_EPS ? 'bad' : rest <= MONEY_EPS ? 'good' : '');
        after.textContent = v <= 0 ? '' : rest < -MONEY_EPS ? `Зиёд аст: қарз ҳамагӣ ${money(left)}` : rest <= MONEY_EPS ? 'Қарз пурра баста мешавад' : `Пас аз пардохт боқӣ мемонад: ${money(rest)}`;
    };
    inp.addEventListener('input', draw);
    $('[data-chips]', m.el).addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { inp.value = b.dataset.v; draw(); } });
    draw();
}

/* ==================================================================
   ҚАРЗИ НАВ Ё ТАҒЙИРИ ҚАРЗ
   ================================================================== */
function debtForm(d = null, preset = null, onDone) {
    const v = d || { customer: preset ? preset.name : '', phone: preset ? preset.phone : '', amount: '', date: today(), due_date: '', note: '' };
    const paid = d ? d._paid : 0;
    const m = formModal({
        title: d ? 'Тағйири қарз' : 'Қарзи нав', sub: d ? (d.receipt_code ? `Чек ${d.receipt_code}` : 'Қарзи дастӣ') : 'Масалан, қарзи кӯҳна, ки пеш аз барнома буд',
        icon: 'debt', tone: 'tone-warn',
        body: `<div class="grid2">
                ${field('Номи мизоҷ', `<input type="text" name="customer" value="${esc(v.customer)}" list="debtFormCust" maxlength="80" data-auto autocomplete="off">`)}
                ${field('Телефон', `<input type="tel" name="phone" value="${esc(v.phone)}" inputmode="tel" maxlength="20" autocomplete="off" placeholder="+992 …">`)}
            </div>${custDatalist('debtFormCust')}
            <div class="grid2">
                ${field(`Маблағи қарз (${esc(cur())})`, `<input type="text" inputmode="decimal" name="amount" value="${esc(v.amount)}" autocomplete="off">`, paid ? `Аллакай супорид: ${money(paid)}` : '')}
                ${field('Сана', `<input type="date" name="date" value="${esc(String(v.date).slice(0, 10))}" max="${today()}">`)}
            </div>
            ${field('То кай медиҳад <em>(ихтиёрӣ)</em>', `<input type="date" name="due_date" value="${esc(String(v.due_date || '').slice(0, 10))}">`)}
            ${field('Эзоҳ <em>(ихтиёрӣ)</em>', `<input type="text" name="note" value="${esc(v.note)}" maxlength="200" placeholder="Масалан: барои таъмири хона">`)}
            ${d ? `<div class="danger-z"><button type="button" class="btn danger" data-del>${ic('trash', 16)}Нест кардани қарз</button></div>` : ''}`,
        async onSubmit(f) {
            const customer = String(f.customer || '').trim(), amount_ = Math.round(num(f.amount) * 100) / 100;
            if (!customer) throw bad('Номи мизоҷро нависед.');
            if (amount_ <= 0) throw bad('Маблағи қарзро нависед.');
            if (amount_ + MONEY_EPS < paid) throw bad(`Мизоҷ аллакай ${money(paid)} супоридааст — қарз аз ин кам буда наметавонад.`);
            if (f.date > today()) throw bad('Санаи оянда интихоб шудааст.');
            if (f.due_date && f.due_date < f.date) throw bad('Рӯзи пардохт аз рӯзи қарз пеш буда наметавонад.');
            const rec = { customer, phone: String(f.phone || '').trim(), amount: amount_, due_date: f.due_date || '', note: String(f.note || '').trim() };
            if (d) {
                rec.date = f.date + String(d.date).slice(10);
                await updateDebt(d, rec);
                toast('Қарз тағйир ёфт');
            } else {
                rec.date = f.date + nowStr().slice(10);
                const nd = await addDebt(rec);
                toast(`Қарз сабт шуд: ${nd.customer} — ${money(nd.amount)}`);
            }
            if (onDone) onDone();
        }
    });
    const nameEl = $('[name=customer]', m.el), phoneEl = $('[name=phone]', m.el);
    nameEl.addEventListener('input', () => {
        const c = customers().find(x => norm(x.name) === norm(nameEl.value));
        if (c && c.phone && !phoneEl.value) phoneEl.value = c.phone;
    });
    const del = $('[data-del]', m.el);
    if (del) del.onclick = async () => {
        const n = S.pays.filter(p => String(p.debt_id) === String(d.id)).length;
        const yes = await ask({ title: 'Нест кардани қарз', text: `Қарзи ${money(d.amount)}${n ? ` ва ${n} пардохти он` : ''} аз ҷадвал нест мешавад. Мол ва фурӯш тағйир намеёбанд.`, ok: 'Нест кардан', danger: true });
        if (!yes) return;
        try { await deleteDebt(d); toast('Қарз нест карда шуд'); m.close(); if (onDone) onDone(); }
        catch (e) { m.fail(errText(e)); }
    };
}

/* ==================================================================
   ҲИСОБОТ: ҚАРЗ
   ================================================================== */
REP.debt = function (r, pv) {
    if (!r.debtsOk) return `<div class="note warn">${ic('warn', 16)}<span>Қарз ба мизоҷ вобаста аст, на ба анбор, гурӯҳ ё мол. Барои дидани қарз филтрҳоро тоза кунед.</span></div>
        <button class="btn" style="margin-top:12px" data-act="repClear">${ic('x', 15)}Тоза кардани филтрҳо</button>`;
    const givenSum = r.given.reduce((s, d) => s + num(d.amount), 0);
    const open = customers().filter(c => c.left > MONEY_EPS);
    const openSum = open.reduce((s, c) => s + c.left, 0);
    const late = S.debts.filter(d => d._late);
    const lateSum = late.reduce((s, d) => s + d._left, 0);
    const pvGiven = pv && pv.debtsOk ? pv.given.reduce((s, d) => s + num(d.amount), 0) : null;
    const pvBack = pv && pv.debtsOk ? pv.repaidSum : null;
    const rows = customers().filter(c => c.left > MONEY_EPS || c.debts.some(d => r.given.includes(d)))
        .sort((a, b) => b.left - a.left)
        .map(c => ({
            id: c.key, c: [c.name, c.phone || '—', fmt(c.amount, 2), fmt(c.paid, 2), fmt(c.left, 2),
                (c.debts.filter(d => !d._closed && d.due_date).map(d => String(d.due_date).slice(0, 10)).sort()[0] || '—') + (c.late ? ' (гузашт)' : '')]
        }));
    return `${heroBlock('Қарз баргашт', amount(r.repaidSum) + delta(r.repaidSum, pvBack), [`Дода шуд: ${fmt(givenSum, 2)}`, `Ҳоло қарз: ${fmt(openSum, 2)}`], r, S.pays.filter(isCash), p => num(p.amount))}
        <div class="kpis">
            ${kpi('Ҳоло қарз', 'debt', 'tone-warn', amount(openSum), `${fmt(open.length)} нафар`, 'data-act="go" data-page="debt"')}
            ${kpi('Дар ин давра дода шуд', 'sale', 'tone-buy', amount(givenSum), `${fmt(r.given.length)} қарз${delta(givenSum, pvGiven, false)}`)}
            ${kpi('Дар ин давра баргашт', 'wallet', 'tone-sale', amount(r.repaidSum), `${fmt(r.repaid.length)} пардохт`)}
            ${kpi('Мӯҳлат гузашт', 'warn', late.length ? 'tone-bad' : 'tone-sale', amount(lateSum), late.length ? `${fmt(new Set(late.map(d => d._key)).size)} нафар` : 'Ҳама сари вақт')}
        </div>
        <div class="stack" style="margin-top:14px">${rcard('user', 'tone-warn', 'Қарздорон', rtable('Қарздорон', ['Мизоҷ', 'Телефон', 'Қарз', 'Супорид', 'Боқимонда', 'Мӯҳлат'], rows, 'debtorView'))}</div>`;
};
