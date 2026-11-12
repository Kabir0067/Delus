/* DELUS — амалиётҳо, тугмаҳо ва оғози барнома */
'use strict';

/* ==================================================================
   ҶУСТУҶӮИ МОЛ ДАР ТИРЕЗАҲО
   ================================================================== */
function matchProducts(q) {
    const n = norm(q);
    if (!n) return [];
    return activeProds()
        .filter(p => hasAll(`${p.name} ${p.product_code} ${p.category} ${p.description}`, q))
        .sort((a, b) => (norm(a.name).startsWith(n) ? 0 : 1) - (norm(b.name).startsWith(n) ? 0 : 1) || String(a.name).localeCompare(String(b.name), 'ru'))
        .slice(0, 8);
}

/* Молҳои бештар истифодашуда барои интихоб бо як ламс */
function quickProducts() {
    const n = new Map();
    S.tx.forEach(x => { const k = String(x.product_id); n.set(k, (n.get(k) || 0) + 1); });
    return [...activeProds()].sort((a, b) => (n.get(String(b.id)) || 0) - (n.get(String(a.id)) || 0)).slice(0, 10);
}

/* quickWhen: аксҳои пешниҳод танҳо вақте намоёнанд, ки ин функсия true диҳад (масалан, ҳанӯз мол интихоб нашудааст) */
function mountPicker(root, { onPick, onNew, stockAt, quick = false, quickWhen = () => true }) {
    root.innerHTML = `<div class="pick"><div class="search">${ic('search', 17)}
        <input type="search" data-auto placeholder="Ном ё рамзи молро нависед" autocomplete="off" enterkeyhint="search" aria-label="Ҷустуҷӯи мол"></div>
        <div class="pick-list" hidden></div>
        ${quick ? `<div class="pick-q">${quickProducts().map(p => `<button type="button" class="pq" data-q="${esc(p.id)}">${thumb(p)}<span>${esc(p.name)}</span></button>`).join('')}</div>` : ''}</div>`;
    const inp = $('input', root), list = $('.pick-list', root), pq = $('.pick-q', root);
    if (pq) pq.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) onPick(prodBy(b.dataset.q)); });
    let items = [], hot = 0;
    root.refreshQuick = () => { if (pq) pq.hidden = !!inp.value.trim() || !quickWhen(); };

    function draw() {
        const q = inp.value.trim();
        if (pq) pq.hidden = !!q || !quickWhen();
        if (!q) { list.hidden = true; list.innerHTML = ''; items = []; return; }
        const found = matchProducts(q);
        items = found.map(p => ({ p }));
        const exact = found.some(p => norm(p.name) === norm(q));
        if (onNew && !exact) items.push({ isNew: true });
        hot = Math.min(hot, Math.max(items.length - 1, 0));
        list.innerHTML = items.map((it, i) => it.isNew
            ? `<button type="button" class="pick-i ${i === hot ? 'hot' : ''}" data-i="${i}"><span class="thumb sm">${ic('plus', 16)}</span><span class="mini-b"><b>Моли нав: «${esc(q)}»</b><small>Дар рӯйхат илова мешавад</small></span></button>`
            : (() => {
                const p = it.p, have = stockAt ? qtyAt(p.id, stockAt()) : qtyAll(p.id);
                return `<button type="button" class="pick-i ${i === hot ? 'hot' : ''}" data-i="${i}">${thumb(p, 'sm')}
                    <span class="mini-b"><b>${esc(p.name)}</b><small>${esc(p.product_code || '')}</small></span>
                    <span class="mini-v ${have <= 0 ? 'neg' : ''}">${qty(have)} <small>${esc(unitOf(p))}</small></span></button>`;
            })()).join('') || '<div class="pick-none">Чунин мол нест.</div>';
        list.hidden = false;
    }
    function choose(i) {
        const it = items[i];
        if (!it) return;
        const q = inp.value.trim();
        inp.value = '';
        hot = 0;
        draw();
        if (it.isNew) onNew(q); else onPick(it.p);
        if (matchMedia('(hover: hover)').matches) inp.focus();
    }
    inp.addEventListener('input', () => { hot = 0; draw(); });
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); choose(hot); }
        else if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); hot = (hot + 1) % items.length; draw(); }
        else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); hot = (hot - 1 + items.length) % items.length; draw(); }
    });
    list.addEventListener('click', e => {
        const b = e.target.closest('[data-i]');
        if (b) choose(+b.dataset.i);
    });
}

/* ==================================================================
   ФУРӮШ, ВОРИДОТ, ИНТИҚОЛ — як тирезаи умумӣ
   ================================================================== */
const DOCS = {
    sale: { title: 'Фурӯш', sub: 'Мол илова кунед, нарх ва миқдорро санҷед', icon: 'sale', tone: 'tone-sale' },
    buy: { title: 'Воридот', sub: 'Моли омада ба анбор', icon: 'in', tone: 'tone-buy' },
    move: { title: 'Интиқол', sub: 'Мол аз як ҷой ба ҷойи дигар', icon: 'move', tone: 'tone-move' }
};

function docModal(kind, preset = null) {
    const locs = activeLocs();
    if (!locs.length) return toast('Аввал дар «Танзимот» анбор илова кунед.', 'err');
    if (kind === 'move' && locs.length < 2) return toast('Барои интиқол ақаллан ду ҷой лозим аст.', 'err');

    const shop = shopLoc();
    const wh = locs.find(l => l.location_type !== 'Shop') || locs[0];
    const other = locs.find(l => String(l.id) !== String(wh.id));
    const toDefault = String(shop.id) !== String(wh.id) ? shop : other;
    const lines = [];
    const dateF = field('Сана', `<input type="date" name="date" value="${today()}" max="${today()}">`);

    /* Фурӯш: нақд ё ба қарз (насия) */
    const payHtml = kind !== 'sale' ? '' : `
        <div class="field"><span class="field-l">Пардохт</span>
            <div class="seg pay-seg" role="radiogroup" aria-label="Пардохт">
                <button type="button" class="on" data-pay="cash" role="radio" aria-checked="true">${ic('wallet', 15)}Нақд</button>
                <button type="button" data-pay="debt" role="radio" aria-checked="false">${ic('debt', 15)}Ба қарз (насия)</button>
            </div>
            <input type="hidden" name="pay" value="cash">
        </div>
        <div class="debt-box" data-debt-box hidden>
            <div class="grid2">
                ${field('Номи мизоҷ', `<input type="text" name="debt_customer" list="debtCustList" maxlength="80" autocomplete="off" placeholder="Масалан: Фирӯз Раҳимов">`)}
                ${field('Телефон', '<input type="tel" name="debt_phone" inputmode="tel" maxlength="20" autocomplete="off" placeholder="+992 …">')}
            </div>
            <div class="grid2">
                ${field('Ҳозир медиҳад <em>(ихтиёрӣ)</em>', '<input type="text" inputmode="decimal" name="debt_prepay" autocomplete="off" placeholder="0">')}
                ${field('То кай медиҳад <em>(ихтиёрӣ)</em>', `<input type="date" name="debt_due" min="${today()}">`)}
            </div>
            ${custDatalist('debtCustList')}
        </div>`;

    const locHtml = kind === 'sale'
        ? field('Аз куҷо мефурӯшед', `<select name="loc">${locOptions(shop.id)}</select>`)
        : kind === 'buy'
            ? field('Ба куҷо омад', `<select name="loc">${locOptions(wh.id)}</select>`)
            : `<div class="grid2 route">${field('Аз куҷо', `<select name="from">${locOptions(wh.id)}</select>`)}${field('Ба куҷо', `<select name="to">${locOptions(toDefault.id)}</select>`)}</div>`;

    const m = formModal({
        title: DOCS[kind].title, sub: DOCS[kind].sub, icon: DOCS[kind].icon, tone: DOCS[kind].tone, size: 'lg', footClass: 'wrap',
        submitClass: kind === 'sale' ? 'sale-solid' : 'primary',
        footExtra: '<div class="total"><span data-count></span><span><b data-total></b><small data-extra></small></span></div>',
        body: `${locHtml}
            <div class="field"><span class="field-l">Мол</span><div data-pick></div></div>
            <div class="lines" data-lines></div>
            ${payHtml}
            <details class="extra"><summary>${ic('right', 14)}Сана ва эзоҳ</summary>${dateF}
            ${field('Эзоҳ <em>(ихтиёрӣ)</em>', `<input type="text" name="note" maxlength="200" placeholder="${kind === 'sale' ? 'Номи мизоҷ ё рақами телефон' : 'Масалан: мошини 80-AA-123'}">`)}</details>`,
        onSubmit: data => saveDoc(kind, lines, data)
    });

    const box = $('[data-lines]', m.el);
    const sel = n => $(`[name=${n}]`, m.el);
    if (kind === 'sale') {
        const seg = $('.pay-seg', m.el), dbox = $('[data-debt-box]', m.el);
        seg.addEventListener('click', e => {
            const b = e.target.closest('[data-pay]');
            if (!b) return;
            $$('[data-pay]', seg).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
            sel('pay').value = b.dataset.pay;
            dbox.hidden = b.dataset.pay !== 'debt';
            if (!dbox.hidden) sel('debt_customer').focus();
            drawTotals();
        });
        sel('debt_prepay').addEventListener('input', () => drawTotals());
        /* Номи мизоҷи шинос → телефонаш худ аз худ пур мешавад */
        sel('debt_customer').addEventListener('input', () => {
            const c = customers().find(x => norm(x.name) === norm(sel('debt_customer').value));
            if (c && c.phone && !sel('debt_phone').value) sel('debt_phone').value = c.phone;
        });
    }
    const srcLoc = () => kind === 'move' ? sel('from').value : sel('loc').value;
    const lineSum = l => num(l.q) * num(kind === 'sale' ? l.price : l.cost);

    /* Ҳисоби зинда: рақамҳо ҳангоми навиштан иваз мешаванд, сатр аз нав сохта намешавад */
    function calcLine(l) {
        const q = num(l.q), u = esc(unitOf(l.p)), src = srcLoc(), have = qtyAt(l.p.id, src);
        if (kind === 'sale') {
            return `<span>Мемонад: <b class="${have - q < 0 ? 'neg' : ''}">${qty(round3(have - q))} ${u}</b></span>
                <span>Фоида: <b>${money(q * (num(l.price) - num(l.p.purchase_price)))}</b></span>`;
        }
        if (kind === 'buy') {
            return `<span>Мешавад: <b>${qty(round3(have + q))} ${u}</b></span>
                <span>Фоида ҳангоми фурӯш: <b>${money(q * (num(l.price) - num(l.cost)))}</b></span>`;
        }
        const to = sel('to').value, there = qtyAt(l.p.id, to);
        return `<span>${esc(locName(src))}: ${qty(have)} → <b class="${have - q < 0 ? 'neg' : ''}">${qty(round3(have - q))} ${u}</b></span>
            <span>${esc(locName(to))}: ${qty(there)} → <b>${qty(round3(there + q))} ${u}</b></span>
            <span>Арзиш: <b>${money(q * num(l.p.purchase_price))}</b></span>`;
    }
    function drawTotals() {
        lines.forEach((l, i) => {
            const row = box.children[i];
            if (!row) return;
            const t = $('[data-t]', row);
            if (t) t.textContent = money(lineSum(l));
            $('[data-c]', row).innerHTML = calcLine(l);
            const w = $('[data-w]', row), have = qtyAt(l.p.id, srcLoc());
            w.hidden = kind === 'buy' || num(l.q) <= have;
            w.textContent = `Дар ин ҷо ҳамагӣ ${qty(have)} ${unitOf(l.p)} ҳаст.`;
        });
        const n = lines.length;
        $('[data-count]', m.el).textContent = n ? `${fmt(n)} мол` : 'Ҳоло мол нест';
        const total = $('[data-total]', m.el), extra = $('[data-extra]', m.el);
        if (kind === 'sale') {
            const sum = lines.reduce((s, l) => s + lineSum(l), 0);
            total.textContent = money(sum);
            const onDebt = sel('pay').value === 'debt';
            extra.textContent = !n ? '' : onDebt
                ? `Ба қарз: ${money(Math.max(0, sum - num(sel('debt_prepay').value)))}`
                : `Фоида: ${money(lines.reduce((s, l) => s + num(l.q) * (num(l.price) - num(l.p.purchase_price)), 0))}`;
        } else if (kind === 'buy') {
            total.textContent = money(lines.reduce((s, l) => s + lineSum(l), 0));
            extra.textContent = '';
        } else {
            const units = new Map();
            lines.forEach(l => units.set(unitOf(l.p), (units.get(unitOf(l.p)) || 0) + num(l.q)));
            total.textContent = [...units].map(([u, q]) => `${qty(q)} ${u}`).join(' + ');
            extra.textContent = n ? `Арзиш: ${money(lines.reduce((s, l) => s + num(l.q) * num(l.p.purchase_price), 0))}` : '';
        }
    }
    function quickChips(l) {
        const have = Math.max(qtyAt(l.p.id, srcLoc()), 0), per = num(l.p.units_per_box);
        const add = per > 1 ? [`<button type="button" class="qchip" data-add="${per}">+1 қуттӣ (${qty(per)})</button>`] : [];
        if (kind === 'buy') return [...[10, 50, 100].map(n => `<button type="button" class="qchip" data-add="${n}">+${n}</button>`), ...add].join('');
        return [...[1, 5, 10].map(n => `<button type="button" class="qchip" data-set="${n}">${n}</button>`),
            ...(have > 0 ? [`<button type="button" class="qchip" data-set="${have}">Ҳама (${qty(have)})</button>`] : []), ...add].join('');
    }
    function drawLines() {
        const pr = $('[data-pick]', m.el);
        if (pr && pr.refreshQuick) pr.refreshQuick();
        if (!lines.length) {
            box.innerHTML = `<div class="lines-empty">${ic('tag', 20)}<span>Молро интихоб кунед. Миқдор ва нарх дар ин ҷо пайдо мешаванд.</span></div>`;
            drawTotals();
            return;
        }
        box.innerHTML = lines.map((l, i) => {
            const u = esc(unitOf(l.p));
            return `<div class="line" data-i="${i}">
                <div class="line-h">${thumb(l.p)}
                    <span class="mini-b"><b>${esc(l.p.name)}</b><small>Дар ин ҷо: ${qty(qtyAt(l.p.id, srcLoc()))} ${u}</small></span>
                    <button type="button" class="line-x" data-rm aria-label="Хориҷ кардан">${ic('x', 16)}</button></div>
                <div class="line-f">
                    <div class="line-q"><span class="field-l">Миқдор (${u})</span>
                        <div class="qty"><button type="button" data-step="-1" aria-label="Кам кардан">${ic('minus', 15)}</button>
                        <input type="text" inputmode="decimal" data-v="q" value="${esc(l.q)}" aria-label="Миқдор (${u})">
                        <button type="button" data-step="1" aria-label="Зиёд кардан">${ic('plus', 15)}</button></div></div>
                    ${kind === 'sale' ? field(`Нархи 1 ${u}`, `<input type="text" inputmode="decimal" data-v="price" value="${esc(l.price)}">`) : ''}
                    ${kind === 'buy' ? field(`Нархи хариди 1 ${u}`, `<input type="text" inputmode="decimal" data-v="cost" value="${esc(l.cost)}">`) + field(`Нархи фурӯши 1 ${u}`, `<input type="text" inputmode="decimal" data-v="price" value="${esc(l.price)}">`) : ''}
                    ${kind === 'move' ? '' : '<span class="line-t" data-t></span>'}
                </div>
                <div class="qchips">${quickChips(l)}</div>
                <div class="line-c" data-c></div>
                <div class="line-w" data-w hidden></div>
            </div>`;
        }).join('');
        drawTotals();
    }
    function addLine(p) {
        const found = lines.find(l => String(l.p.id) === String(p.id));
        if (found) found.q = round3(num(found.q) + 1);
        else lines.push({ p, q: 1, price: num(p.sale_price) || '', cost: num(p.purchase_price) || '' });
        drawLines();
    }

    box.addEventListener('focusin', e => { if (e.target.dataset.v) e.target.select(); });
    box.addEventListener('input', e => {
        const k = e.target.dataset.v;
        if (!k) return;
        lines[+e.target.closest('.line').dataset.i][k] = e.target.value;
        drawTotals();
    });
    box.addEventListener('click', e => {
        const row = e.target.closest('.line');
        if (!row) return;
        const l = lines[+row.dataset.i];
        if (e.target.closest('[data-rm]')) { lines.splice(+row.dataset.i, 1); drawLines(); return; }
        const b = e.target.closest('[data-step], [data-set], [data-add]');
        if (!b) return;
        if (b.dataset.step) l.q = Math.max(0, round3(num(l.q) + +b.dataset.step));
        else if (b.dataset.set) l.q = num(b.dataset.set);
        else l.q = round3(num(l.q) + num(b.dataset.add));
        $('[data-v=q]', row).value = l.q;
        drawTotals();
    });
    ['loc', 'from', 'to'].forEach(n => { const s = sel(n); if (s) s.addEventListener('change', drawLines); });

    mountPicker($('[data-pick]', m.el), {
        stockAt: srcLoc,
        quick: true,
        quickWhen: () => !lines.length,
        onPick: addLine,
        onNew: kind === 'buy' ? name => productForm(null, { name, noOpening: true, onSaved: addLine }) : null
    });
    if (preset) addLine(preset); else drawLines();
}

/* Пас аз сабти асосӣ қадами иловагӣ хато карда метавонад (масалан, интернет қатъ шуд).
   Он вақт тиреза баста мешавад ва корбар паёми аниқ мегирад: агар тиреза кушода монад,
   корбар боз «Сабт кардан»-ро пахш мекунад ва фурӯш ё воридот ду бор сабт мешавад. */
async function thenTry(fn, msg) {
    try { await fn(); return true; }
    catch (e) { console.error(e); toast(msg, 'err'); return false; }
}

async function saveDoc(kind, lines, data) {
    if (!lines.length) throw bad('Ақаллан як мол илова кунед.');
    for (const l of lines) {
        if (num(l.q) <= 0) throw bad(`Миқдори «${l.p.name}»-ро нависед.`);
        if (kind === 'sale' && num(l.price) <= 0) throw bad(`Нархи «${l.p.name}»-ро нависед.`);
        if (kind === 'buy' && num(l.cost) < 0) throw bad('Нарх манфӣ шуда наметавонад.');
    }
    const note = String(data.note || '').trim();
    const date = (data.date || today()) + nowStr().slice(10);
    if (data.date > today()) throw bad('Санаи оянда интихоб шудааст.');

    if (kind === 'move' && String(data.from) === String(data.to)) throw bad('Ҷойи баромад ва расидан бояд гуногун бошанд.');

    /* Қарз пеш аз ҳар сабт санҷида мешавад, то фурӯш бе қарз сабт нашавад */
    const onDebt = kind === 'sale' && data.pay === 'debt';
    const saleSum = Math.round(lines.reduce((s, l) => s + num(l.q) * num(l.price), 0) * 100) / 100;
    const prepay = onDebt ? Math.round(num(data.debt_prepay) * 100) / 100 : 0;
    if (onDebt) {
        if (!String(data.debt_customer || '').trim()) throw bad('Номи мизоҷро нависед, ки қарз гирифт.');
        if (prepay < 0) throw bad('Маблағи пешпардохт нодуруст аст.');
        if (prepay >= saleSum) throw bad('Пешпардохт ба маблағи пурра баробар аст — «Нақд»-ро интихоб кунед.');
    }

    if (kind !== 'buy') {
        const src = kind === 'sale' ? data.loc : data.from;
        const short = lines.filter(l => num(l.q) > qtyAt(l.p.id, src));
        if (short.length) {
            const go_ = await ask({
                title: 'Бақия намерасад',
                text: `${short.map(l => `${l.p.name}: ${qty(qtyAt(l.p.id, src))} ${unitOf(l.p)}`).join('; ')}. Бо вуҷуди ин сабт кунем? Бақия манфӣ мешавад.`,
                ok: 'Сабт кардан'
            });
            if (!go_) return false;
        }
    }

    const base = l => ({ date, product_id: l.p.id, quantity: num(l.q), unit: unitOf(l.p), note });
    let recs;
    if (kind === 'sale') {
        recs = lines.map(l => ({ ...base(l), type: 'SALE', from_location_id: num(data.loc), to_location_id: '', unit_cost: num(l.p.purchase_price), unit_price: num(l.price) }));
    } else if (kind === 'buy') {
        recs = lines.map(l => ({ ...base(l), type: 'PURCHASE', from_location_id: '', to_location_id: num(data.loc), unit_cost: num(l.cost), unit_price: num(l.price) }));
    } else {
        recs = lines.map(l => ({ ...base(l), type: 'TRANSFER', from_location_id: num(data.from), to_location_id: num(data.to), unit_cost: num(l.p.purchase_price), unit_price: num(l.p.sale_price) }));
    }

    const saved = await addTx(recs, { receipt: kind === 'sale' });
    if (kind === 'buy' && !await thenTry(() => updatePrices(lines),
        'Воридот сабт шуд, вале нархи нав дар корти мол сабт нашуд. Нархро дар корти мол иваз кунед.')) return;

    if (onDebt) {
        const rc = saved[0].receipt_code;
        let d = null;
        if (!await thenTry(async () => {
            d = await addDebt({
                customer: String(data.debt_customer).trim(), phone: String(data.debt_phone || '').trim(),
                amount: saleSum, date, due_date: data.debt_due || '', receipt_code: rc, note
            });
        }, `Фурӯш сабт шуд (чеки ${rc}), вале қарз сабт нашуд. Дар бахши «Қарз» қарзро дастӣ илова кунед.`)) return;
        if (prepay > 0 && !await thenTry(() => addPayments([{ debt_id: d.id, amount: prepay, method: 'CASH', note: 'Пешпардохт', date }]),
            `Қарз сабт шуд, вале пешпардохти ${money(prepay)} сабт нашуд. Онро дар корти мизоҷ ҳамчун пардохт илова кунед.`)) return;
        toast(`Фурӯш ба қарз сабт шуд. ${d.customer} қарздор: ${money(saleSum - prepay)}`);
        return;
    }
    toast(kind === 'sale' ? `Фурӯш сабт шуд: ${money(saleSum)}`
        : kind === 'buy' ? 'Воридот сабт шуд' : 'Интиқол сабт шуд');
}

/* Агар ҳангоми қабул нарх иваз шуда бошад, дар корти мол ҳам иваз мешавад */
async function updatePrices(lines) {
    const changed = lines.filter(l => num(l.cost) !== num(l.p.purchase_price) || num(l.price) !== num(l.p.sale_price));
    if (!changed.length) return;
    const ids = await DB.get('Products!A:A');
    const rowOf = new Map(ids.map((r, i) => [String(r[0]), i + 1]));
    const h = head('Products');
    const data = [];
    changed.forEach(l => {
        const row = rowOf.get(String(l.p.id));
        if (!row) return;
        data.push({ range: `Products!${colName(h.indexOf('purchase_price'))}${row}`, values: [[num(l.cost)]] });
        data.push({ range: `Products!${colName(h.indexOf('sale_price'))}${row}`, values: [[num(l.price)]] });
    });
    await DB.setRanges(data);
    changed.forEach(l => {
        const cur_ = prodBy(l.p.id) || l.p;
        cur_.purchase_price = num(l.cost);
        cur_.sale_price = num(l.price);
    });
    wrote();
}

/* ---------- Ислоҳи бақия ---------- */
function fixModal(preset = null, locId = '') {
    const locs = activeLocs();
    if (!locs.length) return toast('Аввал дар «Танзимот» анбор илова кунед.', 'err');
    let prod = preset;
    const m = formModal({
        title: 'Шумориши мол', sub: 'Молро шуморед ва миқдори воқеиро нависед', icon: 'fix', tone: 'tone-warn',
        body: `${field('Ҷой', `<select name="loc">${locOptions(locId || locs[0].id)}</select>`)}
            <div class="field"><span class="field-l">Мол</span><div data-pick></div></div>
            <div class="note" data-cur style="margin-top:14px" hidden></div>
            ${field('Дар асл чанд ҳаст?', '<input type="text" inputmode="decimal" name="real" autocomplete="off">', 'Агар рақам бо система фарқ кунад, барнома бақияро дуруст мекунад ва фарқро дар «Амалиётҳо» сабт мекунад.')}
            ${field('Эзоҳ <em>(ихтиёрӣ)</em>', '<input type="text" name="note" maxlength="200" placeholder="Масалан: мол шикаста буд">')}`,
        async onSubmit(d) {
            if (!prod) throw bad('Молро интихоб кунед.');
            if (String(d.real).trim() === '') throw bad('Миқдори воқеиро нависед.');
            const now = qtyAt(prod.id, d.loc), real = num(d.real), diff = round3(real - now);
            if (!diff) { toast('Бақия дуруст аст, тағйир лозим нест.'); return; }
            await addTx([{
                date: nowStr(), type: 'ADJUSTMENT', product_id: prod.id,
                from_location_id: diff < 0 ? num(d.loc) : '', to_location_id: diff > 0 ? num(d.loc) : '',
                quantity: Math.abs(diff), unit: unitOf(prod),
                unit_cost: num(prod.purchase_price), unit_price: num(prod.sale_price),
                note: String(d.note || '').trim() || `Бақия: ${qty(now)} → ${qty(real)}`
            }]);
            toast('Бақия дуруст шуд');
        }
    });
    const cur_ = $('[data-cur]', m.el), loc = $('[name=loc]', m.el);
    const draw = () => {
        cur_.hidden = !prod;
        if (prod) cur_.textContent = `${prod.name}: дар система ${qty(qtyAt(prod.id, loc.value))} ${unitOf(prod)}`;
    };
    loc.addEventListener('change', draw);
    mountPicker($('[data-pick]', m.el), { stockAt: () => loc.value, onPick: p => { prod = p; draw(); $('[name=real]', m.el).focus(); } });
    draw();
}

/* ==================================================================
   МОЛ
   ================================================================== */
function productView(id) {
    const p = prodBy(id);
    if (!p) return toast('Мол ёфт нашуд.', 'err');
    const on = isActive(p);
    const hist = S.txSorted.filter(x => String(x.product_id) === String(p.id));
    const profit = num(p.sale_price) - num(p.purchase_price);
    const specs = [['Силсила', p.series], ['Ранг', p.color], ['Шумораи ҷойҳо', p.mesta], ['Шумораи тугмаҳо', p.taga], ['Дар як қуттӣ', p.units_per_box]].filter(([, v]) => v !== '' && v !== undefined);
    Modal.open({
        title: 'Маълумоти мол', icon: 'tag', tone: 'tone-buy',
        body: `<div class="pv-photo ${imgSrc(p) ? '' : 'none'}">${thumb(p, 'cover')}${imgSrc(p) ? '' : `<button class="btn sm pv-add" data-act="prodEdit" data-id="${esc(p.id)}">${ic('camera', 15)}Акс гузоштан</button>`}</div>
        <div class="pv-head"><b>${esc(p.name)}</b><small>${esc([p.product_code, p.category].filter(Boolean).join(' · '))}</small></div>
        <div class="facts">
            <div><small>Бақия</small><b>${qty(qtyAll(p.id))} ${esc(unitOf(p))}</b></div>
            <div><small>Нархи фурӯш</small><b>${fmt(p.sale_price, 2)}</b></div>
            <div><small>Нархи харид</small><b>${fmt(p.purchase_price, 2)}</b></div>
            <div><small>Фоида аз 1 ${esc(unitOf(p))}</small><b>${fmt(profit, 2)}</b></div>
        </div>
        ${on ? `<div class="quick">
            <button class="btn t-sale" data-act="sale" data-id="${esc(p.id)}">${ic('sale', 16)}Фурӯш</button>
            <button class="btn t-buy" data-act="buy" data-id="${esc(p.id)}">${ic('in', 16)}Воридот</button>
            <button class="btn t-move" data-act="move" data-id="${esc(p.id)}">${ic('move', 16)}Интиқол</button>
        </div>` : ''}
        <div class="sec-h"><p class="sec-t">Бақия дар ҷойҳо</p>${on ? `<button class="btn quiet sm" data-act="fix" data-id="${esc(p.id)}">Бақия нодуруст аст?</button>` : ''}</div>
        ${S.locations.filter(l => isActive(l) || qtyAt(p.id, l.id) !== 0).map(l => `<div class="kv"><span>${esc(l.name)}</span><b class="${qtyAt(p.id, l.id) < 0 ? 'neg' : ''}">${qty(qtyAt(p.id, l.id))} ${esc(unitOf(p))}</b></div>`).join('')}
        ${specs.length ? `<p class="sec-t">Хусусиятҳо</p>${specs.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}` : ''}
        ${p.description ? `<p class="sec-t">Тавсиф</p><p class="card-p" style="margin:6px 0 0">${esc(p.description)}</p>` : ''}
        ${hist.length ? `<p class="sec-t">Амалиётҳои охирин</p>${hist.slice(0, 6).map(x => `<button class="mini" data-act="txView" data-id="${esc(x.id)}">
            <span class="tile sm ${esc(x.type)}">${ic((TYPES[x.type] || TYPES.ADJUSTMENT).icon, 15)}</span>
            <span class="mini-b"><b>${(TYPES[x.type] || { t: x.type }).t}</b><small>${esc(dayLabel(dayOf(x)))} · ${esc(txRoute(x))}</small></span>
            <span class="mini-v">${txQty(x, p)}<small>${money(txValue(x))}</small></span></button>`).join('')}` : ''}`,
        foot: `<button class="btn primary lg" data-act="prodEdit" data-id="${esc(p.id)}">${ic('edit', 16)}Тағйир додан</button>`
    });
}

function productForm(p = null, { name = '', noOpening = false, onSaved } = {}) {
    const editing = !!p;
    const v = p || { name, unit: 'дона' };
    const units = UNITS.includes(v.unit) || !v.unit ? UNITS : [v.unit, ...UNITS];
    let photo = null, removed = false;
    const extra = v.series || v.color || v.description || num(v.mesta) || num(v.taga) || num(v.units_per_box);
    const numVal = x => (x === '' || x === undefined || x === null) ? '' : esc(x);

    const body = `
        <div class="photo">${thumb({ ...v, id: v.id ?? 'new', name: v.name || 'Мол' }, 'cover')}</div>
        <div class="photo-b">
            <button type="button" class="btn t-buy" data-pickcam>${ic('camera', 16)}Камера</button>
            <button type="button" class="btn t-buy" data-pickphoto>${ic('image', 16)}Галерея</button>
            <button type="button" class="btn icon danger" data-rmphoto aria-label="Нест кардани акс" title="Нест кардани акс" ${imgSrc(v) ? '' : 'hidden'}>${ic('trash', 16)}</button>
        </div>
        <p class="photo-h" data-photo-h>Барнома аксро худаш омода мекунад: ҳошияро мебурад, молро дар марказ мегузорад ва андозаро дуруст мекунад.</p>
        <input type="file" accept="image/*" hidden data-file>
        <input type="file" accept="image/*" capture="environment" hidden data-cam>
        ${field('Номи мол', `<input type="text" name="name" value="${esc(v.name)}" maxlength="200" data-auto autocomplete="off" required>`)}
        <div class="grid2">
            ${field('Гурӯҳ', `<input type="text" name="category" value="${esc(v.category)}" list="catList" maxlength="80" autocomplete="off"><datalist id="catList">${categories().map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>`)}
            ${field('Воҳид', `<select name="unit">${options(units.map(u => [u, u]), v.unit || 'дона')}</select>`)}
        </div>
        <div class="grid2">
            ${field('Нархи харид', `<input type="text" inputmode="decimal" name="purchase_price" value="${numVal(v.purchase_price)}" autocomplete="off">`)}
            ${field('Нархи фурӯш', `<input type="text" inputmode="decimal" name="sale_price" value="${numVal(v.sale_price)}" autocomplete="off">`)}
        </div>
        ${!editing && !noOpening ? `<div class="grid2">
            ${field('Бақияи аввал <em>(ихтиёрӣ)</em>', '<input type="text" inputmode="decimal" name="opening" autocomplete="off">')}
            ${field('Дар куҷо', `<select name="opening_loc">${locOptions((activeLocs()[0] || {}).id)}</select>`)}
        </div>` : ''}
        <details class="extra" ${extra ? 'open' : ''}>
            <summary>${ic('right', 14)}Маълумоти иловагӣ</summary>
            <div class="grid2">
                ${field('Рамзи мол', `<input type="text" name="product_code" value="${esc(v.product_code)}" maxlength="40" placeholder="Худкор" autocomplete="off">`)}
                ${field('Ҳадди кам', `<input type="text" inputmode="decimal" name="min_stock" value="${numVal(v.min_stock)}" placeholder="${esc(qty(S.cfg.low_stock_default))}" autocomplete="off">`)}
            </div>
            <div class="grid2">
                ${field('Силсила', `<input type="text" name="series" value="${esc(v.series)}" maxlength="80" autocomplete="off">`)}
                ${field('Ранг', `<input type="text" name="color" value="${esc(v.color)}" maxlength="40" autocomplete="off">`)}
            </div>
            <div class="grid2">
                ${field('Шумораи ҷойҳо', `<input type="text" inputmode="numeric" name="mesta" value="${numVal(v.mesta)}" autocomplete="off">`)}
                ${field('Шумораи тугмаҳо', `<input type="text" inputmode="numeric" name="taga" value="${numVal(v.taga)}" autocomplete="off">`)}
            </div>
            ${field('Дар як қуттӣ', `<input type="text" inputmode="decimal" name="units_per_box" value="${numVal(v.units_per_box)}" autocomplete="off">`)}
            ${field('Тавсиф', `<textarea name="description" maxlength="500">${esc(v.description)}</textarea>`)}
        </details>
        ${editing ? `<div class="danger-z">
            <button type="button" class="btn" data-archive>${ic('archive', 16)}${isActive(p) ? 'Ба бойгонӣ гузоштан' : 'Аз бойгонӣ баргардонидан'}</button>
            <button type="button" class="btn danger" data-delete>${ic('trash', 16)}Нест кардан</button>
        </div>` : ''}`;

    const m = formModal({
        title: editing ? 'Тағйири мол' : 'Моли нав', icon: editing ? 'edit' : 'plus', tone: 'tone-buy', body,
        async onSubmit(d) {
            const nm = String(d.name || '').trim();
            if (!nm) throw bad('Номи молро нависед.');
            const others = S.products.filter(x => !p || String(x.id) !== String(p.id));
            const code = String(d.product_code || '').trim();
            if (code && others.some(x => String(x.product_code).trim().toLowerCase() === code.toLowerCase())) throw bad(`Рамзи «${code}» аллакай истифода шудааст.`);
            if (num(d.purchase_price) < 0 || num(d.sale_price) < 0) throw bad('Нарх манфӣ шуда наметавонад.');
            /* Агар чунин мол ҳаст, нусхаи дуюм сохта намешавад — моли нав ба бақияи ҳамон мол илова мегардад */
            const twin = others.find(x => isActive(x) && norm(x.name) === norm(nm));
            if (twin && (!p || norm(p.name) !== norm(nm))) {
                const pickTwin = await choose({
                    title: 'Ин мол аллакай ҳаст',
                    text: `«${twin.name}» дар анбор ${qty(qtyAll(twin.id))} ${unitOf(twin)} дорад. Моли омадаро ба ҳамин мол илова кунем? Бақия танҳо зиёд мешавад.`,
                    options: [['add', `Ба «${twin.name}» илова кардан`, 'primary'], ['new', 'Не, моли дигар аст — алоҳида сохтан', '']]
                });
                if (!pickTwin) return false;
                if (pickTwin === 'add') {
                    m.close();
                    if (onSaved) onSaved(twin); else docModal('buy', twin);
                    return false;
                }
            }
            const rec = {
                name: nm,
                category: String(d.category || '').trim(),
                unit: d.unit || 'дона',
                purchase_price: num(d.purchase_price),
                sale_price: num(d.sale_price),
                series: String(d.series || '').trim(),
                color: String(d.color || '').trim(),
                mesta: String(d.mesta || '').trim() === '' ? '' : num(d.mesta),
                taga: String(d.taga || '').trim() === '' ? '' : num(d.taga),
                units_per_box: String(d.units_per_box || '').trim() === '' ? '' : num(d.units_per_box),
                description: String(d.description || '').trim(),
                min_stock: String(d.min_stock || '').trim() === '' ? '' : num(d.min_stock)
            };
            if (editing) {
                if (code) rec.product_code = code;
                if (photo) rec.image_url = await saveImage(p.id, photo);
                else if (removed) {
                    if (String(p.image_url).startsWith('img:')) await removeImage(p.id);
                    rec.image_url = '';
                }
                await updateProduct(p, rec);
                toast('Мол тағйир ёфт');
            } else {
                const saved = await addProduct({ ...rec, product_code: code, image_url: '', _photo: photo });
                const open = num(d.opening);
                if (open > 0 && d.opening_loc && !await thenTry(() => addTx([{
                    date: nowStr(), type: 'PURCHASE', product_id: saved.id, from_location_id: '', to_location_id: num(d.opening_loc),
                    quantity: open, unit: saved.unit, unit_cost: saved.purchase_price, unit_price: saved.sale_price, note: 'Бақияи аввал'
                }]), 'Мол илова шуд, вале бақияи аввал сабт нашуд. Онро бо «Воридот» илова кунед.')) return;
                toast('Мол илова шуд');
                if (onSaved) onSaved(saved);
            }
        }
    });

    const file = $('[data-file]', m.el), cam = $('[data-cam]', m.el), th = $('.photo .thumb', m.el), rm = $('[data-rmphoto]', m.el);
    const show = src => {
        const old = $('.ph', th);
        if (old) old.remove();
        if (src) { const im = new Image(); im.className = 'ph'; im.alt = ''; im.src = src; th.append(im); }
        rm.hidden = !src;
    };
    $('[data-pickphoto]', m.el).onclick = () => file.click();
    $('[data-pickcam]', m.el).onclick = () => cam.click();
    [file, cam].forEach(inp => {
        inp.onchange = async () => {
            const f = inp.files[0];
            inp.value = '';
            if (!f) return;
            const hint = $('[data-photo-h]', m.el);
            hint.className = 'photo-h busy';
            hint.textContent = 'Акс омода мешавад…';
            try {
                const r = await shrinkPhoto(f);
                photo = r.data;
                removed = false;
                show(photo);
                hint.className = 'photo-h ' + (r.small ? 'warn' : 'ok');
                hint.textContent = r.small
                    ? `Акс омода шуд: ${r.size}×${r.size}, ${r.kb} КБ. Акси аслӣ хурд аст — барои сифати беҳтар акси калонтар гиред.`
                    : `Акс омода шуд: ${r.size}×${r.size}, ${r.kb} КБ. Ҳангоми «Сабт кардан» ба ҷадвал меравад.`;
            } catch (e) {
                hint.className = 'photo-h';
                hint.textContent = '';
                m.fail(errText(e));
            }
        };
    });
    rm.onclick = () => { photo = null; removed = true; show(''); };

    if (editing) {
        $('[data-archive]', m.el).onclick = async () => {
            const toArchive = isActive(p), q = qtyAll(p.id);
            if (toArchive && q !== 0) {
                const yes = await ask({ title: 'Дар анбор бақия ҳаст', text: `«${p.name}»: ${qty(q)} ${unitOf(p)}. Мол аз ҳисобот пинҳон мешавад. Ба бойгонӣ гузорем?`, ok: 'Ба бойгонӣ гузоштан' });
                if (!yes) return;
            }
            try {
                await updateProduct(p, { status: toArchive ? 'INACTIVE' : 'ACTIVE' });
                toast(toArchive ? 'Мол ба бойгонӣ гузошта шуд' : 'Мол баргардонида шуд');
                m.close();
            } catch (e) { m.fail(errText(e)); }
        };
        $('[data-delete]', m.el).onclick = async () => {
            const n = S.tx.filter(t => String(t.product_id) === String(p.id)).length;
            const yes = await ask({
                title: 'Нест кардани мол',
                text: `«${p.name}»${n ? ` ва ${fmt(n)} амалиёти он` : ''} аз ҷадвал нест мешавад. Ин амал бозгашт надорад${n ? ' ва ҳисоботи гузашта иваз мешавад. Агар таърих лозим бошад, беҳтар аст молро ба бойгонӣ гузоред' : ''}.`,
                ok: 'Нест кардан', danger: true
            });
            if (!yes) return;
            try { await deleteProduct(p); toast('Мол нест карда шуд'); m.close(); }
            catch (e) { m.fail(errText(e)); }
        };
    }
}

/* ==================================================================
   АМАЛИЁТ
   ================================================================== */
const txById = id => S.tx.find(x => String(x.id) === String(id));
const returnedOf = x => S.tx.filter(r => isRet(r) && String(r.note).includes(x.transaction_code)).reduce((s, r) => s + num(r.quantity), 0);

function txView(id) {
    const x = txById(id);
    if (!x) return toast('Амалиёт ёфт нашуд.', 'err');
    const p = prodBy(x.product_id) || {};
    const T = TYPES[x.type] || { t: x.type };
    const money_ = isSale(x) || isRet(x);
    const siblings = x.receipt_code ? S.tx.filter(t => t.receipt_code === x.receipt_code && isSale(t)) : [];
    const rows = [
        ['Сана', `${dayLabel(dayOf(x))}${timeOf(x) ? ', ' + timeOf(x) : ''}`],
        ['Мол', p.name || 'Мол #' + x.product_id],
        ['Ҷой', txRoute(x)],
        ['Миқдор', `${qty(x.quantity)} ${x.unit || unitOf(p)}`],
        ['Нархи харид', money(x.unit_cost)],
        ['Нархи фурӯш', money(x.unit_price)],
        ['Маблағ', money(txValue(x))],
        ...(money_ ? [['Фоида', money(netProfit([x]))]] : []),
        ...(x.note ? [['Эзоҳ', x.note]] : [])
    ];
    const left = isSale(x) ? round3(num(x.quantity) - returnedOf(x)) : 0;
    const debt = debtOfReceipt(x.receipt_code);
    if (debt) rows.push(['Қарз', `${debt.customer}: ${debt._closed ? 'пурра пардохт шуд' : 'боқимонда ' + money(debt._left)}`]);
    const m = Modal.open({
        title: T.t, sub: [x.transaction_code, x.receipt_code].filter(Boolean).join(' · '), icon: T.icon,
        tone: { SALE: 'tone-sale', PURCHASE: 'tone-buy', TRANSFER: 'tone-move', ADJUSTMENT: 'tone-warn', RETURN: 'tone-bad' }[x.type] || '',
        body: `${rows.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}
        ${siblings.length > 1 ? `<p class="sec-t">Дар ин чек: ${money(netRev(siblings))}</p>
            ${siblings.map(s => { const q = prodBy(s.product_id) || {}; return `<div class="kv"><span>${esc(q.name || 'Мол #' + s.product_id)}</span><b>${qty(s.quantity)} × ${fmt(s.unit_price, 2)}</b></div>`; }).join('')}` : ''}`,
        foot: `<button type="button" class="btn danger" data-del>${ic('trash', 16)}Нест кардан</button>
            ${isSale(x) && left > 0 ? `<button type="button" class="btn t-move" data-ret>${ic('back', 16)}Бозгашт</button>` : ''}
            <button type="button" class="btn primary" data-edit>${ic('edit', 16)}Тағйир додан</button>`
    });
    $('[data-edit]', m.el).onclick = () => { m.close(); txEdit(x); };
    const r = $('[data-ret]', m.el);
    if (r) r.onclick = () => { m.close(); returnForm(x, left); };
    $('[data-del]', m.el).onclick = async () => {
        const yes = await ask({
            title: 'Нест кардани амалиёт',
            text: `${T.t} (${x.transaction_code}) нест мешавад ва бақия аз нав ҳисоб мегардад.${debt ? ` Ин чек ба қарзи «${debt.customer}» вобаста аст — қарзро дар бахши «Қарз» дуруст кунед.` : ''}`,
            ok: 'Нест кардан', danger: true
        });
        if (!yes) return;
        try { await deleteTx(x); toast('Амалиёт нест карда шуд'); m.close(); }
        catch (e) { showErr(e); }
    };
}

function txEdit(x) {
    const allLocs = sel => options(S.locations.map(l => [l.id, l.name]), sel);
    const when = String(x.date).length > 10 ? String(x.date).slice(0, 16).replace(' ', 'T') : `${x.date}T00:00`;
    const p = prodBy(x.product_id) || {};
    const fromF = x.from_location_id !== '' ? field(x.type === 'TRANSFER' ? 'Аз куҷо' : 'Ҷой', `<select name="from">${allLocs(x.from_location_id)}</select>`) : '';
    const toF = x.to_location_id !== '' ? field(x.type === 'TRANSFER' ? 'Ба куҷо' : 'Ҷой', `<select name="to">${allLocs(x.to_location_id)}</select>`) : '';
    formModal({
        title: 'Тағйири амалиёт', sub: `${x.transaction_code} · ${p.name || ''}`, icon: 'edit', tone: 'tone-buy',
        body: `${field('Сана ва вақт', `<input type="datetime-local" name="date" value="${esc(when)}">`)}
            <div class="grid2">${fromF}${toF}</div>
            <div class="grid2">
                ${field(`Миқдор (${esc(x.unit || unitOf(p))})`, `<input type="text" inputmode="decimal" name="quantity" value="${esc(x.quantity)}" autocomplete="off">`)}
                <span></span>
            </div>
            <div class="grid2">
                ${field('Нархи харид', `<input type="text" inputmode="decimal" name="unit_cost" value="${esc(x.unit_cost)}" autocomplete="off">`)}
                ${field('Нархи фурӯш', `<input type="text" inputmode="decimal" name="unit_price" value="${esc(x.unit_price)}" autocomplete="off">`)}
            </div>
            ${field('Эзоҳ', `<input type="text" name="note" value="${esc(x.note)}" maxlength="200">`)}`,
        async onSubmit(d) {
            const q = num(d.quantity);
            if (q <= 0) throw bad('Миқдор бояд аз 0 зиёд бошад.');
            if (!d.date) throw bad('Санаро нависед.');
            if (x.type === 'TRANSFER' && String(d.from) === String(d.to)) throw bad('Ҷойи баромад ва расидан бояд гуногун бошанд.');
            const ch = { date: d.date.replace('T', ' ').slice(0, 16) + ':00', quantity: q, base_quantity: q, note: String(d.note || '').trim() };
            if (d.from !== undefined) ch.from_location_id = num(d.from);
            if (d.to !== undefined) ch.to_location_id = num(d.to);
            if (d.unit_cost !== undefined) ch.unit_cost = num(d.unit_cost);
            if (d.unit_price !== undefined) ch.unit_price = num(d.unit_price);
            await updateTx(x, ch);
            toast('Амалиёт тағйир ёфт');
        }
    });
}

function returnForm(x, left) {
    const p = prodBy(x.product_id) || {};
    const debt = debtOfReceipt(x.receipt_code);
    const onDebt = debt && !debt._closed;
    formModal({
        title: 'Бозгашти мол', sub: `${p.name || ''} · ${x.transaction_code}`, icon: 'back', tone: 'tone-bad',
        body: `${onDebt ? `<div class="note warn" style="margin-bottom:14px">${ic('debt', 16)}<span>Ин мол ба қарз фурӯхта шуда буд. Маблағи бозгашт аз қарзи «${esc(debt.customer)}» кам мешавад (боқимонда ${money(debt._left)}).</span></div>` : ''}
            <div class="grid2">
                ${field(`Миқдор (то ${qty(left)})`, `<input type="text" inputmode="decimal" name="quantity" value="${esc(left)}" data-auto autocomplete="off">`)}
                ${field('Ба куҷо', `<select name="loc">${locOptions(x.from_location_id)}</select>`)}
            </div>
            ${field('Сабаб <em>(ихтиёрӣ)</em>', '<input type="text" name="note" maxlength="200">')}`,
        submit: 'Бозгашт кардан',
        async onSubmit(d) {
            const q = num(d.quantity);
            if (q <= 0) throw bad('Миқдорро нависед.');
            if (q > left) throw bad(`Зиёда аз ${qty(left)} баргардонидан мумкин нест.`);
            const why = String(d.note || '').trim();
            await addTx([{
                date: nowStr(), type: 'RETURN', product_id: x.product_id, from_location_id: '', to_location_id: num(d.loc),
                quantity: q, unit: x.unit, unit_cost: num(x.unit_cost), unit_price: num(x.unit_price),
                note: `Бозгашт аз ${x.transaction_code}${why ? ' · ' + why : ''}`, receipt_code: x.receipt_code
            }]);
            const sum = Math.round(q * num(x.unit_price) * 100) / 100;
            if (onDebt) {
                const off = Math.min(sum, I.debt.get(String(debt.id))._left);
                if (off > 0 && !await thenTry(() => addPayments([{ debt_id: debt.id, amount: off, method: 'RETURN', note: `Бозгашти мол аз ${x.transaction_code}` }]),
                    `Бозгашт сабт шуд, вале қарзи ${debt.customer} кам нашуд. Дар корти мизоҷ пардохтро бо роҳи «Бозгашти мол» илова кунед.`)) return;
                toast(`Бозгашт сабт шуд. Қарзи ${debt.customer} ${money(off)} кам шуд.`);
                return;
            }
            toast(`Бозгашт сабт шуд: ${money(sum)}`);
        }
    });
}

/* ==================================================================
   ХАРОҶОТ
   ================================================================== */
const EXP_CATS = ['Иҷора', 'Маош', 'Нақлиёт', 'Барқ ва об', 'Андоз', 'Хӯрок', 'Дигар'];

function expenseForm(e = null) {
    const used = [...new Set(S.exp.map(x => String(x.category || '').trim()).filter(Boolean))];
    const cats = [...new Set([...EXP_CATS, ...used])];
    const m = formModal({
        title: e ? 'Тағйири хароҷот' : 'Хароҷоти нав', sub: 'Пуле, ки на барои мол сарф шуд', icon: 'wallet', tone: 'tone-exp',
        body: `<div class="grid2">
                ${field(`Маблағ (${esc(cur())})`, `<input type="text" inputmode="decimal" name="amount" value="${esc(e ? e.amount : '')}" data-auto autocomplete="off">`)}
                ${field('Сана', `<input type="date" name="date" value="${esc(e ? dayOf(e) : today())}" max="${today()}">`)}
            </div>
            ${field('Барои чӣ', `<input type="text" name="category" value="${esc(e ? e.category : '')}" maxlength="60" autocomplete="off">`)}
            <div class="qchips" data-cats>${cats.map(c => `<button type="button" class="qchip" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
            ${field('Ҷой <em>(ихтиёрӣ)</em>', `<select name="location_id">${options([['', 'Умумӣ'], ...S.locations.map(l => [l.id, l.name])], e ? e.location_id : '')}</select>`)}
            ${field('Эзоҳ <em>(ихтиёрӣ)</em>', `<input type="text" name="note" value="${esc(e ? e.note : '')}" maxlength="200">`)}
            ${e ? `<div class="danger-z"><button type="button" class="btn danger" data-del>${ic('trash', 16)}Нест кардан</button></div>` : ''}`,
        async onSubmit(d) {
            const amount_ = num(d.amount), category = String(d.category || '').trim();
            if (amount_ <= 0) throw bad('Маблағро нависед.');
            if (!category) throw bad('Нависед, ки ин пул барои чӣ рафт.');
            if (d.date > today()) throw bad('Санаи оянда интихоб шудааст.');
            const rec = {
                date: (d.date || today()) + nowStr().slice(10), category, amount: amount_,
                location_id: d.location_id === '' ? '' : num(d.location_id), note: String(d.note || '').trim()
            };
            await saveExpense(e, rec);
            toast(`Хароҷот сабт шуд: ${money(amount_)}`);
        }
    });
    $('[data-cats]', m.el).addEventListener('click', ev => {
        const b = ev.target.closest('[data-c]');
        if (b) $('[name=category]', m.el).value = b.dataset.c;
    });
    if (e) $('[data-del]', m.el).onclick = async () => {
        const yes = await ask({ title: 'Нест кардани хароҷот', text: `${e.category}: ${money(e.amount)} нест мешавад.`, ok: 'Нест кардан', danger: true });
        if (!yes) return;
        try { await deleteExpense(e); toast('Хароҷот нест карда шуд'); m.close(); }
        catch (ex) { m.fail(errText(ex)); }
    };
}

/* ==================================================================
   ТАНЗИМОТ
   ================================================================== */
function locForm(l = null) {
    const used = l ? S.tx.some(t => String(t.from_location_id) === String(l.id) || String(t.to_location_id) === String(l.id)) || S.exp.some(e => String(e.location_id) === String(l.id)) : false;
    const m = formModal({
        title: l ? 'Тағйири ҷой' : 'Ҷойи нав',
        body: `${field('Ном', `<input type="text" name="name" value="${esc(l ? l.name : '')}" maxlength="80" data-auto autocomplete="off">`)}
            ${field('Навъ', `<select name="type">${options([['Warehouse', 'Анбор'], ['Shop', 'Мағоза']], l ? l.location_type : 'Warehouse')}</select>`)}
            ${l ? `<div class="danger-z">
                <button type="button" class="btn" data-toggle>${isActive(l) ? 'Ғайрифаъол кардан' : 'Фаъол кардан'}</button>
                ${used ? '' : `<button type="button" class="btn danger" data-del>${ic('trash', 16)}Нест кардан</button>`}
            </div>` : ''}`,
        async onSubmit(d) {
            const name = String(d.name || '').trim();
            if (!name) throw bad('Номро нависед.');
            if (S.locations.some(x => (!l || String(x.id) !== String(l.id)) && norm(x.name) === norm(name))) throw bad('Чунин ном аллакай ҳаст.');
            await saveLocation(l, { name, location_type: d.type });
            toast('Сабт шуд');
        }
    });
    if (!l) return;
    $('[data-toggle]', m.el).onclick = async () => {
        try {
            if (isActive(l)) {
                const left = S.products.filter(p => qtyAt(p.id, l.id) !== 0).length;
                if (left) throw bad(`Дар ин ҷо ${fmt(left)} мол бақия дорад. Аввал онро интиқол диҳед.`);
                if (activeLocs().length < 2) throw bad('Ақаллан як ҷой бояд фаъол бошад.');
            }
            await saveLocation(l, { status: isActive(l) ? 'INACTIVE' : 'ACTIVE' });
            toast('Сабт шуд');
            m.close();
        } catch (e) { m.fail(errText(e)); }
    };
    const del = $('[data-del]', m.el);
    if (del) del.onclick = async () => {
        if (activeLocs().length < 2 && isActive(l)) return m.fail('Ақаллан як ҷой бояд боқӣ монад.');
        const yes = await ask({ title: 'Нест кардани ҷой', text: `«${l.name}» аз ҷадвал нест мешавад.`, ok: 'Нест кардан', danger: true });
        if (!yes) return;
        try { await deleteLocation(l); toast('Ҷой нест карда шуд'); m.close(); }
        catch (e) { m.fail(errText(e)); }
    };
}

function cfgName() {
    formModal({
        title: 'Номи ширкат', size: 'sm',
        body: field('Ном', `<input type="text" name="v" value="${esc(S.cfg.company_name)}" maxlength="40" data-auto autocomplete="off">`),
        async onSubmit(d) {
            const v = String(d.v || '').trim();
            if (!v) throw bad('Номро нависед.');
            await setSetting('company_name', v, 'Номи ширкат дар барнома');
            toast('Сабт шуд');
        }
    });
}
function cfgLow() {
    formModal({
        title: 'Огоҳии кам мондани мол', size: 'sm',
        body: field('Миқдор', `<input type="text" inputmode="decimal" name="v" value="${esc(S.cfg.low_stock_default)}" data-auto autocomplete="off">`, 'Барои як мол метавонед дар корти он ҳадди алоҳида гузоред.'),
        async onSubmit(d) {
            if (String(d.v).trim() === '' || num(d.v) < 0) throw bad('Рақамро дуруст нависед.');
            await setSetting('low_stock_default', num(d.v), 'Агар бақияи мол аз ин рақам кам бошад, «кам мондааст» нишон дода мешавад');
            toast('Сабт шуд');
        }
    });
}
function cfgPass() {
    formModal({
        title: 'Логин ва парол', size: 'sm',
        body: `${field('Пароли ҳозира', '<input type="password" name="cur" autocomplete="current-password" data-auto>')}
            ${field('Логин', `<input type="text" name="login" value="${esc(S.user)}" autocomplete="username" autocapitalize="none" spellcheck="false">`)}
            ${field('Пароли нав', '<input type="password" name="pass" autocomplete="new-password">', 'Агар паролро иваз кардан нахоҳед, холӣ гузоред.')}`,
        async onSubmit(d) {
            if (!String(d.cur || '').trim()) throw bad('Пароли ҳозираро нависед.');
            const r = await serverCall('/password', { current: d.cur, login: d.login, pass: d.pass });
            startSession({ user: r.user, sheet: S.sheet });
            toast('Логин ва парол сабт шуд');
            renderPage();
        }
    });
}

/* ==================================================================
   ТУГМАҲО
   ================================================================== */
const ACT = {
    go: el => go(el.dataset.page, Object.fromEntries(['only', 'loc', 'status'].filter(k => el.dataset[k]).map(k => [k, el.dataset[k]]))),
    sale: el => docModal('sale', el.dataset.id ? prodBy(el.dataset.id) : null),
    buy: el => docModal('buy', el.dataset.id ? prodBy(el.dataset.id) : null),
    move: el => docModal('move', el.dataset.id ? prodBy(el.dataset.id) : null),
    fix: el => fixModal(el.dataset.id ? prodBy(el.dataset.id) : null, S.f.loc || ''),
    prodNew: () => productForm(),
    prodView: el => productView(el.dataset.id),
    prodEdit: el => productForm(prodBy(el.dataset.id)),
    txView: el => txView(el.dataset.id),
    locNew: () => locForm(),
    locEdit: el => locForm(locBy(el.dataset.id)),
    debtNew: el => debtForm(null, el.dataset.id ? custBy(el.dataset.id) : null),
    debtorView: el => debtorView(el.dataset.id),
    debtPay: el => payForm(custBy(el.dataset.id)),
    navMore: () => moreSheet(),
    expNew: () => expenseForm(),
    expEdit: el => expenseForm(S.exp.find(x => String(x.id) === el.dataset.id)),
    fToggle(el) {
        S.fOpen = !S.fOpen;
        $$('.f-more').forEach(x => x.classList.toggle('open', S.fOpen));
        el.setAttribute('aria-expanded', S.fOpen);
    },
    homePeriod(el) { S.homeK = el.dataset.k; renderPage(); },
    repPeriod(el) { Object.assign(S.rep, { k: el.dataset.k, from: '', to: '' }); renderPage(); },
    repClear() { Object.assign(S.rep, { from: '', to: '', loc: '', cat: '', q: '', ecat: '' }); renderPage(); },
    repTab(el) { S.rep.tab = el.dataset.tab; renderPage(); window.scrollTo(0, 0); },
    repOpen(el) {
        Object.assign(S.rep, { tab: el.dataset.tab, k: S.homeK, from: '', to: '' });
        go('rep', S.f);
    },
    repPlace(el) { S.rep.loc = String(S.rep.loc) === el.dataset.id ? '' : el.dataset.id; renderPage(); },
    repCsv() {
        if (!S.csv || !S.csv.rows.length) return toast('Дар ин бахш ҷадвал нест.', 'err');
        const cell = v => `"${String(v).replace(/"/g, '""')}"`;
        const text = [S.csv.cols, ...S.csv.rows.map(r => r.c)].map(r => r.map(cell).join(';')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' }));
        a.download = `DELUS-${S.csv.name}-${today()}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    cfgName, cfgLow, cfgPass,
    logout: async () => { if (await ask({ title: 'Аз барнома баромадан?', ok: 'Баромадан' })) logout(); },
    theme(el) {
        const dark = getTheme() !== 'dark';
        setTheme(dark ? 'dark' : 'light');
        el.classList.toggle('dark', dark);
        el.setAttribute('aria-checked', dark);
        const t = $('[data-theme-t]');
        if (t) t.textContent = dark ? 'Торик' : 'Рӯшан';
    },
    more: () => { S.limit += PAGE_SIZE; renderBody(); },
    chip(el) {
        const { key, k } = el.dataset;
        if (k) S.f[key] = k; else delete S.f[key];
        if (key === 'when') { delete S.f.from; delete S.f.to; }
        S.limit = PAGE_SIZE;
        renderPage();
    },
    clearQ() {
        delete S.f.q;
        S.limit = PAGE_SIZE;
        renderPage();
    },
    locFilter(el) {
        if (String(S.f.loc) === el.dataset.id) delete S.f.loc; else S.f.loc = el.dataset.id;
        S.limit = PAGE_SIZE;
        renderBody();
    },
    dayTx: el => go('tx', { from: el.dataset.a, to: el.dataset.b, ...(S.page === 'rep' && S.rep.loc ? { loc: S.rep.loc } : {}) }),
    sync: async () => {
        try { await sync(); toast('Маълумот нав шуд'); } catch (e) { showErr(e); }
    }
};

document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACT[el.dataset.act];
    if (!fn) return;
    if (el.closest('.ov')) Modal.closeAll();
    fn(el);
});

let filterTimer = 0;
document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset && el.dataset.r && el.closest('#view')) {
        S.rep[el.dataset.r] = el.value;
        if (el.dataset.r === 'q') { clearTimeout(filterTimer); filterTimer = setTimeout(renderBody, 160); }
        else if (el.type === 'date') { $$('#pageHead .chip.on').forEach(c => c.classList.remove('on')); renderBody(); }
        else renderPage();
        syncFilterUi();
        return;
    }
    if (!el.dataset || !el.dataset.f || !el.closest('#view')) return;
    const k = el.dataset.f, v = el.value;
    if (v) S.f[k] = v; else delete S.f[k];
    S.limit = PAGE_SIZE;
    if (k === 'q') {
        const x = $('.search-x', el.parentElement);
        if (x) x.hidden = !v;
        clearTimeout(filterTimer);
        filterTimer = setTimeout(renderBody, 120);
    } else if (k === 'from' || k === 'to') {
        delete S.f.when;
        $$('#pageHead .chip.on').forEach(c => c.classList.remove('on'));
        renderBody();
        syncFilterUi();
    } else {
        renderPage();
    }
});

/* ==================================================================
   ВОРИДШАВӢ ВА ОҒОЗ
   ================================================================== */
/* me: ҷавоби сервер { user, sheet }. Дар localStorage танҳо ном ва рақами ҷадвал мемонад, парол не. */
function startSession(me) {
    S.user = String(me.user).trim().toLowerCase();
    S.sheet = me.sheet || '';
    try { localStorage.setItem('delus.auth', JSON.stringify({ user: S.user, sheet: S.sheet })); } catch (e) { }
    $('#userName').textContent = S.user;
    S.seq++;
}

function showLogin(msg = '') {
    $('#boot').hidden = true;
    $('#app').hidden = true;
    $('#login').hidden = false;
    const err = $('#loginError');
    err.textContent = msg;
    err.hidden = !msg;
}

function logout(msg = '') {
    if (S.user) serverCall('/logout', {}).catch(() => { });
    Modal.closeAll();
    localStorage.removeItem('delus.auth');
    Local.clear('kv');
    Local.clear('img');
    IMG.clear();
    Object.assign(S, { user: null, sheet: '', sig: '', products: [], locations: [], tx: [], txSorted: [], exp: [], debts: [], pays: [], f: {}, page: 'home' });
    reindexDebts();
    Object.assign(S.rep, { tab: 'all', k: 'month', from: '', to: '', loc: '', cat: '', q: '', ecat: '' });
    S.homeK = 'today';
    $('#view').innerHTML = '';
    $('#loginPass').value = '';
    showLogin(msg);
}

/* Хатои воридшавӣ: паём ва ларзиши кӯтоҳи корт, то корбар фавран бинад */
function loginFail(text, focus) {
    const err = $('#loginError'), card = $('#loginForm');
    err.textContent = text;
    err.hidden = false;
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    if (focus) focus.focus();
}

$('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#loginBtn'), label = $('.lb-t', btn), err = $('#loginError');
    const userEl = $('#loginUser'), passEl = $('#loginPass');
    const user = userEl.value.trim(), pass = passEl.value.trim();
    err.hidden = true;
    if (!user) return loginFail('Логини худро нависед.', userEl);
    if (!pass) return loginFail('Пароли худро нависед.', passEl);
    btn.disabled = true;
    btn.classList.add('busy');
    label.textContent = 'Ворид мешавад…';
    try {
        startSession(await serverCall('/login', { user, pass }));
        await enterApp();
    } catch (ex) {
        loginFail(errText(ex), ex.status === 401 ? passEl : null);
        if (ex.status === 401) passEl.select();
    } finally {
        btn.disabled = false;
        btn.classList.remove('busy');
        label.textContent = 'Ворид шудан';
    }
});

/* Паролро нишон додан ё пинҳон кардан */
$('#pwEye').addEventListener('click', () => {
    const inp = $('#loginPass'), b = $('#pwEye'), show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', show);
    b.setAttribute('aria-label', show ? 'Паролро пинҳон кардан' : 'Паролро нишон додан');
    inp.focus({ preventScroll: true });
});
/* Огоҳӣ: агар ҳарфҳои калон фаъол бошанд, парол нодуруст навишта мешавад */
['keydown', 'keyup'].forEach(ev => $('#loginPass').addEventListener(ev, e => {
    if (e.getModifierState) $('#capsWarn').hidden = !e.getModifierState('CapsLock');
}));
$('#loginPass').addEventListener('blur', () => { $('#capsWarn').hidden = true; });
$('#loginUser').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !$('#loginPass').value) { e.preventDefault(); $('#loginPass').focus(); }
});

function showApp() {
    $('#boot').hidden = true;
    $('#login').hidden = true;
    $('#app').hidden = false;
    const k = location.hash.slice(1);
    if (NAV.some(n => n.k === k)) S.page = k;
    renderPage();
}

async function enterApp() {
    const user = S.user;
    const snap = await Local.get('kv', 'snapshot');
    /* Ҳангоми хондани маълумоти маҳаллӣ сервер гуфта метавонад, ки сессия тамом шуд — он вақт барнома кушода намешавад */
    if (!S.user || S.user !== user) return;
    if (snap) {
        applyData(snap);
        S.sig = JSON.stringify(snap);
        showApp();
        loadImages();
        syncQuiet();
        return;
    }
    await sync();
    if (S.user) { showApp(); loadImages(); }
}

setInterval(() => { if (S.user && !document.hidden) syncQuiet(); }, 60000);
document.addEventListener('visibilitychange', () => {
    if (S.user && !document.hidden && Date.now() - S.syncedAt > 20000) syncQuiet();
});
window.addEventListener('online', () => { if (S.user) syncQuiet(); });

const startFailed = e => { console.error(e); S.user = null; showLogin(errText(e)); };

(async function init() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('delus.auth')); } catch (e) { }
    const me = serverCall('/me');
    me.catch(() => { });

    /* Дар ин дастгоҳ касе ворид нашудааст: экрани воридшавӣ фавран, бе интизори сервер.
       Агар сессия дар сервер ҳаст (масалан, хотираи браузер тоза шуда буд), барнома худаш кушода мешавад. */
    if (!saved || !saved.user) {
        showLogin();
        me.then(r => { if (r.user && !S.user) { startSession(r); enterApp().catch(startFailed); } }, () => { });
        return;
    }

    /* Корбари шинос ва маълумоти маҳаллӣ ҳаст: барнома фавран кушода мешавад, сессия дар замина санҷида мешавад */
    if (await Local.get('kv', 'snapshot')) {
        startSession(saved);
        me.then(r => {
            if (!r.user) logout('Вақти воридшавӣ гузашт. Аз нав ворид шавед.');
            else if (r.sheet && r.sheet !== S.sheet) { startSession(r); if (S.page === 'set') renderPage(); }
        }, e => { if (e.noServer) setOffline('server'); });
        enterApp().catch(startFailed);
        return;
    }

    /* Маълумоти маҳаллӣ нест: аввал сессияро месанҷем */
    try {
        const r = await me;
        if (!r.user) { localStorage.removeItem('delus.auth'); return showLogin(); }
        startSession(r);
    } catch (e) {
        return showLogin(e.noServer ? MSG.noServer : errText(e));
    }
    enterApp().catch(startFailed);
})();
