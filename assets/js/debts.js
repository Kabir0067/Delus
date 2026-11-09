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
                <div><small>Ҳамагӣ қарз</small><b>${fmt(c.amount, 2)}</b></div>
                <div><small>Супорид</small><b class="pos">${fmt(c.paid, 2)}</b></div>
                <div><small>Боқимонда</small><b class="${c.left > MONEY_EPS ? 'neg' : 'pos'}">${fmt(c.left, 2)}</b></div>
                <div><small>Пардохт шуд</small><b>${pctPaid(c)}%</b></div>
            </div>
            <div class="debtor-bar big"><i style="width:${pctPaid(c)}%"></i></div>
            <div class="quick">
                ${c.left > MONEY_EPS ? `<button class="btn t-sale" data-pay>${ic('wallet', 16)}Пардохт</button>
                <button class="btn t-buy" data-full>${ic('check', 16)}Пурра бастан</button>` : ''}
                <button class="btn" data-new>${ic('plus', 16)}Қарзи нав</button>
                ${c.phone ? `<a class="btn" href="${esc(telHref(c.phone))}">${ic('phone', 16)}Занг</a>` : ''}
            </div>

            <p class="sec-t">Қарзҳо</p>
            ${[...c.debts].reverse().map(d => {
                const items = debtItems(d);
                return `<div class="debt-row ${d._closed ? 'closed' : ''}">
                    <div class="debt-row-h">
                        <span><b>${money(d.amount)}</b><small>${esc(dayLabel(dayOf(d)))}${d.receipt_code ? ` · чек ${esc(d.receipt_code)}` : ' · қарзи дастӣ'}${d.due_date ? ` · то ${esc(dotDate(String(d.due_date).slice(0, 10)))}` : ''}</small></span>
                        <span class="debt-row-v">${d._closed ? `<span class="pill good">Пӯшида</span>` : `${d._late ? '<span class="pill bad">Мӯҳлат гузашт</span>' : ''}<b>${money(d._left)}</b><small>боқимонда</small>`}</span>
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
