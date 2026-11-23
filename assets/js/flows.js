/* DELUS — амалиётҳо, тугмаҳо ва оғози барнома */
'use strict';

/* ==================================================================
   ҶУСТУҶӮИ МОЛ ДАР ТИРЕЗАҲО
   ================================================================== */
function matchProducts(q, limit = 8) {
    const n = norm(q);
    if (!n) return [];
    return activeProds()
        .filter(p => hasAll(`${p.name} ${p.product_code} ${p.category} ${p.description}`, q))
        .sort((a, b) => (norm(a.name).startsWith(n) ? 0 : 1) - (norm(b.name).startsWith(n) ? 0 : 1) || String(a.name).localeCompare(String(b.name), 'ru'))
        .slice(0, limit);
}

/* Молҳои бештар истифодашуда — аввал */
function quickProducts(limit = 10) {
    const n = new Map();
    S.tx.forEach(x => { const k = String(x.product_id); n.set(k, (n.get(k) || 0) + 1); });
    return [...activeProds()].sort((a, b) => (n.get(String(b.id)) || 0) - (n.get(String(a.id)) || 0) || String(a.name).localeCompare(String(b.name), 'ru')).slice(0, limit);
}

/* Каталоги мол дар тиреза: ҷустуҷӯ ва аксҳои мол, ҳамеша дар пеши чашм.
   Бе ҷустуҷӯ — молҳои бештар истифодашуда, бо ҷустуҷӯ — натиҷаҳо.
   Пахш кардани акс молро илова мекунад; badge(p) рақами болои аксро медиҳад («×2» — чанд адад дар сабад). */
function mountPicker(root, { onPick, onNew, stockAt, price, badge, first, max = 12 }) {
    root.innerHTML = `<div class="pick"><div class="search">${ic('search', 17)}
        <input type="search" data-auto placeholder="Ном ё рамзи молро нависед" autocomplete="off" enterkeyhint="search" aria-label="Ҷустуҷӯи мол">
        <button type="button" class="search-x" data-clear aria-label="Тоза кардани ҷустуҷӯ" hidden>${ic('x', 15)}</button></div>
        <div class="pick-grid"></div><p class="pick-more" hidden></p></div>`;
    const inp = $('input', root), grid = $('.pick-grid', root), more = $('.pick-more', root), clr = $('[data-clear]', root);
    let items = [], hot = 0;

    function tile(it, i, q) {
        const h = q && i === hot ? 'hot' : '';
        if (it.isNew) return `<button type="button" class="pick-i new ${h}" data-i="${i}">
            <span class="thumb">${ic('plus', 22)}</span><span class="pt-n">Моли нав: «${esc(it.q)}»</span><span class="pt-m"><small>Ба рӯйхат илова мешавад</small></span></button>`;
        const p = it.p, have = stockAt ? qtyAt(p.id, stockAt()) : qtyAll(p.id), b = badge ? badge(p) : '';
        return `<button type="button" class="pick-i ${b ? 'in' : ''} ${h}" data-i="${i}" title="${esc(p.name)}">
            ${thumb(p)}${b ? `<span class="pt-c">${esc(b)}</span>` : ''}
            <span class="pt-n">${esc(p.name)}</span>
            <span class="pt-m"><b>${price ? fmt(price(p), 2) : ''}</b><small class="${have <= 0 ? 'neg' : ''}">${qty(have)} ${esc(unitOf(p))}</small></span></button>`;
    }
    function draw() {
        const q = inp.value.trim();
        /* Ҷойи плиткаҳо иваз намешавад (пахши такрорӣ ҳамон молро илова мекунад).
           Моле, ки дар сабад ҳаст, вале дар рӯйхати асосӣ нест, дар охир меистад, то рақами «×2»-и он намоён бошад. */
        let found;
        if (q) found = matchProducts(q, 30);
        else {
            const base = quickProducts(max), inCart = first ? first().filter(p => isActive(p) && !base.includes(p)) : [];
            found = [...base, ...inCart];
        }
        items = found.map(p => ({ p }));
        if (onNew && q && !found.some(p => norm(p.name) === norm(q))) items.unshift({ isNew: true, q });
        hot = Math.min(hot, Math.max(items.length - 1, 0));
        grid.innerHTML = items.map((it, i) => tile(it, i, q)).join('') || '<div class="pick-none">Чунин мол нест. Номро дигар хел нависед.</div>';
        clr.hidden = !q;
        const all = activeProds().length;
        more.hidden = !!q || all <= found.length;
        more.textContent = `Боз ${fmt(all - found.length)} мол ҳаст — барои ёфтан номашро нависед.`;
    }
    /* Пахши плитка ҷустуҷӯро нигоҳ медорад: боз пахш — боз як адад. Enter (клавиатура) илова мекунад ва барои моли навбатӣ тоза мекунад. */
    function choose(i, clear) {
        const it = items[i];
        if (!it) return;
        const q = inp.value.trim();
        if (clear || it.isNew) { inp.value = ''; hot = 0; }
        if (it.isNew) onNew(it.q); else onPick(it.p);
        draw();
        if (clear && q && matchMedia('(hover: hover)').matches) inp.focus();
    }
    clr.addEventListener('click', () => { inp.value = ''; hot = 0; draw(); inp.focus(); });
    inp.addEventListener('input', () => { hot = 0; draw(); });
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); if (inp.value.trim()) choose(hot, true); }
        else if (e.key === 'ArrowDown' && items.length && inp.value.trim()) { e.preventDefault(); hot = (hot + 1) % items.length; draw(); }
        else if (e.key === 'ArrowUp' && items.length && inp.value.trim()) { e.preventDefault(); hot = (hot - 1 + items.length) % items.length; draw(); }
    });
    grid.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choose(+b.dataset.i); });
    root.refresh = draw;
    draw();
}

/* ==================================================================
   ФУРӮШ, ВОРИДОТ, ИНТИҚОЛ — як тирезаи умумӣ
   ================================================================== */
const DOCS = {
    sale: { title: 'Фурӯш', sub: 'Молҳоро пахш кунед — ба сабад илова мешаванд', icon: 'sale', tone: 'tone-sale' },
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
        title: DOCS[kind].title, sub: DOCS[kind].sub, icon: DOCS[kind].icon, tone: DOCS[kind].tone, size: 'xl', footClass: 'wrap',
        submitClass: kind === 'sale' ? 'sale-solid' : 'primary',
        footExtra: '<div class="total"><span data-count></span><span><b data-total></b><small data-extra></small></span></div>',
        body: `<div class="doc">
            <div class="doc-l">${locHtml}
                <div class="field"><span class="field-l">Молҳо <em>(${kind === 'buy' ? 'пахш кунед ё номи моли навро нависед' : 'ҳар пахш — як адад'})</em></span><div data-pick></div></div>
            </div>
            <div class="doc-r">
                <div class="doc-cart-h"><span>${ic(kind === 'move' ? 'move' : 'sale', 16)}${kind === 'sale' ? 'Сабад' : kind === 'buy' ? 'Моли омада' : 'Барои интиқол'}</span><small data-count2></small></div>
                <div class="lines" data-lines></div>
                ${payHtml}
                <details class="extra"><summary>${ic('right', 14)}Сана ва эзоҳ</summary>${dateF}
                ${field('Эзоҳ <em>(ихтиёрӣ)</em>', `<input type="text" name="note" maxlength="200" placeholder="${kind === 'sale' ? 'Номи мизоҷ ё рақами телефон' : 'Масалан: мошини 80-AA-123'}">`)}</details>
            </div>
        </div>`,
        onSubmit: data => saveDoc(kind, lines, data)
    });

    const box = $('[data-lines]', m.el), pick = $('[data-pick]', m.el);
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
        $('[data-count2]', m.el).textContent = n ? `${fmt(n)} мол` : '';
        if (pick.refresh) pick.refresh();
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
        if (!lines.length) {
            box.innerHTML = `<div class="lines-empty">${ic('tag', 20)}<span>${kind === 'sale' ? 'Сабад холӣ аст. Молро аз рӯйхат пахш кунед — ҳар пахш як адад илова мекунад.' : 'Молро аз рӯйхат пахш кунед. Миқдор ва нарх дар ин ҷо пайдо мешаванд.'}</span></div>`;
            drawTotals();
            return;
        }
        box.innerHTML = lines.map((l, i) => {
            const u = esc(unitOf(l.p));
            return `<div class="line" data-i="${i}">
                <div class="line-h">${thumb(l.p, 'sm')}
                    <span class="mini-b"><b>${esc(l.p.name)}</b><span class="line-c" data-c></span></span>
                    <button type="button" class="line-x" data-rm aria-label="Аз сабад хориҷ кардан">${ic('x', 16)}</button></div>
                <div class="line-f">
                    <div class="line-q"><span class="field-l">Миқдор (${u})</span>
                        <div class="qty"><button type="button" data-step="-1" aria-label="Кам кардан">${ic('minus', 15)}</button>
                        <input type="text" inputmode="decimal" data-v="q" value="${esc(l.q)}" aria-label="Миқдор (${u})">
                        <button type="button" data-step="1" aria-label="Зиёд кардан">${ic('plus', 15)}</button></div></div>
                    ${kind === 'sale' ? field(`Нархи 1 ${u}`, `<input type="text" inputmode="decimal" data-v="price" value="${esc(l.price)}">`) : ''}
                    ${kind === 'buy' ? field(`Нархи хариди 1 ${u}`, `<input type="text" inputmode="decimal" data-v="cost" value="${esc(l.cost)}">`) + field(`Нархи фурӯши 1 ${u}`, `<input type="text" inputmode="decimal" data-v="price" value="${esc(l.price)}">`) : ''}
                    ${kind === 'move' ? '' : '<span class="line-t" data-t></span>'}
                </div>
                ${kind === 'sale' ? '' : `<div class="qchips">${quickChips(l)}</div>`}
                <div class="line-w" data-w hidden></div>
            </div>`;
        }).join('');
        drawTotals();
    }
    function addLine(p) {
        let i = lines.findIndex(l => String(l.p.id) === String(p.id));
        if (i >= 0) lines[i].q = round3(num(lines[i].q) + 1);
        else { lines.push({ p, q: 1, price: num(p.sale_price) || '', cost: num(p.purchase_price) || '' }); i = lines.length - 1; }
        drawLines();
        const row = box.children[i];
        if (row) { row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
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

    mountPicker(pick, {
        stockAt: srcLoc,
        price: kind === 'move' ? null : p => kind === 'buy' ? num(p.purchase_price) : num(p.sale_price),
        badge: p => { const l = lines.find(x => String(x.p.id) === String(p.id)); return l ? '×' + qty(num(l.q)) : ''; },
        first: () => lines.map(l => prodBy(l.p.id) || l.p),
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
                title: 'Ин қадар мол дар анбор нест',
                text: `${short.map(l => `${l.p.name}: дар анбор ҳамагӣ ${qty(qtyAt(l.p.id, src))} ${unitOf(l.p)} мондааст`).join('; ')}. Бо вуҷуди ин мефурӯшед? Ҳисоби мол дар анбор манфӣ мешавад.`,
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
            ${field('Дар асл чанд ҳаст?', '<input type="text" inputmode="decimal" name="real" autocomplete="off">', 'Агар рақам бо система фарқ кунад, барнома ҳисоби молро дуруст мекунад ва фарқро дар «Амалиётҳо» сабт мекунад.')}
            ${field('Эзоҳ <em>(ихтиёрӣ)</em>', '<input type="text" name="note" maxlength="200" placeholder="Масалан: мол шикаста буд">')}`,
        async onSubmit(d) {
            if (!prod) throw bad('Молро интихоб кунед.');
            if (String(d.real).trim() === '') throw bad('Миқдори воқеиро нависед.');
            const now = qtyAt(prod.id, d.loc), real = num(d.real), diff = round3(real - now);
            if (!diff) { toast('Миқдори мол дуруст аст, тағйир лозим нест.'); return; }
            await addTx([{
                date: nowStr(), type: 'ADJUSTMENT', product_id: prod.id,
                from_location_id: diff < 0 ? num(d.loc) : '', to_location_id: diff > 0 ? num(d.loc) : '',
                quantity: Math.abs(diff), unit: unitOf(prod),
                unit_cost: num(prod.purchase_price), unit_price: num(prod.sale_price),
                note: String(d.note || '').trim() || `Шумориш: ${qty(now)} → ${qty(real)}`
            }]);
            toast('Ҳисоби мол дуруст шуд');
        }
    });
    const cur_ = $('[data-cur]', m.el), loc = $('[name=loc]', m.el);
    const draw = () => {
        cur_.hidden = !prod;
        if (prod) cur_.textContent = `${prod.name}: дар система ${qty(qtyAt(prod.id, loc.value))} ${unitOf(prod)}`;
    };
    const pk = $('[data-pick]', m.el);
    loc.addEventListener('change', () => { draw(); if (pk.refresh) pk.refresh(); });
    mountPicker(pk, {
        stockAt: () => loc.value,
        badge: p => prod && String(prod.id) === String(p.id) ? '✓' : '',
        onPick: p => { prod = p; draw(); $('[name=real]', m.el).focus(); }
    });
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
    /* акс шояд ҳанӯз бор нашуда бошад: ҷояш тайёр аст, акс пас аз омадан худаш пайдо мешавад ва калон мешавад */
    const hasPhoto = !!imgSrc(p) || String(p.image_url || '').startsWith('img:');
    const m = Modal.open({
        title: 'Маълумоти мол', icon: 'tag', tone: 'tone-buy',
        body: `<div class="pv-photo ${hasPhoto ? '' : 'none'}">${hasPhoto ? `<button type="button" class="pv-zoom" data-zoom aria-label="Аксро калон кардан">${thumb(p, 'cover')}<span class="pv-zoom-i">${ic('search', 15)}Калон кардан</span></button>` : `${thumb(p, 'cover')}<button class="btn sm pv-add" data-act="prodEdit" data-id="${esc(p.id)}">${ic('camera', 15)}Акс гузоштан</button>`}</div>
        <div class="pv-head"><b>${esc(p.name)}</b><small>${esc([p.product_code, p.category].filter(Boolean).join(' · '))}</small></div>
        <div class="facts">
            <div><small>Дар анбор</small><b>${qty(qtyAll(p.id))} ${esc(unitOf(p))}</b></div>
            <div><small>Нархи фурӯш</small><b>${fmt(p.sale_price, 2)}</b></div>
            <div><small>Нархи харид</small><b>${fmt(p.purchase_price, 2)}</b></div>
            <div><small>Фоида аз 1 ${esc(unitOf(p))}</small><b>${fmt(profit, 2)}</b></div>
        </div>
        ${on ? `<div class="quick">
            <button class="btn t-sale" data-act="sale" data-id="${esc(p.id)}">${ic('sale', 16)}Фурӯш</button>
            <button class="btn t-buy" data-act="buy" data-id="${esc(p.id)}">${ic('in', 16)}Воридот</button>
            <button class="btn t-move" data-act="move" data-id="${esc(p.id)}">${ic('move', 16)}Интиқол</button>
        </div>` : ''}
        <div class="sec-h"><p class="sec-t">Мол дар анбор ва мағоза</p>${on ? `<button class="btn quiet sm" data-act="fix" data-id="${esc(p.id)}">Миқдор нодуруст аст?</button>` : ''}</div>
        ${S.locations.filter(l => isActive(l) || qtyAt(p.id, l.id) !== 0).map(l => `<div class="kv"><span>${esc(l.name)}</span><b class="${qtyAt(p.id, l.id) < 0 ? 'neg' : ''}">${qty(qtyAt(p.id, l.id))} ${esc(unitOf(p))}</b></div>`).join('')}
        ${specs.length ? `<p class="sec-t">Хусусиятҳо</p>${specs.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}` : ''}
        ${p.description ? `<p class="sec-t">Тавсиф</p><p class="card-p" style="margin:6px 0 0">${esc(p.description)}</p>` : ''}
        ${hist.length ? `<p class="sec-t">Амалиётҳои охирин</p>${hist.slice(0, 6).map(x => `<button class="mini" data-act="txView" data-id="${esc(x.id)}">
            <span class="tile sm ${esc(x.type)}">${ic((TYPES[x.type] || TYPES.ADJUSTMENT).icon, 15)}</span>
            <span class="mini-b"><b>${(TYPES[x.type] || { t: x.type }).t}</b><small>${esc(dayLabel(dayOf(x)))} · ${esc(txRoute(x))}</small></span>
            <span class="mini-v">${txQty(x, p)}<small>${money(txValue(x))}</small></span></button>`).join('')}` : ''}`,
        foot: `<button type="button" class="btn danger lg" data-del>${ic('trash', 16)}Нест кардан</button>
            <button class="btn primary lg" data-act="prodEdit" data-id="${esc(p.id)}">${ic('edit', 16)}Тағйир додан</button>`
    });
    const z = $('[data-zoom]', m.el);
    if (z) z.onclick = () => { if (imgSrc(p)) photoZoom(imgSrc(p), p.name); else toast('Акс ҳоло бор мешавад…'); };
    $('[data-del]', m.el).onclick = () => removeProducts([p], () => m.close());
}

/* Акси калон: пахш — калон мешавад (боз пахш — бармегардад), бо ду ангушт ё чархаки муш — калон/хурд, кашидан — ҳаракат */
function photoZoom(src, title = '') {
    if (!src) return;
    const m = Modal.open({
        title: title || 'Акс', sub: 'Пахш кунед — калон мешавад. Бо ду ангушт ҳам калон кардан мумкин аст.', size: 'zoom',
        body: `<div class="zoom" data-z><img src="${esc(src)}" alt="${esc(title)}" draggable="false"></div>`
    });
    const box = $('[data-z]', m.el), img = $('img', box);
    let s = 1, x = 0, y = 0;
    const apply = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${s})`; box.classList.toggle('on', s > 1.01); };
    const clamp = () => {
        const r = box.getBoundingClientRect(), mx = r.width * (s - 1) / 2, my = r.height * (s - 1) / 2;
        x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
    };
    const zoomTo = (ns, cx, cy) => {
        ns = Math.max(1, Math.min(5, ns));
        const r = box.getBoundingClientRect(), ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2;
        x = ox - (ox - x) * ns / s; y = oy - (oy - y) * ns / s; s = ns;
        if (s <= 1.01) { s = 1; x = 0; y = 0; }
        clamp(); apply();
    };
    const pts = new Map();
    let base = null, moved = false;
    const snap = () => {
        const v = [...pts.values()];
        return v.length >= 2
            ? { d: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y), cx: (v[0].x + v[1].x) / 2, cy: (v[0].y + v[1].y) / 2, s, x, y }
            : { px: v[0].x, py: v[0].y, s, x, y };
    };
    box.addEventListener('pointerdown', e => {
        box.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        base = snap(); moved = false;
        box.classList.add('drag');
    });
    box.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const now = snap();
        if (base.d && now.d) {
            moved = true;
            s = base.s; x = base.x; y = base.y;
            zoomTo(base.s * now.d / base.d, now.cx, now.cy);
        } else if (!base.d && s > 1) {
            const dx = now.px - base.px, dy = now.py - base.py;
            if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
            x = base.x + dx; y = base.y + dy; clamp(); apply();
        } else if (!base.d && Math.abs(now.px - base.px) + Math.abs(now.py - base.py) > 6) moved = true;
    });
    const up = e => {
        if (!pts.has(e.pointerId)) return;
        const single = pts.size === 1;
        pts.delete(e.pointerId);
        if (pts.size) { base = snap(); return; }
        box.classList.remove('drag');
        if (single && !moved && e.type === 'pointerup') { if (s > 1) zoomTo(1, e.clientX, e.clientY); else zoomTo(2.5, e.clientX, e.clientY); }
    };
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    box.addEventListener('wheel', e => { e.preventDefault(); zoomTo(s * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX, e.clientY); }, { passive: false });
    return m;
}

/* Нест кардани як ё якчанд мол.
   Агар мол таърих (фурӯш, воридот) дошта бошад, аввал бойгонӣ пешниҳод мешавад: мол пинҳон мешавад, вале ҳисобот вайрон намешавад. */
async function removeProducts(list, after) {
    if (!list.length) return false;
    const ids = new Set(list.map(p => String(p.id)));
    const nTx = S.tx.filter(t => ids.has(String(t.product_id))).length;
    const one = list.length === 1;
    const what = one ? `«${list[0].name}»` : `${fmt(list.length)} мол`;
    const title = one ? 'Нест кардани мол' : `Нест кардани ${fmt(list.length)} мол`;
    const canArchive = list.some(isActive);
    let pick;
    if (!nTx) {
        pick = await ask({ title, text: `${what} аз ҷадвал нест мешавад. ${one ? 'Ин мол' : 'Ин молҳо'} ҳанӯз ягон амалиёт надорад, бинобар ин ҳисобот тағйир намеёбад.`, ok: 'Нест кардан', danger: true }) ? 'delete' : null;
    } else {
        pick = await choose({
            title,
            text: `${what} ${fmt(nTx)} амалиёт (фурӯш, воридот, интиқол) дорад. Агар пурра нест кунед, ин амалиётҳо ҳам нест мешаванд ва ҳисоботи гузашта иваз мешавад.${canArchive ? ' Беҳтар аст ба бойгонӣ гузоред: мол аз рӯйхат пинҳон мешавад, вале таърих мемонад.' : ''}`,
            options: [...(canArchive ? [['archive', 'Ба бойгонӣ гузоштан (тавсия)', 'primary']] : []), ['delete', 'Пурра нест кардан', 'danger-solid']]
        });
    }
    if (!pick) return false;
    try {
        if (pick === 'archive') {
            await setProductsStatus(list.filter(isActive), 'INACTIVE');
            toast(one ? 'Мол ба бойгонӣ гузошта шуд' : `${fmt(list.length)} мол ба бойгонӣ гузошта шуд`);
        } else {
            await deleteProducts(list);
            toast(one ? 'Мол нест карда шуд' : `${fmt(list.length)} мол нест карда шуд`);
        }
    } catch (e) { showErr(e); return false; }
    if (after) after(pick);
    return true;
}

/* Амал бо молҳои интихобшуда дар саҳифаи «Молҳо» */
async function selRun(what) {
    const list = [...S.sel].map(prodBy).filter(Boolean);
    if (!list.length) return toast('Аввал молро интихоб кунед.', 'err');
    const done = () => { S.selOn = false; S.sel.clear(); renderPage(); };
    if (what === 'delete') { if (await removeProducts(list)) done(); return; }
    try {
        const status = what === 'restore' ? 'ACTIVE' : 'INACTIVE';
        await setProductsStatus(list, status);
        toast(status === 'ACTIVE' ? `${fmt(list.length)} мол аз бойгонӣ баргардонида шуд` : `${fmt(list.length)} мол ба бойгонӣ гузошта шуд`);
        done();
    } catch (e) { showErr(e); }
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
            ${field('Миқдори ҳозира дар анбор <em>(ихтиёрӣ)</em>', '<input type="text" inputmode="decimal" name="opening" autocomplete="off">')}
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
                    text: `«${twin.name}» аллакай дар система ҳаст ва ҳоло ${qty(qtyAll(twin.id))} ${unitOf(twin)} мавҷуд аст. Моли омадаро ба ҳамин мол илова кунем?`,
                    options: [['add', `Ба «${twin.name}» илова кардан`, 'primary'], ['new', 'Не, моли нав аст (алоҳида сабт шавад)', '']]
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
                    quantity: open, unit: saved.unit, unit_cost: saved.purchase_price, unit_price: saved.sale_price, note: 'Моли мавҷуда (воридоти аввал)'
                }]), 'Мол сабт шуд, вале миқдори аввал сабт нашуд. Метавонед онро бо «Воридот» илова кунед.')) return;
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
    th.addEventListener('click', () => { const src = photo || (removed ? '' : imgSrc(v)); if (src) photoZoom(src, String($('[name=name]', m.el).value || v.name || '')); });

    if (editing) {
        $('[data-archive]', m.el).onclick = async () => {
            const toArchive = isActive(p), q = qtyAll(p.id);
            if (toArchive && q !== 0) {
                const yes = await ask({ title: 'Ин мол ҳанӯз дар анбор ҳаст', text: `Дар анбор ${qty(q)} ${unitOf(p)} аз «${p.name}» мондааст. Агар ба бойгонӣ гузоред, мол аз рӯйхат пинҳон мешавад. Розиед?`, ok: 'Ба бойгонӣ гузоштан' });
                if (!yes) return;
            }
            try {
                await updateProduct(p, { status: toArchive ? 'INACTIVE' : 'ACTIVE' });
                toast(toArchive ? 'Мол ба бойгонӣ гузошта шуд' : 'Мол баргардонида шуд');
                m.close();
            } catch (e) { m.fail(errText(e)); }
        };
        $('[data-delete]', m.el).onclick = () => removeProducts([p], () => m.close());
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
            text: `${T.t} (${x.transaction_code}) нест карда мешавад ва ҳисоби молҳо аз нав дуруст мешавад.${debt ? ` Ин чек ба қарзи «${debt.customer}» вобаста аст — қарзро дар бахши «Қарз» дуруст кунед.` : ''}`,
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
                if (left) throw bad(`Дар ин ҷо ҳанӯз ${fmt(left)} мол ҳаст. Аввал молҳоро ба анбори дигар гузаронед, баъд нест кунед.`);
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
            await setSetting('low_stock_default', num(d.v), 'Агар миқдори мол аз ин кам шавад, огоҳӣ медиҳад, ки мол кам мондааст');
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
    debtReceipt: el => debtReceipt(el.dataset.id),
    selMode() { S.selOn = !S.selOn; S.sel.clear(); renderPage(); },
    selToggle(el) { const id = el.dataset.id; if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); renderBody(); },
    selAll() {
        const ids = filterProducts().map(p => String(p.id)), all = ids.length && ids.every(id => S.sel.has(id));
        ids.forEach(id => { if (all) S.sel.delete(id); else S.sel.add(id); });
        renderBody();
    },
    selCancel() { S.selOn = false; S.sel.clear(); renderPage(); },
    selArchive: () => selRun('archive'),
    selRestore: () => selRun('restore'),
    selDelete: () => selRun('delete'),
    async xlsx(el) {
        if (el.classList.contains('busy')) return;
        const label = $('.set-go', el), was = label ? label.innerHTML : '';
        el.classList.add('busy');
        if (label) label.innerHTML = '<span class="lb-spin"></span>Омода мешавад…';
        try {
            const out = await exportProductsXlsx();
            toast(`Excel омода шуд: ${fmt(out.count)} мол${out.images ? `, ${fmt(out.images)} акс` : ''}`);
        } catch (e) { showErr(e); }
        finally { el.classList.remove('busy'); if (label) label.innerHTML = was; }
    },
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
    if (!user) return loginFail('Номи корбарро (логин) нависед.', userEl);
    if (!pass) return loginFail('Рамзро (парол) нависед.', passEl);
    btn.disabled = true;
    btn.classList.add('busy');
    label.textContent = 'Санҷиш ва воридшавӣ…';
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
