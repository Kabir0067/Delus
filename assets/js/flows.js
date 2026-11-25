/* DELUS — амалиётҳо, тугмаҳо ва оғози барнома */
'use strict';

/* ==================================================================
   ҶУСТУҶӮИ МОЛ ДАР ТИРЕЗАҲО
   ================================================================== */
/* Беҳтарин мувофиқат аввал: номе, ки бо ҳамин калима сар мешавад, баъд хатои хурд, баъд номҳои маъмул (чароғ → лампа) */
function matchProducts(q, limit = 8) {
    if (!norm(q)) return [];
    const hit = findByCode(q);
    if (hit && isActive(hit)) return [hit];
    return rankBy(activeProds(), prodText, q).slice(0, limit);
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
function mountPicker(root, { onPick, onNew, onCode, stockAt, price, badge, first, max = 12 }) {
    root.innerHTML = `<div class="pick"><div class="search ${onCode ? 'has-scan' : ''}">${ic('search', 17)}
        <input type="search" data-auto placeholder="Номи мол ё штрихкод" autocomplete="off" enterkeyhint="search" aria-label="Ҷустуҷӯи мол">
        <button type="button" class="search-x" data-clear aria-label="Тоза кардани ҷустуҷӯ" hidden>${ic('x', 15)}</button>
        ${onCode ? `<button type="button" class="search-scan" data-scan aria-label="Скани штрихкод бо камера" title="Скан бо камера">${ic('scan', 20)}</button>` : ''}</div>
        <div class="pick-grid"></div><p class="pick-more" hidden></p></div>`;
    const inp = $('input', root), grid = $('.pick-grid', root), more = $('.pick-more', root), clr = $('[data-clear]', root);
    if (onCode) $('[data-scan]', root).onclick = () => scanCode({ title: 'Скан: ҳар қуттӣ як адад', multi: true, onCode });
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
        more.textContent = `Боз ${fmt(all - found.length)} мол ҳаст. Барои ёфтан номашро нависед ё штрихкодро скан кунед.`;
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
    sale: { title: 'Фурӯш', sub: 'Молро пахш кунед, ба сабад меравад', icon: 'sale', tone: 'tone-sale' },
    buy: { title: 'Воридот', sub: 'Моли омада ба анбор', icon: 'in', tone: 'tone-buy' },
    move: { title: 'Интиқол', sub: 'Мол аз як ҷой ба ҷойи дигар', icon: 'move', tone: 'tone-move' }
};

/* Гурӯҳи тугмаҳо бо сарлавҳа (на <label>: пахши сарлавҳа тугмаи аввалро пахш намекунад) */
const group = (label, inner) => `<div class="field"><span class="field-l">${label}</span>${inner}</div>`;

/* Ҷой бо тугмаҳо, на рӯйхати кушодашаванда: як пахш ва ҳамаи ҷойҳо дар пеши чашм.
   count(l) — чанд мол дар он ҷо (ихтиёрӣ). Арзиш дар <input type=hidden name=…> аст. */
function placeSeg(name, sel, count) {
    return `<div class="place-seg" data-place="${name}" role="radiogroup">${activeLocs().map(l => {
        const on = String(l.id) === String(sel), n = count ? count(l) : null;
        return `<button type="button" role="radio" aria-checked="${on}" class="${on ? 'on' : ''}" data-id="${esc(l.id)}">
            ${ic(l.location_type === 'Shop' ? 'sale' : 'box', 15)}<span>${esc(l.name)}</span>${n !== null ? `<small class="${n <= 0 ? 'neg' : ''}">${qty(n)}</small>` : ''}</button>`;
    }).join('')}</div><input type="hidden" name="${name}" value="${esc(sel)}">`;
}
document.addEventListener('click', e => {
    const b = e.target.closest('.place-seg [data-id]');
    if (!b) return;
    const seg = b.closest('.place-seg'), inp = seg.nextElementSibling;
    $$('[data-id]', seg).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    if (inp.value === b.dataset.id) return;
    inp.value = b.dataset.id;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
});

/* Пардохт: нақд ё ба қарз (насия) */
const payBlock = () => `
    ${group('Пардохт', `<div class="seg pay-seg" role="radiogroup" aria-label="Пардохт">
        <button type="button" class="on" data-pay="cash" role="radio" aria-checked="true">${ic('wallet', 16)}Нақд</button>
        <button type="button" data-pay="debt" role="radio" aria-checked="false">${ic('debt', 16)}Ба қарз (насия)</button>
    </div><input type="hidden" name="pay" value="cash">`)}
    <div class="debt-box" data-debt-box hidden>
        <div class="grid2">
            ${field('Номи мизоҷ', `<input type="text" name="debt_customer" list="debtCustList" maxlength="80" autocomplete="off" placeholder="Масалан: Фирӯз Раҳимов">`)}
            ${field('Телефон', '<input type="tel" name="debt_phone" inputmode="tel" maxlength="20" autocomplete="off" placeholder="+992 …">')}
        </div>
        <div class="grid2">
            ${field('Ҳозир медиҳад <em>(ихтиёрӣ)</em>', '<input type="text" inputmode="decimal" name="debt_prepay" data-numpad data-np-label="Ҳозир чанд медиҳад?" autocomplete="off" placeholder="0">')}
            ${field('То кай медиҳад <em>(ихтиёрӣ)</em>', `<input type="date" name="debt_due" min="${today()}">`)}
        </div>
        ${custDatalist('debtCustList')}
    </div>`;
function wirePay(root, changed) {
    const seg = $('.pay-seg', root), box = $('[data-debt-box]', root), val = $('[name=pay]', root), who = $('[name=debt_customer]', root), tel = $('[name=debt_phone]', root);
    seg.addEventListener('click', e => {
        const b = e.target.closest('[data-pay]');
        if (!b) return;
        $$('[data-pay]', seg).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
        val.value = b.dataset.pay;
        box.hidden = b.dataset.pay !== 'debt';
        if (!box.hidden) { who.focus(); box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        changed();
    });
    $('[name=debt_prepay]', root).addEventListener('input', changed);
    /* Номи мизоҷи шинос → телефонаш худ аз худ пур мешавад */
    who.addEventListener('input', () => {
        const c = customers().find(x => norm(x.name) === norm(who.value));
        if (c && c.phone && !tel.value) tel.value = c.phone;
    });
}

/* Майдони рақам бо сарлавҳаи хурд дар дохил */
const nbox = (label, key, val, chips = '') => `<label class="nbox"><span class="nbox-l">${label}</span>
    <input type="text" inputmode="decimal" data-v="${key}" data-numpad data-np-label="${esc(label)}" ${chips ? `data-np-chips="${esc(chips)}"` : ''} value="${esc(val)}" autocomplete="off"></label>`;

function docModal(kind, preset = null, start = {}) {
    const locs = activeLocs();
    if (!locs.length) return toast('Аввал дар «Танзимот» анбор илова кунед.', 'err');
    if (kind === 'move' && locs.length < 2) return toast('Барои интиқол ақаллан ду ҷой лозим аст.', 'err');

    const shop = shopLoc();
    const wh = locs.find(l => l.location_type !== 'Shop') || locs[0];
    const other = locs.find(l => String(l.id) !== String(wh.id));
    const toDefault = String(shop.id) !== String(wh.id) ? shop : other;
    const lines = [];
    const saleLoc = start.loc || (preset ? saleLocFor(preset) : saleLocFor(null));

    const locHtml = kind === 'sale' ? group('Аз куҷо мефурӯшед', placeSeg('loc', saleLoc))
        : kind === 'buy' ? group('Ба куҷо омад', placeSeg('loc', wh.id))
            : `<div class="route">${group('Аз куҷо', placeSeg('from', wh.id))}${group('Ба куҷо', placeSeg('to', toDefault.id))}</div>`;

    const m = formModal({
        title: DOCS[kind].title, sub: DOCS[kind].sub, icon: DOCS[kind].icon, tone: DOCS[kind].tone, size: 'xl', footClass: 'wrap',
        submitClass: kind === 'sale' ? 'sale-solid' : 'primary',
        footExtra: '<div class="total" data-tocart role="button" tabindex="0" aria-label="Ба сабад рафтан"><span data-count></span><span><b data-total></b><small data-extra></small></span></div>',
        body: `<div class="doc">
            <div class="doc-l">${locHtml}
                ${group(`Молҳо <em>(${kind === 'buy' ? 'пахш кунед ё номи моли навро нависед' : 'ҳар пахш як адад'})</em>`, '<div data-pick></div>')}
            </div>
            <div class="doc-r" data-cart>
                <div class="doc-cart-h"><span>${ic(kind === 'move' ? 'move' : 'sale', 16)}${kind === 'sale' ? 'Сабад' : kind === 'buy' ? 'Моли омада' : 'Барои интиқол'}</span><small data-count2></small></div>
                <div class="lines" data-lines></div>
                ${kind === 'sale' ? payBlock() : ''}
                <details class="extra"><summary>${ic('right', 14)}Сана ва эзоҳ</summary>
                ${field('Сана', `<input type="date" name="date" value="${today()}" max="${today()}">`)}
                ${field('Эзоҳ <em>(ихтиёрӣ)</em>', `<input type="text" name="note" maxlength="200" placeholder="${kind === 'sale' ? 'Номи мизоҷ ё рақами телефон' : 'Масалан: мошини 80-AA-123'}">`)}</details>
            </div>
        </div>`,
        onSubmit: data => saveDoc(kind, lines, data)
    });

    const box = $('[data-lines]', m.el), pick = $('[data-pick]', m.el);
    const sel = n => $(`[name=${n}]`, m.el);
    if (kind === 'sale') wirePay(m.el, () => drawTotals());
    const toCart = () => $('[data-cart]', m.el).scrollIntoView({ block: 'start', behavior: 'smooth' });
    $('[data-tocart]', m.el).addEventListener('click', toCart);
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
            <span>${esc(locName(to))}: ${qty(there)} → <b>${qty(round3(there + q))} ${u}</b></span>`;
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
        $('[data-count]', m.el).textContent = n ? `${fmt(n)} мол` : 'Сабад холӣ';
        $('[data-count2]', m.el).textContent = n ? `${fmt(n)} мол` : '';
        if (pick.refresh) pick.refresh();
        const total = $('[data-total]', m.el), extra = $('[data-extra]', m.el);
        if (kind === 'sale') {
            const sum = lines.reduce((s, l) => s + lineSum(l), 0);
            total.textContent = money(sum);
            extra.textContent = !n ? '' : sel('pay').value === 'debt'
                ? `Ба қарз: ${money(Math.max(0, sum - num(sel('debt_prepay').value)))}`
                : `Фоида: ${money(lines.reduce((s, l) => s + num(l.q) * (num(l.price) - num(l.p.purchase_price)), 0))}`;
        } else if (kind === 'buy') {
            total.textContent = money(lines.reduce((s, l) => s + lineSum(l), 0));
            extra.textContent = '';
        } else {
            const units = new Map();
            lines.forEach(l => units.set(unitOf(l.p), (units.get(unitOf(l.p)) || 0) + num(l.q)));
            total.textContent = [...units].map(([u, q]) => `${qty(q)} ${u}`).join(' + ') || '0';
            extra.textContent = n ? `Арзиш: ${money(lines.reduce((s, l) => s + num(l.q) * num(l.p.purchase_price), 0))}` : '';
        }
    }
    function quickChips(l) {
        const per = num(l.p.units_per_box);
        const add = per > 1 ? [`<button type="button" class="qchip" data-add="${per}">+1 қуттӣ (${qty(per)})</button>`] : [];
        if (kind === 'buy') return [...[10, 50, 100].map(n => `<button type="button" class="qchip" data-add="${n}">+${n}</button>`), ...add].join('');
        const have = Math.max(qtyAt(l.p.id, srcLoc()), 0);
        return [...[1, 5, 10].map(n => `<button type="button" class="qchip" data-set="${n}">${n}</button>`),
            ...(have > 0 ? [`<button type="button" class="qchip" data-set="${have}">Ҳама (${qty(have)})</button>`] : []), ...add].join('');
    }
    /* Калкулятор барои миқдор: рақамҳои тез ва «ҳама» */
    const qtyChips = l => {
        if (kind === 'buy') return [10, 50, 100, num(l.p.units_per_box) > 1 ? num(l.p.units_per_box) : 0].filter(Boolean).join('|');
        const have = Math.max(qtyAt(l.p.id, srcLoc()), 0);
        return [1, 2, 3, 5, 10].join('|') + (have > 0 ? `|${have}~Ҳама ${qty(have)}` : '');
    };
    function drawLines() {
        if (!lines.length) {
            box.innerHTML = `<div class="lines-empty">${ic('tag', 20)}<span>${kind === 'sale' ? 'Сабад холӣ аст. Молро аз рӯйхат пахш кунед: ҳар пахш як адад.' : 'Молро аз рӯйхат пахш кунед. Миқдор ва нарх дар ин ҷо пайдо мешаванд.'}</span></div>`;
            drawTotals();
            return;
        }
        box.innerHTML = lines.map((l, i) => {
            const u = esc(unitOf(l.p)), have = qtyAt(l.p.id, srcLoc());
            return `<div class="line" data-i="${i}">
                <div class="line-h">${thumb(l.p, 'sm')}
                    <span class="mini-b"><b>${esc(l.p.name)}</b><span class="line-c" data-c></span></span>
                    <button type="button" class="line-x" data-rm aria-label="Аз сабад хориҷ кардан" title="Хориҷ кардан">${ic('trash', 17)}</button></div>
                <div class="line-f ${kind}">
                    <div class="qty-box"><span class="nbox-l">Миқдор, ${u}</span>
                        <div class="qty"><button type="button" data-step="-1" aria-label="Кам кардан">${ic('minus', 18)}</button>
                        <input type="text" inputmode="decimal" data-v="q" data-numpad data-np-label="${esc(l.p.name)}: чанд ${u}?" data-np-hint="${kind === 'buy' ? '' : `Дар ${esc(locName(srcLoc()))}: ${qty(have)} ${u}`}" data-np-chips="${esc(qtyChips(l))}" value="${esc(l.q)}" aria-label="Миқдор (${u})">
                        <button type="button" data-step="1" aria-label="Зиёд кардан">${ic('plus', 18)}</button></div></div>
                    ${kind === 'sale' ? nbox(`Нархи 1 ${u}`, 'price', l.price, num(l.p.sale_price) ? `${num(l.p.sale_price)}~Нархи муқаррарӣ ${fmt(l.p.sale_price, 2)}` : '') : ''}
                    ${kind === 'buy' ? nbox('Нархи харид', 'cost', l.cost) + nbox('Нархи фурӯш', 'price', l.price) : ''}
                    ${kind === 'move' ? '' : '<span class="line-t" data-t></span>'}
                </div>
                ${kind === 'sale' ? '' : `<div class="qchips">${quickChips(l)}</div>`}
                <div class="line-w" data-w hidden></div>
            </div>`;
        }).join('');
        drawTotals();
    }
    function addLine(p, q = 1, price) {
        let i = lines.findIndex(l => String(l.p.id) === String(p.id));
        if (i >= 0) lines[i].q = round3(num(lines[i].q) + q);
        else { lines.push({ p, q, price: price ?? (num(p.sale_price) || ''), cost: num(p.purchase_price) || '' }); i = lines.length - 1; }
        drawLines();
        const row = box.children[i];
        if (row) { row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
        return lines[i];
    }

    box.addEventListener('focusin', e => { if (e.target.dataset.v && !e.target.readOnly) e.target.select(); });
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

    /* Скан: ҳар қуттӣ — як адад; штрихкоди нав — пайваст ба мол ё моли нав */
    const onCode = code => {
        const p = findByCode(code);
        if (p && isActive(p)) { const l = addLine(p); return `${p.name}: ${qty(num(l.q))} ${unitOf(p)}`; }
        unknownCode(code, np => addLine(np), { buy: kind === 'buy', newOk: kind === 'buy' || kind === 'sale' });
        return { stop: true };
    };
    mountPicker(pick, {
        stockAt: srcLoc,
        price: kind === 'move' ? null : p => kind === 'buy' ? num(p.purchase_price) : num(p.sale_price),
        badge: p => { const l = lines.find(x => String(x.p.id) === String(p.id)); return l ? '×' + qty(num(l.q)) : ''; },
        first: () => lines.map(l => prodBy(l.p.id) || l.p),
        onPick: p => addLine(p),
        onCode,
        onNew: kind === 'buy' ? name => productForm(null, { name, noOpening: true, onSaved: p => addLine(p) }) : null
    });
    if (preset) addLine(preset, num(start.q) || 1, start.price); else drawLines();
    return m;
}

/* Паём пас аз сабт: агар интернет набошад, мегӯяд, ки сабт дар телефон монд */
const savedToast = text => toast(S.offline || navigator.onLine === false ? `${text}. Интернет нест: сабт дар телефон нигоҳ дошта шуд ва баъд худаш ба ҷадвал меравад.` : text);

async function saveDoc(kind, lines, data) {
    if (!lines.length) throw bad('Ақаллан як мол илова кунед.');
    for (const l of lines) {
        if (num(l.q) <= 0) throw bad(`Миқдори «${l.p.name}»-ро нависед.`);
        if (kind === 'sale' && num(l.price) <= 0) throw bad(`Нархи «${l.p.name}»-ро нависед.`);
        if (kind === 'buy' && num(l.cost) < 0) throw bad('Нарх манфӣ шуда наметавонад.');
    }
    const note = String(data.note || '').trim();
    if (data.date && data.date > today()) throw bad('Санаи оянда интихоб шудааст.');
    const date = (data.date || today()) + nowStr().slice(10);
    if (kind === 'move' && String(data.from) === String(data.to)) throw bad('Ҷойи баромад ва расидан бояд гуногун бошанд.');

    /* Қарз пеш аз сабт санҷида мешавад, то фурӯш бе қарз сабт нашавад */
    const onDebt = kind === 'sale' && data.pay === 'debt';
    const saleSum = Math.round(lines.reduce((s, l) => s + num(l.q) * num(l.price), 0) * 100) / 100;
    const prepay = onDebt ? Math.round(num(data.debt_prepay) * 100) / 100 : 0;
    if (onDebt) {
        if (!String(data.debt_customer || '').trim()) throw bad('Номи мизоҷро нависед, ки қарз гирифт.');
        if (prepay < 0) throw bad('Маблағи пешпардохт нодуруст аст.');
        if (prepay >= saleSum) throw bad('Пешпардохт ба маблағи пурра баробар аст. «Нақд»-ро интихоб кунед.');
    }

    if (kind !== 'buy') {
        const src = kind === 'sale' ? data.loc : data.from;
        const short = lines.filter(l => num(l.q) > qtyAt(l.p.id, src));
        if (short.length) {
            const go_ = await ask({
                title: 'Ин қадар мол дар анбор нест',
                text: `${short.map(l => `${l.p.name}: дар ${locName(src)} ҳамагӣ ${qty(qtyAt(l.p.id, src))} ${unitOf(l.p)} мондааст`).join('; ')}. Бо вуҷуди ин сабт мекунед? Ҳисоби мол манфӣ мешавад.`,
                ok: 'Сабт кардан'
            });
            if (!go_) return false;
        }
    }

    const now = nowStr();
    const base = l => ({ date, product_id: l.p.id, quantity: num(l.q), unit: unitOf(l.p), note, created_at: now });
    const op = { receipt: kind === 'sale' };
    if (kind === 'sale') {
        op.tx = lines.map(l => ({ ...base(l), type: 'SALE', from_location_id: num(data.loc), to_location_id: '', unit_cost: num(l.p.purchase_price), unit_price: num(l.price) }));
        try { localStorage.setItem(SALE_LOC, String(data.loc)); } catch (e) { }
    } else if (kind === 'buy') {
        op.tx = lines.map(l => ({ ...base(l), type: 'PURCHASE', from_location_id: '', to_location_id: num(data.loc), unit_cost: num(l.cost), unit_price: num(l.price) }));
        /* Агар ҳангоми қабул нарх иваз шуда бошад, дар корти мол ҳам иваз мешавад */
        op.prices = lines.filter(l => num(l.cost) !== num(l.p.purchase_price) || num(l.price) !== num(l.p.sale_price))
            .map(l => ({ id: l.p.id, purchase_price: num(l.cost), sale_price: num(l.price) }));
    } else {
        op.tx = lines.map(l => ({ ...base(l), type: 'TRANSFER', from_location_id: num(data.from), to_location_id: num(data.to), unit_cost: num(l.p.purchase_price), unit_price: num(l.p.sale_price) }));
    }
    let customer = '';
    if (onDebt) {
        customer = String(data.debt_customer).trim();
        op.debt = { customer, phone: String(data.debt_phone || '').trim(), amount: saleSum, paid: 0, status: 'OPEN', date, due_date: data.debt_due || '', receipt_code: '', note, created_at: now };
        if (prepay > 0) op.pays = [{ debt_id: '$debt', amount: prepay, method: 'CASH', note: 'Пешпардохт', date, created_at: now }];
    }
    const what = lines.length === 1 ? `«${lines[0].p.name}»` : `${fmt(lines.length)} мол`;
    queueOp(kind === 'sale' ? `Фурӯш ${what}, ${money(saleSum)}` : kind === 'buy' ? `Воридот ${what}` : `Интиқол ${what}`, op);
    if (onDebt) savedToast(`Фурӯш ба қарз сабт шуд. ${customer} қарздор: ${money(saleSum - prepay)}`);
    else savedToast(kind === 'sale' ? `Фурӯш сабт шуд: ${money(saleSum)}` : kind === 'buy' ? 'Воридот сабт шуд' : 'Интиқол сабт шуд');
}

/* ==================================================================
   ФУРӮШИ ТЕЗ: як мол, ду пахш
   Корти мол → «Фурӯш» → «Фурӯхтан». Ҷой, нарх ва нақд худ аз худ интихоб шудаанд.
   ================================================================== */
const SALE_LOC = 'delus.saleLoc';
/* Ҷойи фурӯш: охирин ҷойи истифодашуда ё мағоза. Агар он ҷо ин мол набошад, ҷое, ки мол ҳаст. */
function saleLocFor(p, need = 1) {
    const locs = activeLocs();
    let last = '';
    try { last = localStorage.getItem(SALE_LOC) || ''; } catch (e) { }
    const pref = [locs.find(l => String(l.id) === last), shopLoc()].filter(Boolean);
    if (!p) return (pref[0] || locs[0]).id;
    const has = l => qtyAt(p.id, l.id) >= need;
    return (pref.find(has) || [...locs].sort((a, b) => qtyAt(p.id, b.id) - qtyAt(p.id, a.id)).find(l => qtyAt(p.id, l.id) > 0) || pref[0] || locs[0]).id;
}

function quickSale(p0) {
    const p = p0 && (prodBy(p0.id) || p0);
    if (!p) return;
    if (!activeLocs().length) return toast('Аввал дар «Танзимот» анбор илова кунед.', 'err');
    const u = esc(unitOf(p)), price0 = num(p.sale_price);
    const many = activeLocs().length > 1;
    const m = formModal({
        title: 'Фурӯш', icon: 'sale', tone: 'tone-sale', submit: 'Фурӯхтан', submitClass: 'sale-solid', size: 'qs', footClass: 'wrap',
        footExtra: '<div class="total"><span data-have></span><span><b data-total></b><small data-extra></small></span></div>',
        body: `<div class="qs-p">${thumb(p, 'qs')}<span class="qs-n"><b>${esc(p.name)}</b><small>${esc([p.category, p.product_code].filter(Boolean).join(' · '))}</small></span></div>
            ${many ? group('Аз куҷо', placeSeg('loc', saleLocFor(p), l => qtyAt(p.id, l.id))) : `<input type="hidden" name="loc" value="${esc(activeLocs()[0].id)}">`}
            <div class="qs-row">
                <div class="qty-box big"><span class="nbox-l">Чанд ${u}</span>
                    <div class="qty"><button type="button" data-step="-1" aria-label="Кам кардан">${ic('minus', 22)}</button>
                    <input type="text" inputmode="decimal" name="q" value="1" data-numpad data-np-label="Чанд ${u}?" data-np-hint="${esc(p.name)}" autocomplete="off" aria-label="Миқдор">
                    <button type="button" data-step="1" aria-label="Зиёд кардан">${ic('plus', 22)}</button></div></div>
                <label class="nbox big"><span class="nbox-l">Нархи 1 ${u}</span><input type="text" inputmode="decimal" name="price" value="${esc(price0 || '')}" data-numpad data-np-label="Нархи 1 ${u}" ${price0 ? `data-np-chips="${esc(`${price0}~Нархи муқаррарӣ ${fmt(price0, 2)}`)}"` : ''} autocomplete="off"></label>
            </div>
            <div class="qchips qs-chips" data-chips></div>
            <div class="line-w" data-w hidden></div>
            ${payBlock()}
            <button type="button" class="btn quiet block qs-more" data-more>${ic('plus', 16)}Боз мол илова кардан (дар як чек)</button>`,
        onSubmit: d => saveDoc('sale', [{ p, q: d.q, price: d.price }], d)
    });
    const sel = n => $(`[name=${n}]`, m.el);
    const q = sel('q'), pr = sel('price'), chips = $('[data-chips]', m.el), warn = $('[data-w]', m.el);
    const draw = () => {
        const have = qtyAt(p.id, sel('loc').value), n = num(q.value), sum = n * num(pr.value);
        $('[data-have]', m.el).textContent = `Дар ${locName(sel('loc').value)}: ${qty(have)} ${unitOf(p)}`;
        $('[data-total]', m.el).textContent = money(sum);
        $('[data-extra]', m.el).textContent = sel('pay').value === 'debt'
            ? `Ба қарз: ${money(Math.max(0, sum - num(sel('debt_prepay').value)))}` : `Фоида: ${money(n * (num(pr.value) - num(p.purchase_price)))}`;
        warn.hidden = n <= have;
        warn.textContent = `Дар ин ҷо ҳамагӣ ${qty(have)} ${unitOf(p)} ҳаст.`;
        chips.innerHTML = [1, 2, 3, 5, 10].map(k => `<button type="button" class="qchip ${n === k ? 'on' : ''}" data-set="${k}">${k}</button>`).join('')
            + (have > 1 ? `<button type="button" class="qchip ${n === have ? 'on' : ''}" data-set="${have}">Ҳама (${qty(have)})</button>` : '');
        $('[data-save]', m.el).textContent = sum > 0 ? `Фурӯхтан · ${money(sum)}` : 'Фурӯхтан';
    };
    wirePay(m.el, draw);
    m.el.addEventListener('input', e => { if (e.target === q || e.target === pr) draw(); });
    sel('loc').addEventListener('change', draw);
    m.el.addEventListener('click', e => {
        const b = e.target.closest('[data-step], [data-set]');
        if (!b || !m.el.contains(b) || b.closest('.line')) return;
        q.value = b.dataset.step ? Math.max(0, round3(num(q.value) + +b.dataset.step)) : num(b.dataset.set);
        draw();
    });
    $('[data-more]', m.el).onclick = () => {
        const start = { q: num(q.value) || 1, price: pr.value, loc: sel('loc').value };
        m.close();
        docModal('sale', p, start);
    };
    draw();
    return m;
}

/* ---------- Ислоҳи бақия ---------- */
function fixModal(preset = null, locId = '') {
    const locs = activeLocs();
    if (!locs.length) return toast('Аввал дар «Танзимот» анбор илова кунед.', 'err');
    let prod = preset;
    const m = formModal({
        title: 'Шумориши мол', sub: 'Молро шуморед ва миқдори воқеиро нависед', icon: 'fix', tone: 'tone-warn',
        body: `${group('Ҷой', placeSeg('loc', locId || (preset ? saleLocFor(preset) : locs[0].id)))}
            ${group('Мол', '<div data-pick></div>')}
            <div class="note" data-cur style="margin-top:14px" hidden></div>
            ${field('Дар асл чанд ҳаст?', '<input type="text" inputmode="decimal" name="real" data-numpad data-np-label="Дар асл чанд ҳаст?" autocomplete="off">', 'Агар рақам бо ҳисоби барнома фарқ кунад, барнома ҳисобро дуруст мекунад ва фарқро дар «Амалиётҳо» сабт мекунад.')}
            ${field('Эзоҳ <em>(ихтиёрӣ)</em>', '<input type="text" name="note" maxlength="200" placeholder="Масалан: мол шикаста буд">')}`,
        async onSubmit(d) {
            if (!prod) throw bad('Молро интихоб кунед.');
            if (String(d.real).trim() === '') throw bad('Миқдори воқеиро нависед.');
            const now = qtyAt(prod.id, d.loc), real = num(d.real), diff = round3(real - now);
            if (!diff) { toast('Миқдори мол дуруст аст, тағйир лозим нест.'); return; }
            queueOp(`Шумориши «${prod.name}»`, {
                tx: [{
                    date: nowStr(), type: 'ADJUSTMENT', product_id: prod.id,
                    from_location_id: diff < 0 ? num(d.loc) : '', to_location_id: diff > 0 ? num(d.loc) : '',
                    quantity: Math.abs(diff), unit: unitOf(prod),
                    unit_cost: num(prod.purchase_price), unit_price: num(prod.sale_price),
                    note: String(d.note || '').trim() || `Шумориш: ${qty(now)} → ${qty(real)}`, created_at: nowStr()
                }]
            });
            savedToast('Ҳисоби мол дуруст шуд');
        }
    });
    const cur_ = $('[data-cur]', m.el), loc = $('[name=loc]', m.el);
    const draw = () => {
        cur_.hidden = !prod;
        if (prod) cur_.textContent = `${prod.name}: дар барнома ${qty(qtyAt(prod.id, loc.value))} ${unitOf(prod)}`;
    };
    const pk = $('[data-pick]', m.el), real = $('[name=real]', m.el);
    const chosen = p => {
        prod = p;
        draw();
        if (pk.refresh) pk.refresh();
        if (real.readOnly) openNumpad(real, { label: `${p.name}: дар асл чанд ҳаст?`, hint: `Дар барнома: ${qty(qtyAt(p.id, loc.value))} ${unitOf(p)}` });
        else real.focus();
    };
    loc.addEventListener('change', () => { draw(); if (pk.refresh) pk.refresh(); });
    mountPicker(pk, {
        stockAt: () => loc.value,
        badge: p => prod && String(prod.id) === String(p.id) ? '✓' : '',
        onPick: chosen,
        onCode: code => {
            const p = findByCode(code);
            if (p) { setTimeout(() => chosen(p), 250); return { msg: p.name, stop: true }; }
            setTimeout(() => unknownCode(code, chosen, { newOk: false }), 250);
            return { stop: true };
        }
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
        <div class="pv-head"><b>${esc(p.name)}</b><small>${esc([p.product_code, p.category, ...codesOf(p)].filter(Boolean).join(' · '))}</small></div>
        <div class="facts">
            <div><small>Дар анбор</small><b>${qty(qtyAll(p.id))} ${esc(unitOf(p))}</b></div>
            <div><small>Нархи фурӯш</small><b>${fmt(p.sale_price, 2)}</b></div>
            <div><small>Нархи харид</small><b>${fmt(p.purchase_price, 2)}</b></div>
            <div><small>Фоида аз 1 ${esc(unitOf(p))}</small><b>${fmt(profit, 2)}</b></div>
        </div>
        ${on ? `<div class="quick">
            <button class="btn sale-solid" data-act="quick" data-id="${esc(p.id)}">${ic('sale', 16)}Фурӯш</button>
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
        title: title || 'Акс', sub: 'Пахш кунед, калон мешавад. Бо ду ангушт ҳам калон кардан мумкин аст.', size: 'zoom',
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

function productForm(p = null, { name = '', barcode = '', noOpening = false, onSaved } = {}) {
    const editing = !!p;
    const v = p || { name, unit: 'дона', barcode };
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
            ${field('Нархи харид', `<input type="text" inputmode="decimal" name="purchase_price" value="${numVal(v.purchase_price)}" data-numpad autocomplete="off">`)}
            ${field('Нархи фурӯш', `<input type="text" inputmode="decimal" name="sale_price" value="${numVal(v.sale_price)}" data-numpad autocomplete="off">`)}
        </div>
        ${field('Штрихкод <em>(ихтиёрӣ)</em>', `<span class="in-btn"><input type="text" name="barcode" value="${esc(v.barcode || '')}" inputmode="numeric" maxlength="200" autocomplete="off" placeholder="Рақами зери штрихкод">
            <button type="button" class="btn t-buy" data-scancode>${ic('scan', 18)}Скан</button></span>`, 'Штрихкоди қуттиро скан кунед: баъд мол бо камера дар як сония ёфт мешавад.')}
        ${!editing && !noOpening ? `<div class="grid2">
            ${field('Миқдори ҳозира дар анбор <em>(ихтиёрӣ)</em>', '<input type="text" inputmode="decimal" name="opening" data-numpad autocomplete="off">')}
            ${field('Дар куҷо', `<select name="opening_loc">${locOptions((activeLocs().find(l => l.location_type !== 'Shop') || activeLocs()[0] || {}).id)}</select>`)}
        </div>` : ''}
        <details class="extra" ${extra ? 'open' : ''}>
            <summary>${ic('right', 14)}Маълумоти иловагӣ</summary>
            <div class="grid2">
                ${field('Рамзи мол', `<input type="text" name="product_code" value="${esc(v.product_code)}" maxlength="40" placeholder="Худкор" autocomplete="off">`)}
                ${field('Ҳадди кам', `<input type="text" inputmode="decimal" name="min_stock" data-numpad value="${numVal(v.min_stock)}" placeholder="${esc(qty(S.cfg.low_stock_default))}" autocomplete="off">`)}
            </div>
            <div class="grid2">
                ${field('Силсила', `<input type="text" name="series" value="${esc(v.series)}" maxlength="80" autocomplete="off">`)}
                ${field('Ранг', `<input type="text" name="color" value="${esc(v.color)}" maxlength="40" autocomplete="off">`)}
            </div>
            <div class="grid2">
                ${field('Шумораи ҷойҳо', `<input type="text" inputmode="numeric" name="mesta" value="${numVal(v.mesta)}" autocomplete="off">`)}
                ${field('Шумораи тугмаҳо', `<input type="text" inputmode="numeric" name="taga" value="${numVal(v.taga)}" autocomplete="off">`)}
            </div>
            ${field('Дар як қуттӣ', `<input type="text" inputmode="decimal" name="units_per_box" data-numpad value="${numVal(v.units_per_box)}" autocomplete="off">`)}
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
            const codes = [...new Set(String(d.barcode || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))];
            for (const c of codes) {
                const used = others.find(x => codesOf(x).includes(c));
                if (used) throw bad(`Штрихкоди ${c} аллакай ба «${used.name}» пайваст аст.`);
            }
            if (codes.length || (p && codesOf(p).length)) {
                await ensureBarcodeCol();
                if (!head('Products').includes('barcode')) throw bad('Сутуни штрихкод дар ҷадвал сохта нашуд. Интернетро санҷед ва боз кӯшиш кунед.');
            }
            /* Агар чунин мол ҳаст, нусхаи дуюм сохта намешавад — моли нав ба бақияи ҳамон мол илова мегардад */
            const twin = others.find(x => isActive(x) && norm(x.name) === norm(nm));
            if (twin && (!p || norm(p.name) !== norm(nm))) {
                const pickTwin = await choose({
                    title: 'Ин мол аллакай ҳаст',
                    text: `«${twin.name}» аллакай дар рӯйхат ҳаст ва ҳоло ${qty(qtyAll(twin.id))} ${unitOf(twin)} мавҷуд аст. Моли омадаро ба ҳамин мол илова кунем?`,
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
                min_stock: String(d.min_stock || '').trim() === '' ? '' : num(d.min_stock),
                ...(head('Products').includes('barcode') ? { barcode: codes.join(' ') } : {})
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
                if (open > 0 && d.opening_loc) queueOp(`Миқдори аввали «${saved.name}»`, {
                    tx: [{
                        date: nowStr(), type: 'PURCHASE', product_id: saved.id, from_location_id: '', to_location_id: num(d.opening_loc),
                        quantity: open, unit: saved.unit, unit_cost: saved.purchase_price, unit_price: saved.sale_price, note: 'Моли мавҷуда (воридоти аввал)', created_at: nowStr()
                    }]
                });
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
                    ? `Акс омода шуд: ${r.size}×${r.size}, ${r.kb} КБ. Акси аслӣ хурд аст. Барои сифати беҳтар акси калонтар гиред.`
                    : `Акс омода шуд: ${r.size}×${r.size}, ${r.kb} КБ. Ҳангоми «Сабт кардан» ба ҷадвал меравад.`;
            } catch (e) {
                hint.className = 'photo-h';
                hint.textContent = '';
                m.fail(errText(e));
            }
        };
    });
    rm.onclick = () => { photo = null; removed = true; show(''); };
    $('[data-scancode]', m.el).onclick = async () => {
        const code = await scanCode({ title: 'Скани штрихкоди мол' });
        if (!code) return;
        const inp = $('[name=barcode]', m.el), have = inp.value.split(/[\s,;]+/).filter(Boolean);
        if (!have.includes(code)) inp.value = [...have, code].join(' ');
        const used = findByCode(code);
        if (used && (!p || String(used.id) !== String(p.id))) m.fail(`Штрихкоди ${code} аллакай ба «${used.name}» пайваст аст.`);
    };
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
    /* Сабти навбат ҳанӯз дар ҷадвал нест: танҳо бекор кардан мумкин аст */
    if (x._q && isQueued(x.id)) return queuedView(x, T, rows);
    const m = Modal.open({
        title: T.t, sub: [x.transaction_code, showCode(x.receipt_code)].filter(Boolean).join(' · '), icon: T.icon,
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
            text: `${T.t} (${x.transaction_code}) нест карда мешавад ва ҳисоби молҳо аз нав дуруст мешавад.${debt ? ` Ин чек ба қарзи «${debt.customer}» вобаста аст. Қарзро дар бахши «Қарз» дуруст кунед.` : ''}`,
            ok: 'Нест кардан', danger: true
        });
        if (!yes) return;
        try { await deleteTx(x); toast('Амалиёт нест карда шуд'); m.close(); }
        catch (e) { showErr(e); }
    };
}

function queuedView(x, T, rows) {
    const j = Q.list.find(q => q.id === x._q);
    const all = S.tx.filter(t => t._q === x._q);
    const m = Modal.open({
        title: T.t, sub: j && j.state === 'fail' ? 'Сабт нашуд' : 'Ҳанӯз ба ҷадвал нарафтааст', icon: T.icon, tone: 'tone-warn',
        body: `<div class="note warn" style="margin-bottom:12px">${ic('sync', 16)}<span>${j && j.state === 'fail' ? esc(j.err) : 'Ин сабт дар телефон аст ва ҳамин ки интернет бошад, худаш ба ҷадвал меравад. Пас аз он тағйир додан ва нест кардан мумкин мешавад.'}</span></div>
            ${rows.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}
            ${all.length > 1 ? `<p class="sec-t">Дар ин сабт ${fmt(all.length)} мол ҳаст</p>` : ''}`,
        foot: `${j && j.state !== 'send' ? `<button type="button" class="btn danger" data-cancel-job>${ic('trash', 16)}Бекор кардан</button>` : ''}
            <button type="button" class="btn primary" data-send>${ic('sync', 16)}Ҳозир фиристодан</button>`
    });
    const c = $('[data-cancel-job]', m.el);
    if (c) c.onclick = async () => {
        const yes = await ask({ title: 'Сабтро бекор кардан?', text: `«${j.label}» ба ҷадвал намеравад ва аз барнома нест мешавад.`, ok: 'Бекор кардан', cancel: 'Не', danger: true });
        if (!yes) return;
        if (cancelJob(j.id)) { toast('Сабт бекор карда шуд'); m.close(); }
        else toast('Ин сабт ҳозир фиристода мешавад. Пас аз фиристодан онро нест кардан мумкин аст.', 'err');
    };
    $('[data-send]', m.el).onclick = async () => { m.close(); if (j) await retryJob(j.id); };
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
                ${field(`Миқдор (${esc(x.unit || unitOf(p))})`, `<input type="text" inputmode="decimal" data-numpad name="quantity" value="${esc(x.quantity)}" autocomplete="off">`)}
                <span></span>
            </div>
            <div class="grid2">
                ${field('Нархи харид', `<input type="text" inputmode="decimal" data-numpad name="unit_cost" value="${esc(x.unit_cost)}" autocomplete="off">`)}
                ${field('Нархи фурӯш', `<input type="text" inputmode="decimal" data-numpad name="unit_price" value="${esc(x.unit_price)}" autocomplete="off">`)}
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
        title: 'Бозгашти мол', sub: `${p.name || ''} · ${x.transaction_code}`, icon: 'back', tone: 'tone-bad', size: 'sm',
        body: `${onDebt ? `<div class="note warn" style="margin-bottom:14px">${ic('debt', 16)}<span>Ин мол ба қарз фурӯхта шуда буд. Маблағи бозгашт аз қарзи «${esc(debt.customer)}» кам мешавад (боқимонда ${money(debt._left)}).</span></div>` : ''}
            <div class="grid2">
                ${field(`Миқдор (то ${qty(left)})`, `<input type="text" inputmode="decimal" data-numpad name="quantity" value="${esc(left)}" data-numpad data-np-chips="${esc(left)}~Ҳама ${esc(qty(left))}" data-auto autocomplete="off">`)}
            </div>
            ${group('Мол ба куҷо бармегардад', placeSeg('loc', isActive(locBy(x.from_location_id) || {}) ? x.from_location_id : shopLoc().id))}
            ${field('Сабаб <em>(ихтиёрӣ)</em>', '<input type="text" name="note" maxlength="200">')}`,
        submit: 'Бозгашт кардан',
        async onSubmit(d) {
            const q = num(d.quantity);
            if (q <= 0) throw bad('Миқдорро нависед.');
            if (q > left) throw bad(`Зиёда аз ${qty(left)} баргардонидан мумкин нест.`);
            const why = String(d.note || '').trim();
            const sum = Math.round(q * num(x.unit_price) * 100) / 100;
            const now = nowStr();
            /* бозгашт ва камшавии қарз дар як сабт: ё ҳарду, ё ҳеҷ кадом */
            const off = onDebt ? Math.min(sum, I.debt.get(String(debt.id))._left) : 0;
            queueOp(`Бозгашти «${p.name || 'мол'}»`, {
                tx: [{
                    date: now, type: 'RETURN', product_id: x.product_id, from_location_id: '', to_location_id: num(d.loc),
                    quantity: q, unit: x.unit, unit_cost: num(x.unit_cost), unit_price: num(x.unit_price),
                    note: `Бозгашт аз ${x.transaction_code}${why ? ' · ' + why : ''}`, receipt_code: x.receipt_code, created_at: now
                }],
                pays: off > 0 ? [{ debt_id: debt.id, amount: off, method: 'RETURN', note: `Бозгашти мол аз ${x.transaction_code}`, date: now, created_at: now }] : []
            });
            savedToast(off > 0 ? `Бозгашт сабт шуд. Қарзи ${debt.customer} ${money(off)} кам шуд` : `Бозгашт сабт шуд: ${money(sum)}`);
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
                ${field(`Маблағ (${esc(cur())})`, `<input type="text" inputmode="decimal" data-numpad name="amount" value="${esc(e ? e.amount : '')}" data-numpad data-np-label="Чанд пул сарф шуд?" data-auto autocomplete="off">`)}
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
            savedToast(`Хароҷот сабт шуд: ${money(amount_)}`);
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
        body: field('Миқдор', `<input type="text" inputmode="decimal" data-numpad name="v" value="${esc(S.cfg.low_stock_default)}" data-auto autocomplete="off">`, 'Барои як мол метавонед дар корти он ҳадди алоҳида гузоред.'),
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
    quick: el => quickSale(prodBy(el.dataset.id)),
    /* Скан дар саҳифаи «Молҳо» ва «Анбор»: мол кушода мешавад */
    async scanSearch() {
        const code = await scanCode({ title: 'Ҷустуҷӯ бо штрихкод' });
        if (!code) return;
        const p = findByCode(code);
        if (p) return productView(p.id);
        unknownCode(code, np => productView(np.id));
    },
    qRetry: el => retryJob(el.dataset.id || ''),
    async qDrop(el) {
        const j = Q.list.find(x => x.id === el.dataset.id);
        if (!j) return;
        if (!await ask({ title: 'Ин сабтро нест кунем?', text: `«${j.label}» ба ҷадвал нарафт. Агар нест кунед, он аз барнома пок мешавад ва ҳисоби мол бармегардад.`, ok: 'Нест кардан', cancel: 'Не', danger: true })) return;
        if (cancelJob(j.id)) toast('Сабт нест карда шуд');
    },
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
    logout: async () => {
        const n = qWaiting().length + qFailed().length;
        if (await ask({ title: 'Аз барнома баромадан?', text: n ? `${fmt(n)} сабт ҳанӯз ба ҷадвал нарафтааст. Онҳо дар ин телефон мемонанд ва пас аз воридшавии навбатӣ фиристода мешаванд.` : '', ok: 'Баромадан' })) logout();
    },
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
        try {
            Q.wait = 0;
            await flush();
            await sync();
            const n = qWaiting().length;
            toast(n ? `Маълумот нав шуд. ${fmt(n)} сабт ҳанӯз дар навбат аст.` : 'Маълумот нав шуд');
        } catch (e) { showErr(e); }
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
    /* навбати сабт пок намешавад: пас аз воридшавӣ худаш меравад */
    Local.del('kv', 'snapshot');
    Local.clear('img');
    clearTimeout(Q.timer);
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
    await loadQueue();
    const snap = await Local.get('kv', 'snapshot');
    /* Ҳангоми хондани маълумоти маҳаллӣ сервер гуфта метавонад, ки сессия тамом шуд — он вақт барнома кушода намешавад */
    if (!S.user || S.user !== user) return;
    if (snap) {
        applyData(snap);
        S.sig = JSON.stringify(snap);
        showApp();
        loadImages();
        syncQuiet();
        flush();
        return;
    }
    await sync();
    if (S.user) { showApp(); loadImages(); flush(); }
}

setInterval(() => { if (S.user && !document.hidden) syncQuiet(); }, 60000);
document.addEventListener('visibilitychange', () => {
    if (S.user && !document.hidden && Date.now() - S.syncedAt > 20000) syncQuiet();
});
window.addEventListener('online', () => { if (S.user) { Q.wait = 0; flush(); syncQuiet(); } });
document.addEventListener('visibilitychange', () => { if (S.user && !document.hidden && Q.list.some(j => j.state === 'wait')) flush(); });

/* Кори бе интернет: файлҳои барнома дар хотираи телефон (sw.js). Дар санҷиши худкор (webdriver) хомӯш аст. */
if ('serviceWorker' in navigator && window.isSecureContext && (!navigator.webdriver || /[?&]sw=1/.test(location.search))) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('sw', e)));
}

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
