/* DELUS — саҳифаҳо ва ҳисобот */
'use strict';

/* ---------- ҳисоби умумӣ барои Асосӣ ва Ҳисобот ---------- */
const PERIODS = [['today', 'Имрӯз'], ['yest', 'Дирӯз'], ['7d', '7 рӯз'], ['30d', '30 рӯз'], ['month', 'Ин моҳ'], ['prev', 'Моҳи гузашта'], ['year', 'Ин сол'], ['all', 'Ҳама']];
function periodRange(k) {
    const t = today(), first = t.slice(0, 8) + '01';
    if (k === 'yest') return [dayShift(-1), dayShift(-1)];
    if (k === '7d') return [dayShift(-6), t];
    if (k === '30d') return [dayShift(-29), t];
    if (k === 'month') return [first, t];
    if (k === 'year') return [t.slice(0, 5) + '01-01', t];
    if (k === 'prev') {
        const last = serialToStr(strToSerial(first) - 1).slice(0, 10);
        return [last.slice(0, 8) + '01', last];
    }
    if (k === 'all') return ['', ''];
    return [t, t];
}
const sumQty = list => list.reduce((s, x) => s + num(x.quantity), 0);
const sumExp = list => list.reduce((s, e) => s + num(e.amount), 0);
const amount = (n, d = 2) => `${fmt(n, d)} <small>${esc(cur())}</small>`;
const repRange = q => (q.from || q.to) ? [q.from || '', q.to || ''] : periodRange(q.k);
const dotDate = d => d ? `${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]}` : '';
function repLabel(q) {
    const [from, to] = repRange(q);
    const named = !q.from && !q.to && (PERIODS.find(p => p[0] === q.k) || [])[1];
    const when = named || (from && to ? (from === to ? dotDate(from) : `${dotDate(from)} — ${dotDate(to)}`) : from ? `Аз ${dotDate(from)}` : to ? `То ${dotDate(to)}` : 'Ҳама');
    return [when, q.loc ? locName(q.loc) : '', q.cat || ''].filter(Boolean).join(' · ');
}

const saleVal = x => isSale(x) ? txSum(x) : isRet(x) ? -txSum(x) : 0;
const profitVal = x => isSale(x) ? txSum(x) - txCost(x) : isRet(x) ? txCost(x) - txSum(x) : 0;

function report(q) {
    const [from, to] = repRange(q);
    let base = S.tx;
    if (q.cat) base = base.filter(x => String((prodBy(x.product_id) || {}).category).trim() === q.cat);
    if (q.q) {
        const ids = new Set(S.products.filter(p => hasAll(`${p.name} ${p.product_code}`, q.q)).map(p => String(p.id)));
        base = base.filter(x => ids.has(String(x.product_id)));
    }
    if (q.loc) base = base.filter(x => String(x.from_location_id) === String(q.loc) || String(x.to_location_id) === String(q.loc));
    let expBase = (q.cat || q.q) ? [] : S.exp;
    if (q.loc) expBase = expBase.filter(e => String(e.location_id) === String(q.loc));
    if (q.ecat) expBase = expBase.filter(e => String(e.category).trim() === q.ecat);
    const list = inRange(base, from, to);
    /* Қарз ба мизоҷ вобаста аст, на ба анбор ё мол — бо ин филтрҳо ҳисоб намешавад */
    const debtsOk = !q.cat && !q.q && !q.loc && !q.ecat;
    const given = debtsOk ? inRange(S.debts, from, to) : [];
    const repaid = debtsOk ? inRange(S.pays.filter(isCash), from, to) : [];
    return {
        from, to, base, expBase, list, exp: inRange(expBase, from, to), debtsOk, given, repaid,
        /* аз фурӯши ин давра чӣ қадар ба қарз рафт (қарзи дастӣ пул нест, ба ҳисоби пул дохил намешавад) */
        givenOnSale: given.filter(d => d.receipt_code).reduce((s, d) => s + num(d.amount), 0),
        repaidSum: repaid.reduce((s, p) => s + num(p.amount), 0),
        sales: list.filter(x => isSale(x) || isRet(x)),
        buys: list.filter(x => x.type === 'PURCHASE'),
        moves: list.filter(x => x.type === 'TRANSFER')
    };
}

/* Диаграмма: то 31 рӯз — рӯзона, зиёдтар — моҳона. Як рӯз интихоб шавад, 7 рӯзи охир нишон дода мешавад. */
function chart(r, items, val) {
    const first = S.txSorted.length ? dayOf(S.txSorted[S.txSorted.length - 1]) : today();
    const to = r.to || today();
    let from = r.from || first;
    if (from === to) from = serialToStr(strToSerial(to) - 6).slice(0, 10);
    const span = Math.round(strToSerial(to) - strToSerial(from)) + 1;
    const monthly = span > 31;
    const buckets = [];
    const idx = new Map();
    for (let s = strToSerial(from); s <= strToSerial(to); s += 1) {
        const d = serialToStr(s).slice(0, 10), k = monthly ? d.slice(0, 7) : d;
        if (!idx.has(k)) { const b = { k, a: d, b: d, r: 0 }; idx.set(k, b); buckets.push(b); }
        idx.get(k).b = d;
    }
    items.forEach(x => {
        const d = dayOf(x), b = idx.get(monthly ? d.slice(0, 7) : d);
        if (b) b.r += val(x);
    });
    const max = Math.max(...buckets.map(v => v.r), 0);
    const peak = max > 0 ? buckets.findIndex(v => v.r === max) : -1;
    const n = buckets.length, step = n > 14 ? Math.ceil(n / 6) : 1;
    const label = b => monthly ? MONTHS[+b.k.slice(5, 7) - 1].slice(0, 3) : `${+b.k.slice(8)}.${b.k.slice(5, 7)}`;
    const title = b => monthly ? `${MONTHS[+b.k.slice(5, 7) - 1]} ${b.k.slice(0, 4)}` : dayLabel(b.k);
    return `<div class="chart" data-chart>
        <div class="bars">${buckets.map((v, i) => {
            const h = max > 0 ? Math.max(v.r, 0) / max * 84 : 0;
            return `<button type="button" class="bar-c ${v.a <= today() && today() <= v.b ? 'now' : ''} ${v.r > 0 ? '' : 'none'}" data-act="dayTx" data-a="${v.a}" data-b="${v.b}"
                data-tip-a="${esc(title(v))}" data-tip-b="${esc(money(v.r))}" aria-label="${esc(title(v) + ': ' + money(v.r))}">
                ${i === peak ? `<span class="bar-v">${fmt(v.r, 0)}</span>` : ''}<span class="bar-m" style="height:${h.toFixed(1)}%"></span></button>`;
        }).join('')}</div>
        <div class="bar-x">${buckets.map((v, i) => `<span>${(n - 1 - i) % step === 0 ? label(v) : ''}</span>`).join('')}</div>
    </div>`;
}

function kpi(label, icon, tone, value, sub, attrs = '') {
    const tag = attrs ? 'button' : 'div';
    return `<${tag} ${attrs ? 'type="button"' : ''} class="kpi" ${attrs}>
        <span class="kpi-h"><span class="kpi-l">${label}</span><span class="tile sm ${tone}">${ic(icon, 16)}</span></span>
        <span class="kpi-v">${value}</span><span class="kpi-s">${sub}</span></${tag}>`;
}

/* ---------- 1. Асосӣ ---------- */
/* Қадамҳои оғози кор: то фурӯши аввал нишон дода мешавад */
function startSteps() {
    if (S.tx.some(isSale)) return '';
    const prods = activeProds(), withPhoto = prods.filter(imgSrcReal).length;
    const hasBuy = S.tx.some(x => x.type === 'PURCHASE');
    const step = (n, done, title, sub, btn) => `<div class="step ${done ? 'done' : ''}">
        <span class="step-n">${done ? ic('check', 16) : n}</span>
        <span class="step-t"><b>${title}</b><small>${sub}</small></span>${done ? '' : btn}</div>`;
    return `<section class="card start">
        <div class="card-h"><h2><span class="tile sm tone-sale">${ic('check', 16)}</span>Оғози кор</h2></div>
        ${step(1, prods.length > 0 && withPhoto === prods.length, 'Акси молҳоро гузоред', `${withPhoto} аз ${prods.length} мол акс дорад`, '<button class="btn sm t-buy" data-act="go" data-page="prod" data-status="photo">Гузоштан</button>')}
        ${step(2, hasBuy, 'Молро ба анбор ворид кунед', 'Ҳисоби мол пас аз воридот оғоз меёбад', '<button class="btn sm t-buy" data-act="buy">Воридот</button>')}
        ${step(3, false, 'Фурӯши аввалро сабт кунед', 'Баъд ин қадамҳо пинҳон мешаванд', `<button class="btn sm ${hasBuy ? 't-sale' : ''}" data-act="sale">Фурӯш</button>`)}
    </section>`;
}
const imgSrcReal = p => !!imgSrc(p);

PAGES.home = {
    head: () => `<div class="actions">
            <button class="action sale" data-act="sale"><span class="action-i">${ic('sale', 22)}</span><span><b>Фурӯш</b><small>Сабти фурӯши мол</small></span></button>
            <button class="action buy" data-act="buy"><span class="action-i">${ic('in', 22)}</span><span><b>Воридот</b><small>Мол ба анбор омад</small></span></button>
            <button class="action move" data-act="move"><span class="action-i">${ic('move', 22)}</span><span><b>Интиқол</b><small>Аз анбор ба мағоза</small></span></button>
            <button class="action exp" data-act="expNew"><span class="action-i">${ic('wallet', 22)}</span><span><b>Хароҷот</b><small>Иҷора, маош, нақлиёт</small></span></button>
        </div>
        <div class="filters"><div class="chips">${PERIODS.slice(0, 5).map(([k, t]) => `<button type="button" class="chip ${S.homeK === k ? 'on' : ''}" data-act="homePeriod" data-k="${k}">${t}</button>`).join('')}</div></div>`,

    body() {
        const q = { k: S.homeK };
        const r = report(q);
        const checks = new Set(r.list.filter(isSale).map(x => x.receipt_code || x.id)).size;
        const rev = netRev(r.sales), prof = netProfit(r.sales);
        const buySum = r.buys.reduce((s, x) => s + txCost(x), 0), expSum = sumExp(r.exp), net = prof - expSum;
        const prods = activeProds();
        const cost = prods.reduce((s, p) => s + Math.max(qtyAll(p.id), 0) * num(p.purchase_price), 0);
        const need = prods.filter(p => stockState(p) !== 'ok').sort((a, b) => qtyAll(a.id) - qtyAll(b.id));
        const neg = prods.filter(p => stockState(p) === 'neg').length;

        return `
        ${startSteps()}
        <section class="hero">
            <div>
                <span class="hero-l">Фурӯш · ${esc(repLabel(q))}</span>
                <div class="hero-v">${amount(rev)}</div>
                <div class="hero-s"><span>${fmt(checks)} чек</span><span>${qty(sumQty(r.sales.filter(isSale)))} воҳид</span></div>
            </div>
            ${chart(r, r.base, saleVal)}
        </section>

        ${neg ? `<div class="note bad" style="margin-top:14px">${ic('warn', 16)}<span>Дар ҳисоби ${neg} мол камомад (миқдори манфӣ) ҳаст. <button class="link" data-act="go" data-page="stock" data-only="neg">Дидан</button></span></div>` : ''}

        <div class="kpis">
            ${kpi('Фоидаи соф', 'chart', net < 0 ? 'tone-bad' : 'tone-sale', amount(net), `Фоида ${fmt(prof, 2)} − хароҷот ${fmt(expSum, 2)}`, 'data-act="repOpen" data-tab="profit"')}
            ${kpi('Воридот', 'in', 'tone-buy', amount(buySum), `${qty(sumQty(r.buys))} воҳид омад`, 'data-act="repOpen" data-tab="buy"')}
            ${kpi('Хароҷот', 'wallet', 'tone-exp', amount(expSum), `${fmt(r.exp.length)} сабт`, 'data-act="repOpen" data-tab="exp"')}
            ${kpi('Мол дар анбор', 'box', 'tone-move', amount(cost, 0), 'Бо нархи харид', 'data-act="go" data-page="stock"')}
            ${(() => {
                const open = customers().filter(c => c.left > MONEY_EPS), late = open.filter(c => c.late).length;
                return kpi('Қарзи мизоҷон', 'debt', late ? 'tone-bad' : 'tone-warn', amount(open.reduce((s, c) => s + c.left, 0)),
                    open.length ? `${fmt(open.length)} нафар${late ? ` · мӯҳлати ${late} гузашт` : ''}` : 'Қарздор нест', 'data-act="go" data-page="debt"');
            })()}
        </div>

        <button class="rep-link" data-act="repOpen" data-tab="all">
            <span class="tile tone-buy">${ic('chart', 20)}</span>
            <span><b>Ҳисоботи пурра</b><small>Фурӯш, фоида, хароҷот ва воридот бо филтрҳо</small></span>${ic('right', 18)}
        </button>

        <div class="cols">
            <div class="card">
                <div class="card-h"><h2><span class="tile sm tone-warn">${ic('warn', 16)}</span>Бояд харид</h2>${need.length ? `<button class="btn quiet sm" data-act="go" data-page="stock" data-only="need">Ҳама (${need.length})</button>` : ''}</div>
                ${need.length ? need.slice(0, 5).map(p => `<div class="mini need">
                    <button class="mini-open" data-act="prodView" data-id="${esc(p.id)}">${thumb(p, 'sm')}
                        <span class="mini-b"><b>${esc(p.name)}</b><small>Ҳадди кам: ${qty(lowLimit(p))} ${esc(unitOf(p))}</small></span></button>
                    ${stockPill(p)}
                    <button class="btn sm t-buy" data-act="buy" data-id="${esc(p.id)}" aria-label="Воридот" title="Воридот">${ic('in', 15)}<span>Воридот</span></button>
                </div>`).join('') : '<p class="muted">Ҳамаи мол ба қадри кофӣ ҳаст.</p>'}
            </div>
            <div class="card">
                <div class="card-h"><h2><span class="tile sm tone-move">${ic('list', 16)}</span>Амалиётҳои охирин</h2><button class="btn quiet sm" data-act="go" data-page="tx">Ҳама</button></div>
                ${S.txSorted.length ? S.txSorted.slice(0, 5).map(x => {
                    const p = prodBy(x.product_id) || { id: x.product_id, name: 'Мол #' + x.product_id };
                    return `<button class="mini" data-act="txView" data-id="${esc(x.id)}">${thumb(p, 'sm')}
                        <span class="mini-b"><b>${esc(p.name)}</b><small>${(TYPES[x.type] || { t: x.type }).t} · ${dayLabel(dayOf(x))}</small></span>
                        <span class="mini-v">${txQty(x, p)}</span></button>`;
                }).join('') : '<p class="muted">Ҳоло амалиёт нест.</p>'}
            </div>
        </div>`;
    }
};

/* ---------- Ҳисобот ---------- */
const REP_TABS = [['all', 'Умумӣ', 'chart'], ['sale', 'Фурӯш', 'sale'], ['profit', 'Фоида', 'tag'], ['debt', 'Қарз', 'debt'], ['exp', 'Хароҷот', 'wallet'], ['buy', 'Воридот', 'in'], ['move', 'Интиқол', 'move']];
const repFilters = () => [S.rep.from, S.rep.to, S.rep.loc, S.rep.cat, S.rep.q, S.rep.ecat].filter(Boolean).length;

function prevOf(q) {
    const [f, t] = repRange(q);
    if (!f || !t) return null;
    const n = Math.round(strToSerial(t) - strToSerial(f)) + 1;
    const pt = serialToStr(strToSerial(f) - 1).slice(0, 10), pf = serialToStr(strToSerial(f) - n).slice(0, 10);
    return report({ ...q, k: '', from: pf, to: pt });
}
/* Муқоиса бо давраи пеш; барои хароҷот афзоиш хуб нест */
function delta(a, b, goodUp = true) {
    if (b === null || b === undefined || !b) return '';
    const p = (a - b) / Math.abs(b) * 100, up = p >= 0;
    return ` <span class="d ${up === goodUp ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${fmt(Math.abs(p), 0)}%</span>`;
}

/* Ҷадвал: дар компютер ҷадвал, дар телефон кортҳо. Ҳамин маълумот ба CSV меравад. */
function rtable(name, cols, rows, act = '') {
    if (!S.csv) S.csv = { name, cols, rows };
    if (!rows.length) return '<p class="muted">Дар ин давра маълумот нест.</p>';
    const shown = rows.slice(0, S.limit);
    return `<div class="rt-wrap"><table class="rt">
        <thead><tr>${cols.map((c, i) => `<th class="${i ? 'n' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${shown.map(r => `<tr ${act && r.id !== undefined ? `data-act="${act}" data-id="${esc(r.id)}" tabindex="0"` : ''}>${r.c.map((v, i) => `<td class="${i ? 'n' : ''}" data-l="${esc(cols[i])}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>${moreBtn(shown.length, rows.length)}`;
}
const rcard = (icon, tone, title, inner, extra = '') => `<div class="card"><div class="card-h"><h2><span class="tile sm ${tone}">${ic(icon, 16)}</span>${title}</h2>${extra}</div>${inner}</div>`;
const heroBlock = (label, value, chips, r, items, val) => `<section class="hero">
    <div><span class="hero-l">${esc(label)} · ${esc(repLabel(S.rep))}</span><div class="hero-v">${value}</div>
    ${chips.length ? `<div class="hero-s">${chips.map(c => `<span>${c}</span>`).join('')}</div>` : ''}</div>
    ${chart(r, items, val)}</section>`;
const meters = list => {
    const max = Math.max(1, ...list.map(v => v[1]));
    return list.length ? list.map(([k, v]) => `<div class="mini" style="display:block">
        <div style="display:flex;justify-content:space-between;gap:10px"><span>${esc(k)}</span><b class="num">${fmt(v, 2)}</b></div>
        <div class="meter"><i style="width:${Math.round(Math.max(v, 0) / max * 100)}%"></i></div></div>`).join('') : '<p class="muted">Дар ин давра маълумот нест.</p>';
};
function sumBy(list, key, val) {
    const m = new Map();
    list.forEach(x => { const k = key(x); m.set(k, (m.get(k) || 0) + val(x)); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const catOf = x => String((prodBy(x.product_id) || {}).category || '').trim() || 'Бе гурӯҳ';
const placeOf = x => locName(isRet(x) ? x.to_location_id : x.from_location_id);
function byProduct(list) {
    const m = new Map();
    list.forEach(x => {
        const k = String(x.product_id), p = prodBy(k) || { name: 'Мол #' + k, id: k };
        const v = m.get(k) || { id: k, p, q: 0, rev: 0, cost: 0, buy: 0 };
        const sign = isRet(x) ? -1 : 1;
        v.q += sign * num(x.quantity);
        if (isSale(x) || isRet(x)) { v.rev += sign * txSum(x); v.cost += sign * txCost(x); }
        v.buy += txCost(x);
        m.set(k, v);
    });
    return [...m.values()];
}
const pct = (a, b) => b ? `${fmt(a / b * 100, 1)}%` : '—';

const REP = {
    all(r, pv) {
        const rev = netRev(r.sales), prof = netProfit(r.sales), buy = r.buys.reduce((s, x) => s + txCost(x), 0), ex = sumExp(r.exp);
        const pr = pv ? { rev: netRev(pv.sales), prof: netProfit(pv.sales), buy: pv.buys.reduce((s, x) => s + txCost(x), 0), ex: sumExp(pv.exp) } : {};
        const left = rev - r.givenOnSale + r.repaidSum - buy - ex;
        const places = (S.rep.loc ? S.locations.filter(l => String(l.id) === String(S.rep.loc)) : activeLocs()).map(l => {
            const id = String(l.id), b = r.buys.filter(x => String(x.to_location_id) === id);
            const s = r.sales.filter(x => String(isRet(x) ? x.to_location_id : x.from_location_id) === id);
            return {
                id: l.id, c: [l.name, qty(sumQty(b)), fmt(b.reduce((t, x) => t + txCost(x), 0), 2), fmt(netRev(s), 2), fmt(netProfit(s), 2),
                    `+${qty(sumQty(r.moves.filter(x => String(x.to_location_id) === id)))} / −${qty(sumQty(r.moves.filter(x => String(x.from_location_id) === id)))}`,
                    fmt(sumExp(r.exp.filter(e => String(e.location_id) === id)), 2)]
            };
        });
        return `${heroBlock('Фурӯш', amount(rev) + delta(rev, pr.rev), [`Фоида: ${fmt(prof, 2)}`, `Хароҷот: ${fmt(ex, 2)}`], r, r.base, saleVal)}
        <div class="kpis">
            ${kpi('Фоида', 'tag', 'tone-sale', amount(prof), `Аз фурӯш: ${pct(prof, rev)}${delta(prof, pr.prof)}`, 'data-act="repTab" data-tab="profit"')}
            ${kpi('Хароҷот', 'wallet', 'tone-exp', amount(ex), `${fmt(r.exp.length)} сабт${delta(ex, pr.ex, false)}`, 'data-act="repTab" data-tab="exp"')}
            ${kpi('Фоидаи соф', 'chart', prof - ex < 0 ? 'tone-bad' : 'tone-sale', amount(prof - ex), 'Фоида − хароҷот')}
            ${kpi('Воридот', 'in', 'tone-buy', amount(buy), `${qty(sumQty(r.buys))} воҳид${delta(buy, pr.buy, false)}`, 'data-act="repTab" data-tab="buy"')}
        </div>
        <div class="cols">
            ${rcard('wallet', 'tone-sale', 'Пул дар ин давра', `
                <div class="kv"><span>Аз фурӯш</span><b class="num pos">+${fmt(rev, 2)}</b></div>
                ${r.debtsOk ? `<div class="kv"><span>Аз он ба қарз дода шуд</span><b class="num">−${fmt(r.givenOnSale, 2)}</b></div>
                <div class="kv"><span>Қарз баргашт</span><b class="num pos">+${fmt(r.repaidSum, 2)}</b></div>` : ''}
                <div class="kv"><span>Барои мол рафт</span><b class="num">−${fmt(buy, 2)}</b></div>
                <div class="kv"><span>Хароҷот</span><b class="num">−${fmt(ex, 2)}</b></div>
                <div class="kv total-kv"><span>Боқимонда</span><b class="num ${left < 0 ? 'neg' : 'pos'}">${fmt(left, 2)} ${esc(cur())}</b></div>`)}
            ${rcard('sale', 'tone-sale', 'Фурӯш аз рӯи гурӯҳ', meters(sumBy(r.sales, catOf, saleVal).filter(v => v[1] > 0).slice(0, 6)))}
        </div>
        <div class="stack" style="margin-top:14px">${rcard('pin', 'tone-buy', 'Аз рӯи анборҳо', rtable('Аз рӯи анборҳо', ['Ҷой', 'Воридот (воҳид)', 'Воридот (маблағ)', 'Фурӯш', 'Фоида', 'Интиқол', 'Хароҷот'], places, 'repPlace'))}</div>`;
    },

    sale(r, pv) {
        const rev = netRev(r.sales), sold = r.sales.filter(isSale), rets = r.sales.filter(isRet);
        const checks = new Set(sold.map(x => x.receipt_code || x.id)).size;
        const prods = byProduct(r.sales).filter(v => v.rev > 0).sort((a, b) => b.rev - a.rev);
        return `${heroBlock('Фурӯш', amount(rev) + delta(rev, pv && netRev(pv.sales)), [`${fmt(checks)} чек`, `${qty(sumQty(sold))} воҳид`], r, r.base, saleVal)}
        <div class="kpis">
            ${kpi('Чеки миёна', 'sale', 'tone-sale', amount(checks ? rev / checks : 0), `${fmt(checks)} чек`)}
            ${kpi('Миқдори фурӯш', 'box', 'tone-buy', `${qty(sumQty(sold))} <small>воҳид</small>`, `${fmt(prods.length)} намуди мол`)}
            ${kpi('Бозгашт', 'back', 'tone-bad', amount(rets.reduce((s, x) => s + txSum(x), 0)), `${qty(sumQty(rets))} воҳид`)}
            ${kpi('Фоида', 'tag', 'tone-sale', amount(netProfit(r.sales)), `Аз фурӯш: ${pct(netProfit(r.sales), rev)}`, 'data-act="repTab" data-tab="profit"')}
        </div>
        <div class="cols">
            ${rcard('tag', 'tone-sale', 'Аз рӯи гурӯҳ', meters(sumBy(r.sales, catOf, saleVal).filter(v => v[1] > 0).slice(0, 8)))}
            ${rcard('pin', 'tone-buy', 'Аз рӯи ҷой', meters(sumBy(r.sales, placeOf, saleVal).filter(v => v[1] > 0)))}
        </div>
        <div class="stack" style="margin-top:14px">${rcard('sale', 'tone-sale', 'Фурӯши молҳо', rtable('Фурӯши молҳо', ['Мол', 'Миқдор', 'Маблағ', 'Фоида'], prods.map(v => ({ id: v.id, c: [v.p.name, `${qty(v.q)} ${unitOf(v.p)}`, fmt(v.rev, 2), fmt(v.rev - v.cost, 2)] })), 'prodView'))}</div>`;
    },

    profit(r, pv) {
        const rev = netRev(r.sales), prof = netProfit(r.sales), ex = sumExp(r.exp), net = prof - ex;
        const prods = byProduct(r.sales).filter(v => v.rev !== 0).sort((a, b) => (b.rev - b.cost) - (a.rev - a.cost));
        return `${heroBlock('Фоида', amount(prof) + delta(prof, pv && netProfit(pv.sales)), [`Аз фурӯш: ${pct(prof, rev)}`], r, r.base, profitVal)}
        <div class="kpis">
            ${kpi('Фурӯш', 'sale', 'tone-sale', amount(rev), 'Маблағи умумӣ', 'data-act="repTab" data-tab="sale"')}
            ${kpi('Арзиши моли фурӯхта', 'box', 'tone-buy', amount(rev - prof), 'Бо нархи харид')}
            ${kpi('Хароҷот', 'wallet', 'tone-exp', amount(ex), `${fmt(r.exp.length)} сабт`, 'data-act="repTab" data-tab="exp"')}
            ${kpi('Фоидаи соф', 'chart', net < 0 ? 'tone-bad' : 'tone-sale', amount(net), 'Фоида − хароҷот')}
        </div>
        <div class="cols">
            ${rcard('tag', 'tone-sale', 'Фоида аз рӯи гурӯҳ', meters(sumBy(r.sales, catOf, profitVal).filter(v => v[1] > 0).slice(0, 8)))}
            ${rcard('pin', 'tone-buy', 'Фоида аз рӯи ҷой', meters(sumBy(r.sales, placeOf, profitVal).filter(v => v[1] > 0)))}
        </div>
        <div class="stack" style="margin-top:14px">${rcard('tag', 'tone-sale', 'Фоидаи молҳо', rtable('Фоидаи молҳо', ['Мол', 'Миқдор', 'Фурӯш', 'Арзиш', 'Фоида', 'Фоиз'], prods.map(v => ({ id: v.id, c: [v.p.name, `${qty(v.q)} ${unitOf(v.p)}`, fmt(v.rev, 2), fmt(v.cost, 2), fmt(v.rev - v.cost, 2), pct(v.rev - v.cost, v.rev)] })), 'prodView'))}</div>`;
    },

    exp(r, pv) {
        const ex = sumExp(r.exp);
        const [f, t] = [r.from || (r.exp.length ? [...r.exp].map(dayOf).sort()[0] : today()), r.to || today()];
        const days = Math.max(1, Math.round(strToSerial(t) - strToSerial(f)) + 1);
        const cats = sumBy(r.exp, e => String(e.category || 'Дигар'), e => num(e.amount));
        const places = sumBy(r.exp, e => e.location_id === '' ? 'Умумӣ' : locName(e.location_id), e => num(e.amount));
        const big = r.exp.reduce((m, e) => num(e.amount) > num(m.amount) ? e : m, { amount: 0 });
        const rows = [...r.exp].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        return `${heroBlock('Хароҷот', amount(ex) + delta(ex, pv && sumExp(pv.exp), false), [`${fmt(r.exp.length)} сабт`], r, r.expBase, e => num(e.amount))}
        <div class="kpis">
            ${kpi('Дар як рӯз', 'wallet', 'tone-exp', amount(ex / days), `Дар ${fmt(days)} рӯз`)}
            ${kpi('Калонтарин', 'warn', 'tone-warn', amount(big.amount), esc(big.category || '—'))}
            ${kpi('Намудҳо', 'list', 'tone-move', `${fmt(cats.length)} <small>намуд</small>`, esc(cats[0] ? cats[0][0] : '—'))}
            ${kpi('Аз фоида', 'chart', 'tone-buy', pct(ex, netProfit(r.sales)), `Фоида: ${fmt(netProfit(r.sales), 2)}`)}
        </div>
        <div class="cols">
            ${rcard('wallet', 'tone-exp', 'Аз рӯи намуд', meters(cats), `<button class="btn sm t-exp" data-act="expNew">${ic('plus', 14)}Илова</button>`)}
            ${rcard('pin', 'tone-buy', 'Аз рӯи ҷой', meters(places))}
        </div>
        <div class="stack" style="margin-top:14px">${rcard('list', 'tone-exp', 'Ҳамаи хароҷот', rtable('Хароҷот', ['Намуд', 'Сана', 'Ҷой', 'Эзоҳ', 'Маблағ'], rows.map(e => ({ id: e.id, c: [e.category, dayOf(e), e.location_id === '' ? 'Умумӣ' : locName(e.location_id), e.note || '—', fmt(e.amount, 2)] })), 'expEdit'))}</div>`;
    },

    buy(r, pv) {
        const sum = r.buys.reduce((s, x) => s + txCost(x), 0);
        const prods = byProduct(r.buys).sort((a, b) => b.buy - a.buy);
        const places = sumBy(r.buys, x => locName(x.to_location_id), txCost);
        const buyVal = x => x.type === 'PURCHASE' ? txCost(x) : 0;
        return `${heroBlock('Воридот', amount(sum) + delta(sum, pv && pv.buys.reduce((s, x) => s + txCost(x), 0), false), [`${qty(sumQty(r.buys))} воҳид`, `${fmt(r.buys.length)} сабт`], r, r.base, buyVal)}
        <div class="cols">
            ${rcard('pin', 'tone-buy', 'Ба кадом анбор омад', meters(places))}
            ${rcard('tag', 'tone-buy', 'Аз рӯи гурӯҳ', meters(sumBy(r.buys, catOf, txCost).slice(0, 8)))}
        </div>
        <div class="stack" style="margin-top:14px">${rcard('in', 'tone-buy', 'Моли омада', rtable('Воридот', ['Мол', 'Миқдор', 'Нархи миёна', 'Маблағ'], prods.map(v => ({ id: v.id, c: [v.p.name, `${qty(v.q)} ${unitOf(v.p)}`, fmt(v.q ? v.buy / v.q : 0, 2), fmt(v.buy, 2)] })), 'prodView'))}</div>`;
    },

    move(r) {
        const value = r.moves.reduce((s, x) => s + txCost(x), 0);
        const routes = new Map();
        r.moves.forEach(x => {
            const k = `${locName(x.from_location_id)} → ${locName(x.to_location_id)}`, v = routes.get(k) || { q: 0, s: 0, n: 0 };
            v.q += num(x.quantity); v.s += txCost(x); v.n += 1;
            routes.set(k, v);
        });
        const prods = byProduct(r.moves).sort((a, b) => b.buy - a.buy);
        const moveVal = x => x.type === 'TRANSFER' ? num(x.quantity) : 0;
        return `${heroBlock('Интиқол', `${qty(sumQty(r.moves))} <small>воҳид</small>`, [`Арзиш: ${fmt(value, 2)}`, `${fmt(r.moves.length)} сабт`], r, r.base, moveVal)}
        <div class="stack" style="margin-top:14px">
            ${rcard('move', 'tone-move', 'Роҳҳо', rtable('Интиқол аз рӯи роҳ', ['Роҳ', 'Сабт', 'Миқдор', 'Арзиш'], [...routes.entries()].sort((a, b) => b[1].s - a[1].s).map(([k, v]) => ({ c: [k, fmt(v.n), qty(v.q), fmt(v.s, 2)] }))))}
            ${rcard('tag', 'tone-move', 'Моли интиқолшуда', rtable('Моли интиқолшуда', ['Мол', 'Миқдор', 'Арзиш'], prods.map(v => ({ id: v.id, c: [v.p.name, `${qty(v.q)} ${unitOf(v.p)}`, fmt(v.buy, 2)] })), 'prodView'))}
        </div>`;
    }
};

PAGES.rep = {
    head: () => {
        const ecats = [...new Set(S.exp.map(e => String(e.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
        return `<div class="filters">
        <div class="seg rep-tabs" role="tablist" aria-label="Бахши ҳисобот">${REP_TABS.map(([k, t, i]) => `<button type="button" role="tab" aria-selected="${S.rep.tab === k}" class="${S.rep.tab === k ? 'on' : ''}" data-act="repTab" data-tab="${k}">${ic(i, 15)}${t}</button>`).join('')}</div>
        <div class="chips">${PERIODS.map(([k, t]) => `<button type="button" class="chip ${!S.rep.from && !S.rep.to && S.rep.k === k ? 'on' : ''}" data-act="repPeriod" data-k="${k}">${t}</button>`).join('')}</div>
        <div class="toolbar">
            ${filterBtn(repFilters())}
            <button class="btn f-csv" data-act="repCsv">${ic('in', 16)}CSV</button>
            <div class="f-more ${S.fOpen ? 'open' : ''}">
                <div class="dates">
                    <input class="input" type="date" data-r="from" value="${esc(S.rep.from)}" aria-label="Аз сана"><span>—</span>
                    <input class="input" type="date" data-r="to" value="${esc(S.rep.to)}" aria-label="То сана">
                </div>
                <select class="input" data-r="loc" aria-label="Анбор ё мағоза">${options([['', 'Ҳамаи анборҳо'], ...S.locations.map(l => [l.id, l.name])], S.rep.loc)}</select>
                <select class="input" data-r="cat" aria-label="Гурӯҳ">${options([['', 'Ҳамаи гурӯҳҳо'], ...categories().map(c => [c, c])], S.rep.cat)}</select>
                <select class="input" data-r="ecat" aria-label="Намуди хароҷот">${options([['', 'Ҳамаи хароҷот'], ...ecats.map(c => [c, c])], S.rep.ecat)}</select>
                <div class="search rep-q">${ic('search', 17)}<input type="search" data-r="q" value="${esc(S.rep.q)}" placeholder="Номи мол" autocomplete="off" aria-label="Номи мол"></div>
                <button class="btn quiet" data-act="repClear" ${repFilters() ? '' : 'hidden'}>${ic('x', 15)}Тоза кардан</button>
            </div>
        </div>
    </div>`;
    },
    body() {
        S.csv = null;
        const r = report(S.rep);
        return REP[S.rep.tab](r, prevOf(S.rep));
    }
};

/* Рақами рӯз ҳангоми гузоштани мушак */
document.addEventListener('pointerover', e => {
    const b = e.target.closest && e.target.closest('.bar-c');
    const old = $('.tip');
    if (!b) { if (old) old.remove(); return; }
    if (e.pointerType === 'touch') return;
    if (old) old.remove();
    const c = b.closest('[data-chart]');
    const t = document.createElement('div');
    t.className = 'tip';
    t.innerHTML = `${esc(b.dataset.tipA)}<b>${esc(b.dataset.tipB)}</b>`;
    c.append(t);
    const r = b.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const half = t.offsetWidth / 2;
    t.style.left = Math.min(Math.max(r.left - cr.left + r.width / 2, half), cr.width - half) + 'px';
    t.style.top = Math.max(r.bottom - cr.top - (b.querySelector('.bar-m').offsetHeight + 8), t.offsetHeight) + 'px';
});

/* ---------- 2. Молҳо ---------- */
function filterProducts() {
    const f = S.f;
    let list = f.status === 'arch' ? S.products.filter(p => !isActive(p)) : activeProds();
    if (f.q) list = list.filter(p => hasAll(`${p.name} ${p.product_code} ${p.category} ${p.series} ${p.description}`, f.q));
    if (f.cat) list = list.filter(p => String(p.category).trim() === f.cat);
    if (f.status === 'low') list = list.filter(p => stockState(p) === 'low');
    if (f.status === 'out') list = list.filter(p => ['out', 'neg'].includes(stockState(p)));
    if (f.status === 'photo') list = list.filter(p => !imgSrc(p));
    const sorters = {
        name: (a, b) => String(a.name).localeCompare(String(b.name), 'ru'),
        new: (a, b) => num(b.id) - num(a.id),
        priceUp: (a, b) => num(a.sale_price) - num(b.sale_price),
        priceDown: (a, b) => num(b.sale_price) - num(a.sale_price),
        qtyUp: (a, b) => qtyAll(a.id) - qtyAll(b.id)
    };
    return [...list].sort(sorters[f.sort] || sorters.name);
}

function productCard(p) {
    const id = esc(p.id);
    const on = isActive(p);
    return `<article class="pcard">
        <button class="pcard-img" data-act="prodView" data-id="${id}" aria-label="${esc(p.name)}">
            ${thumb(p, 'cover')}
            ${p.product_code ? `<span class="pcard-code">${esc(p.product_code)}</span>` : ''}
            ${stockPill(p)}
        </button>
        <div class="pcard-b">
            <button class="pcard-n" data-act="prodView" data-id="${id}"><b>${esc(p.name)}</b><small>${esc(p.category || 'Бе гурӯҳ')}</small></button>
            <div class="pcard-p">
                <div class="sell">${fmt(p.sale_price, 2)} <small>${esc(cur())}</small></div>
                <div><small>Нархи харид</small><b>${fmt(p.purchase_price, 2)}</b></div>
            </div>
            ${on ? `<div class="pcard-a">
                <button class="btn t-sale" data-act="sale" data-id="${id}">${ic('sale', 16)}Фурӯш</button>
                <button class="btn icon t-buy" data-act="buy" data-id="${id}" aria-label="Воридот" title="Воридот">${ic('in', 16)}</button>
                <button class="btn icon t-move" data-act="move" data-id="${id}" aria-label="Интиқол" title="Интиқол">${ic('move', 16)}</button>
                <button class="btn icon edit" data-act="prodEdit" data-id="${id}" aria-label="Тағйир додан" title="Тағйир додан">${ic('edit', 16)}</button>
            </div>` : `<button class="btn" data-act="prodEdit" data-id="${id}">${ic('edit', 16)}Тағйир додан</button>`}
        </div>
    </article>`;
}

PAGES.prod = {
    head: () => `<div class="toolbar">
        ${searchBox('Ҷустуҷӯи мол')}
        ${filterBtn(+!!S.f.cat)}
        <button class="btn primary" data-act="prodNew">${ic('plus', 16)}Моли нав</button>
        <div class="f-more ${S.fOpen ? 'open' : ''}">
            ${catSelect()}
            <select class="input" data-f="sort" aria-label="Тартиб">${options([['name', 'Аз рӯи ном'], ['new', 'Навтаринҳо'], ['priceDown', 'Нарх: аз баланд'], ['priceUp', 'Нарх: аз паст'], ['qtyUp', 'Миқдор: аз кам']], S.f.sort || 'name')}</select>
        </div>
        ${chips('status', [['', 'Ҳама'], ['low', 'Кам мондааст'], ['out', 'Тамом шудааст'], ['photo', 'Бе акс'], ['arch', 'Бойгонӣ']])}
    </div>`,
    body() {
        const list = filterProducts();
        if (!list.length) {
            if (S.f.status === 'arch') return empty('Бойгонӣ холӣ аст');
            if (S.f.q || S.f.cat || S.f.status) return empty('Чунин мол ёфт нашуд', 'Шарти ҷустуҷӯро иваз кунед.');
            return empty('Ҳоло мол нест', 'Моли аввалро илова кунед.', `<button class="btn primary" data-act="prodNew">${ic('plus', 16)}Моли нав</button>`);
        }
        const shown = list.slice(0, S.limit);
        return `<div class="pgrid">${shown.map(productCard).join('')}</div>${moreBtn(shown.length, list.length)}`;
    }
};

/* ---------- 3. Анбор ---------- */
function filterStock() {
    const f = S.f;
    let list = activeProds();
    if (f.q) list = list.filter(p => hasAll(`${p.name} ${p.product_code} ${p.category}`, f.q));
    if (f.cat) list = list.filter(p => String(p.category).trim() === f.cat);
    if (f.loc) list = list.filter(p => qtyAt(p.id, f.loc) !== 0);
    if (f.only === 'need') list = list.filter(p => stockState(p) !== 'ok');
    if (f.only === 'neg') list = list.filter(p => stockState(p) === 'neg');
    if (f.only === 'idle') {
        const sold = new Set(inRange(S.tx, dayShift(-29), today()).filter(isSale).map(x => String(x.product_id)));
        list = list.filter(p => qtyAll(p.id) > 0 && !sold.has(String(p.id)));
    }
    return [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
}
const cellClass = q => q < 0 ? 'neg' : q === 0 ? 'zero' : '';

PAGES.stock = {
    head: () => `<div class="toolbar">
        ${searchBox('Ҷустуҷӯи мол')}
        ${filterBtn(+!!S.f.cat)}
        <div class="f-more ${S.fOpen ? 'open' : ''}">${catSelect()}</div>
        <button class="btn t-move" data-act="move">${ic('move', 16)}Интиқол</button>
        <button class="btn" data-act="fix" title="Молро шуморед ва миқдори воқеиро нависед">${ic('fix', 16)}Шумориш</button>
        ${chips('only', [['', 'Ҳама молҳо'], ['need', 'Кам мондааст'], ['idle', 'Як моҳ савдо нашуд'], ['neg', 'Камомад (манфӣ)']])}
    </div>`,
    body() {
        const locs = activeLocs();
        const sums = locs.map(l => {
            let units = 0, val = 0;
            activeProds().forEach(p => { const q = qtyAt(p.id, l.id); units += q; val += Math.max(q, 0) * num(p.purchase_price); });
            return `<button class="loc-sum ${String(S.f.loc) === String(l.id) ? 'on' : ''}" data-act="locFilter" data-id="${esc(l.id)}">
                <span class="tile ${l.location_type === 'Shop' ? 'tone-sale' : 'tone-buy'}">${ic(l.location_type === 'Shop' ? 'sale' : 'box', 18)}</span>
                <span><b>${esc(l.name)}</b><small class="num">${qty(units)} воҳид · ${fmt(val, 0)} ${esc(cur())}</small></span></button>`;
        }).join('');
        const list = filterStock();
        if (!list.length) return `<div class="loc-sums">${sums}</div>` + empty('Чунин мол ёфт нашуд');
        const shown = list.slice(0, S.limit);
        return `<div class="loc-sums">${sums}</div>
        <div class="table-wrap stock-table"><table class="tbl">
            <thead><tr><th>Мол</th>${locs.map(l => `<th>${esc(l.name)}</th>`).join('')}<th>Ҳамагӣ</th><th class="hide-md">Нарх</th><th></th></tr></thead>
            <tbody>${shown.map(p => `<tr data-act="prodView" data-id="${esc(p.id)}">
                <td><span class="r-name">${thumb(p)}<span><b>${esc(p.name)}</b><small>${esc(p.product_code || '')}</small></span></span></td>
                ${locs.map(l => { const q = qtyAt(p.id, l.id); return `<td class="${cellClass(q)}">${qty(q)}</td>`; }).join('')}
                <td>${stockPill(p)}</td>
                <td class="hide-md">${fmt(p.sale_price, 2)}</td>
                <td><span class="acts">
                    <button class="btn sm t-sale" data-act="sale" data-id="${esc(p.id)}" aria-label="Фурӯш">${ic('sale', 15)}<span>Фурӯш</span></button>
                    <button class="btn sm t-buy" data-act="buy" data-id="${esc(p.id)}" aria-label="Воридот">${ic('in', 15)}<span>Воридот</span></button>
                </span></td></tr>`).join('')}</tbody>
        </table></div>
        <div class="stock-cards rows">${shown.map(p => `<button class="stock-c" data-act="prodView" data-id="${esc(p.id)}">
            <span class="stock-c-h"><span class="r-name">${thumb(p)}<span><b>${esc(p.name)}</b><small>${money(p.sale_price)}</small></span></span>${stockPill(p)}</span>
            <span class="stock-c-l">${locs.map(l => { const q = qtyAt(p.id, l.id); return `<span>${esc(l.name)}: <b class="${q < 0 ? 'neg' : ''}">${qty(q)}</b></span>`; }).join('')}</span>
        </button>`).join('')}</div>
        ${moreBtn(shown.length, list.length)}`;
    }
};

/* ---------- 4. Амалиётҳо ---------- */
const TX_WHEN = [['', 'Ҳама'], ['today', 'Имрӯз'], ['yest', 'Дирӯз'], ['7d', '7 рӯз'], ['month', 'Ин моҳ']];
function txRange() {
    const f = S.f;
    if (f.from || f.to) return [f.from || '', f.to || ''];
    if (f.when === 'yest') return [dayShift(-1), dayShift(-1)];
    return f.when ? periodRange(f.when) : ['', ''];
}
function filterTx() {
    const f = S.f;
    const [from, to] = txRange();
    let list = from || to ? inRange(S.txSorted, from, to) : S.txSorted;
    if (f.type) list = list.filter(x => x.type === f.type);
    if (f.loc) list = list.filter(x => String(x.from_location_id) === String(f.loc) || String(x.to_location_id) === String(f.loc));
    if (f.q) list = list.filter(x => hasAll(`${(prodBy(x.product_id) || {}).name} ${x.transaction_code} ${x.receipt_code} ${x.note}`, f.q));
    if (f.type && f.type !== 'EXPENSE') return list;
    let exp = inRange(S.exp, from, to).map(e => ({ ...e, type: 'EXPENSE', eid: e.id }));
    if (f.loc) exp = exp.filter(e => String(e.location_id) === String(f.loc));
    if (f.q) exp = exp.filter(e => hasAll(`${e.category} ${e.note}`, f.q));
    return [...list, ...exp].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function txRoute(x) {
    if (x.type === 'TRANSFER') return `${locName(x.from_location_id)} → ${locName(x.to_location_id)}`;
    return locName(x.to_location_id !== '' ? x.to_location_id : x.from_location_id);
}
/* Ҳар амалиёт маблағ дорад: фурӯш бо нархи фурӯш, дигарон бо нархи харид */
const txPrice = x => (isSale(x) || isRet(x)) ? num(x.unit_price) : num(x.unit_cost);
const txValue = x => num(x.quantity) * txPrice(x);
function txQty(x, p) {
    const sign = x.type === 'ADJUSTMENT' ? (x.to_location_id !== '' ? '+' : '−') : '';
    return `${sign}${qty(x.quantity)} ${esc(x.unit || unitOf(p))}`;
}

PAGES.tx = {
    head: () => `<div class="toolbar">
        ${searchBox('Ҷустуҷӯ')}
        ${filterBtn([S.f.type, S.f.loc, S.f.from, S.f.to].filter(Boolean).length)}
        <div class="f-more ${S.fOpen ? 'open' : ''}">
        <select class="input" data-f="type" aria-label="Навъи амалиёт">${options([['', 'Ҳамаи амалиётҳо'], ...Object.entries(TYPES).map(([k, v]) => [k, v.t])], S.f.type || '')}</select>
        <select class="input" data-f="loc" aria-label="Ҷой">${options([['', 'Ҳамаи ҷойҳо'], ...S.locations.map(l => [l.id, l.name])], S.f.loc || '')}</select>
        <div class="dates">
            <input class="input" type="date" data-f="from" value="${esc(S.f.from || '')}" aria-label="Аз сана"><span>—</span>
            <input class="input" type="date" data-f="to" value="${esc(S.f.to || '')}" aria-label="То сана">
        </div>
        </div>
        ${chips('when', TX_WHEN)}
    </div>`,
    body() {
        const list = filterTx();
        const of = t => list.filter(x => x.type === t);
        const box = (icon, tone, label, value) => `<div><span class="tile ${tone}">${ic(icon, 18)}</span><span><small>${label}</small><b>${value}</b></span></div>`;
        const head = `<div class="sum-line">
            ${box('sale', 'tone-sale', 'Фурӯш', fmt(netRev(list), 2))}
            ${box('fix', 'tone-warn', 'Фоида', fmt(netProfit(list), 2))}
            ${box('in', 'tone-buy', 'Воридот', fmt(of('PURCHASE').reduce((s, x) => s + txCost(x), 0), 2))}
            ${box('wallet', 'tone-exp', 'Хароҷот', fmt(sumExp(of('EXPENSE')), 2))}
            ${box('move', 'tone-move', 'Интиқол', `${qty(sumQty(of('TRANSFER')))} воҳид`)}
        </div>`;
        if (!list.length) return head + empty('Амалиёт ёфт нашуд', 'Шарти ҷустуҷӯ ё санаро иваз кунед.');
        const shown = list.slice(0, S.limit);
        const groups = new Map();
        shown.forEach(x => { const d = dayOf(x); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(x); });
        return head + [...groups.entries()].map(([d, items]) => {
            const dayRev = netRev(list.filter(x => dayOf(x) === d));
            return `<div class="day-h"><span>${esc(dayLabel(d))}</span>${dayRev ? `<span class="num">Фурӯш: ${money(dayRev)}</span>` : ''}</div>
            <div class="rows">${items.map(x => {
                if (x.type === 'EXPENSE') return `<button class="row tx-row" data-act="expEdit" data-id="${esc(x.eid)}">
                    <span class="tile tone-exp">${ic('wallet', 20)}</span>
                    <span class="tx-b"><b>${esc(x.category)}</b><small>Хароҷот${x.location_id !== '' ? ' · ' + esc(locName(x.location_id)) : ''}${x.note ? ' · ' + esc(x.note) : ''}</small></span>
                    <span class="tx-v"><b class="minus">−${money(x.amount)}</b></span></button>`;
                const p = prodBy(x.product_id) || { id: x.product_id, name: 'Мол #' + x.product_id };
                const T = TYPES[x.type] || { t: x.type, icon: 'fix' };
                const sign = isSale(x) ? 'plus' : isRet(x) ? 'minus' : '';
                return `<button class="row tx-row" data-act="txView" data-id="${esc(x.id)}">
                    <span class="tx-p">${thumb(p)}<span class="tile ${esc(x.type)}">${ic(T.icon, 13)}</span></span>
                    <span class="tx-b"><b>${esc(p.name)}</b><small>${esc(T.t)} · ${esc(txRoute(x))}${timeOf(x) ? ' · ' + timeOf(x) : ''}</small></span>
                    <span class="tx-v"><b class="${sign}">${isRet(x) ? '−' : ''}${money(txValue(x))}</b><small>${txQty(x, p)} × ${fmt(txPrice(x), 2)}</small></span>
                </button>`;
            }).join('')}</div>`;
        }).join('') + moreBtn(shown.length, list.length);
    }
};

/* ---------- 5. Танзимот ---------- */
const HELP = [
    ['Фурӯшро чӣ тавр сабт мекунам?', 'Тугмаи «Фурӯш»-ро пахш кунед, номи молро нависед ва онро интихоб кунед. Дар як чек метавонед якчанд мол илова кунед. Миқдор ва нархро санҷед ва «Сабт кардан»-ро пахш кунед. Миқдори мол дар анбор худ аз худ кам мешавад.'],
    ['Моли омадаро чӣ тавр сабт мекунам?', 'Тугмаи «Воридот»-ро пахш кунед ва ҷоеро интихоб кунед, ки мол ба он ҷо омад. Агар мол дар рӯйхат набошад, номашро нависед ва «Моли нав»-ро интихоб кунед. Нархи нав дар корти мол ҳам иваз мешавад.'],
    ['Акси молро чӣ тавр мегузорам?', 'Молро кушоед ва «Тағйир додан»-ро пахш кунед, ё ҳангоми иловаи моли нав дар болои форма «Камера» ё «Галерея»-ро интихоб кунед. Акс дар рӯйхати молҳо, анбор ва амалиётҳо нишон дода мешавад.'],
    ['Молро аз анбор ба мағоза чӣ тавр мегузаронам?', 'Тугмаи «Интиқол»-ро пахш кунед, ҷойи баромад ва ҷойи расиданро интихоб кунед, баъд мол ва миқдорашро нависед. Барнома нишон медиҳад, ки дар ҳар ҷой чанд мемонад.'],
    ['Амалиёти хато сабтшударо чӣ кор кунам?', 'Дар саҳифаи «Амалиётҳо» онро кушоед. Метавонед тағйир диҳед ё нест кунед. Ҳисоби мол худ аз худ аз нав дуруст мешавад.'],
    ['Мизоҷ молро баргардонд', 'Амалиёти фурӯшро дар саҳифаи «Амалиётҳо» кушоед ва «Бозгашт»-ро пахш кунед. Мол ба ҷояш бармегардад ва маблағ аз фурӯш кам мешавад.'],
    ['Миқдори мол бо ҳисоб рост намеояд', 'Молро дар ҷояш ҳисоб кунед. Дар саҳифаи «Анбор» тугмаи «Шумориш»-ро пахш кунед ва миқдори аслиро нависед. Барнома фарқро худаш сабт мекунад.'],
    ['Хароҷотро чӣ тавр сабт мекунам?', 'Дар саҳифаи асосӣ тугмаи «Хароҷот»-ро пахш кунед ва маблағ, сана ва сабабро нависед: иҷора, маош, нақлиёт ва ғайра. Хароҷот аз фоида кам мешавад ва дар саҳифаи асосӣ нишон дода мешавад.'],
    ['Молро ба қарз (насия) чӣ тавр мефурӯшам?', 'Дар тирезаи «Фурӯш» молро интихоб кунед ва дар қисми «Пардохт» «Ба қарз (насия)»-ро пахш кунед. Номи мизоҷ ва телефонашро нависед. Агар мизоҷ ҳозир як қисми пулро медиҳад, онро дар «Ҳозир медиҳад» нависед. Агар хоҳед, рӯзеро гузоред, ки то он пулро медиҳад. Мол аз анбор кам мешавад ва қарз дар бахши «Қарз» пайдо мешавад.'],
    ['Мизоҷ як қисми қарзашро овард — чӣ кор кунам?', 'Бахши «Қарз»-ро кушоед, мизоҷро ёбед ва «Пардохт»-ро пахш кунед. Маблағеро, ки овард, нависед ва «Сабт кардан»-ро пахш кунед. Боқимонда худ аз худ кам мешавад. Агар мизоҷ якчанд қарз дошта бошад, пул аввал ба қарзи кӯҳнатарин меравад.'],
    ['Қарзро чӣ тавр пурра мебандам?', 'Мизоҷро кушоед ва «Пурра бастан»-ро пахш кунед — маблағи боқимонда худаш навишта мешавад. Баъди сабт қарз ба рӯйхати «Пӯшида» мегузарад, вале таърихаш боқӣ мемонад.'],
    ['Чеки насияро чӣ тавр ба мизоҷ мефиристам?', 'Дар бахши «Қарз» дар қатори мизоҷ «Чек»-ро пахш кунед (ё дар корти мизоҷ «Чеки насия»). Барнома чеки зебо ва расмии PNG месозад, ки дар он номи харидор, рӯйхати молҳо, пардохтҳо ва маблағи боқимонда сабт шудааст. Бо пахши «Фиристодан ба мизоҷ» метавонед онро мустақиман ба Telegram ё WhatsApp фиристед.'],
    ['Қарзи кӯҳнаро чӣ тавр сабт мекунам?', 'Агар мизоҷ пеш аз барнома қарздор буд, дар бахши «Қарз» «Қарзи нав»-ро пахш кунед ва ном, телефон, маблағ ва санаро нависед. Ин қарз ба пули ин давра таъсир намекунад, чунки мол пештар дода шуда буд.'],
    ['Агар мизоҷ моли ба қарз гирифтаро баргардонад?', 'Фурӯшро дар «Амалиётҳо» кушоед ва «Бозгашт»-ро пахш кунед. Мол ба анбор бармегардад ва маблағи он аз қарзи мизоҷ худ аз худ кам мешавад.'],
    ['Ҳисоботро чӣ тавр мебинам?', 'Саҳифаи «Ҳисобот»-ро кушоед ва бахшро интихоб кунед: Умумӣ, Фурӯш, Фоида, Қарз, Хароҷот, Воридот ё Интиқол. Давраро интихоб кунед ё сана нависед. Бо тугмаи «Филтр» анбор, гурӯҳ, номи мол ва намуди хароҷотро интихоб кардан мумкин аст. Тугмаи CSV ҷадвалро ба файл мегирад.'],
    ['Молро дигар намефурӯшам, вале таърихаш бояд монад', 'Молро кушоед, «Тағйир додан»-ро пахш кунед ва «Ба бойгонӣ гузоштан»-ро интихоб кунед. Мол аз рӯйхат пинҳон мешавад, вале таърихи фурӯш боқӣ мемонад.'],
    ['Маълумот дар куҷо нигоҳ дошта мешавад?', 'Ҳама чиз дар ҷадвали Google нигоҳ дошта мешавад. Барнома маълумотро ҳар дақиқа ва ҳангоми кушодан нав мекунад. Агар дар ҷадвал чизеро дастӣ иваз кунед, он дар барнома низ пайдо мешавад. Ғайр аз ин, сервер ҳар рӯз нусхаи эҳтиётии ҷадвалро нигоҳ медорад.']
];

PAGES.set = {
    body() {
        const dark = getTheme() === 'dark';
        const synced = S.syncedAt ? new Date(S.syncedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
        const item = (icon, tone, title, sub, act, id = '', label = 'Тағйир додан') => `<button class="set-item" data-act="${act}" ${id !== '' ? `data-id="${esc(id)}"` : ''}>
            <span class="tile ${tone}">${ic(icon, 18)}</span><span class="set-t"><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="btn sm t-buy">${ic(label === 'Нав кардан' ? 'sync' : 'edit', 14)}${label}</span></button>`;
        return `
        <section class="profile">
            <span class="profile-a">${esc(String(S.user || '?').slice(0, 1).toUpperCase())}</span>
            <span class="profile-t"><b>${esc(S.cfg.company_name || 'DELUS')}</b><small>${esc(S.user || '')}</small></span>
            <span class="profile-s"><i class="${S.offline ? 'off' : ''}"></i>${S.offline ? 'Пайваст нест' : 'Пайваст аст'}</span>
        </section>

        <div class="cols">
            <div class="stack">
                <div class="card theme-card">
                    <span class="set-t"><b>Намуди барнома</b><small data-theme-t>${dark ? 'Торик' : 'Рӯшан'}</small></span>
                    <button class="theme-sw ${dark ? 'dark' : ''}" data-act="theme" role="switch" aria-checked="${dark}" aria-label="Мавзӯи торик">
                        <span class="sw-ic sw-sun">${ic('sun', 18)}</span><span class="sw-ic sw-moon">${ic('moon', 17)}</span><span class="sw-knob"></span>
                    </button>
                </div>

                <div class="card list-card">
                    <h2 class="list-h">Умумӣ</h2>
                    ${item('tag', 'tone-buy', 'Номи ширкат', S.cfg.company_name || 'DELUS', 'cfgName')}
                    ${item('warn', 'tone-warn', 'Огоҳии кам мондани мол', `Вақте мол ${qty(S.cfg.low_stock_default)} ё камтар монад`, 'cfgLow')}
                    ${item('lock', 'tone-move', 'Логин ва парол', S.user || '', 'cfgPass')}
                </div>

                <div class="card list-card">
                    <div class="list-top"><h2 class="list-h">Анборҳо ва мағозаҳо</h2><button class="btn sm t-buy" data-act="locNew">${ic('plus', 14)}Илова</button></div>
                    ${S.locations.map(l => item(l.location_type === 'Shop' ? 'sale' : 'box', l.location_type === 'Shop' ? 'tone-sale' : 'tone-buy', l.name, (l.location_type === 'Shop' ? 'Мағоза' : 'Анбор') + (isActive(l) ? '' : ' · ғайрифаъол'), 'locEdit', l.id)).join('')}
                </div>
            </div>

            <div class="stack">
                <div class="card list-card">
                    <h2 class="list-h">Ҷадвали Google</h2>
                    ${S.sheet ? `<a class="set-item" href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(S.sheet)}/edit" target="_blank" rel="noopener">
                        <span class="tile tone-sale">${ic('sheet', 18)}</span><span class="set-t"><b>Кушодани ҷадвал</b><small>${fmt(S.products.length)} мол · ${fmt(S.tx.length)} амалиёт · ${fmt(S.exp.length)} хароҷот</small></span><span class="btn sm t-sale">${ic('sheet', 14)}Кушодан</span></a>` : ''}
                    ${item('sync', 'tone-buy', 'Навсозӣ', `Охирин бор: ${synced}`, 'sync', '', 'Нав кардан')}
                </div>

                <div class="card list-card">
                    <h2 class="list-h">Дастур</h2>
                    ${HELP.map(([q, a]) => `<details class="help"><summary><span>${esc(q)}</span>${ic('right', 15)}</summary><p>${esc(a)}</p></details>`).join('')}
                </div>

                <button class="btn danger block lg" data-act="logout">${ic('out', 16)}Баромадан</button>
            </div>
        </div>`;
    }
};

const systemDark = () => { try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; } };
function getTheme() {
    let t = '';
    try { t = localStorage.getItem('delus.theme') || ''; } catch (e) { }
    return t === 'dark' || t === 'light' ? t : (systemDark() ? 'dark' : 'light');
}
function setTheme(k) {
    try { localStorage.setItem('delus.theme', k); } catch (e) { }
    document.documentElement.dataset.theme = k;
}
