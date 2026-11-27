/* DELUS — паёмҳо, тирезаҳо ва навигатсия */
'use strict';

/* ==================================================================
   ПАЁМ ВА ТИРЕЗАҲО
   ================================================================== */
function toast(text, kind = '') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = `${ic(kind === 'err' ? 'warn' : 'check', 17)}<span>${esc(text)}</span>`;
    box.append(t);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => t.remove(), kind === 'err' ? 5200 : 2800);
}
const errText = e => (e && e.known) ? e.message : MSG.fail;
const showErr = e => { if (!e.known) console.error(e); toast(errText(e), 'err'); };

const Modal = {
    stack: [],
    open({ title, sub = '', icon = '', tone = '', body = '', foot = '', size = '', form = false, onClose }) {
        const ov = document.createElement('div');
        ov.className = 'ov';
        const tag = form ? 'form' : 'div';
        ov.innerHTML = `<${tag} class="sheet ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1" ${form ? 'novalidate' : ''}>
            <div class="sheet-h">
                <div class="sheet-t">${icon ? `<span class="tile ${tone}">${ic(icon, 20)}</span>` : ''}<div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div></div>
                <button type="button" class="icon-btn" data-close aria-label="Пӯшидан">${ic('x', 18)}</button>
            </div>
            <div class="sheet-b">${body}</div>
            ${foot ? `<div class="sheet-f">${foot}</div>` : ''}
        </${tag}>`;
        const m = { el: ov, sheet: ov.firstElementChild, onClose, back: document.activeElement, close: () => Modal.close(m) };
        ov.addEventListener('mousedown', e => { if (e.target === ov) m.close(); });
        $('[data-close]', ov).onclick = () => m.close();
        /* Дар телефон тиреза бо кашидани сарлавҳа ба поён баста мешавад */
        const grip = $('.sheet-h', ov);
        let y0 = null, dy = 0;
        grip.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; m.sheet.style.transition = 'none'; }, { passive: true });
        grip.addEventListener('touchmove', e => {
            if (y0 === null) return;
            dy = Math.max(0, e.touches[0].clientY - y0);
            m.sheet.style.transform = `translateY(${dy}px)`;
        }, { passive: true });
        grip.addEventListener('touchend', () => {
            m.sheet.style.transition = 'transform .18s';
            if (dy > 90) m.close(); else m.sheet.style.transform = '';
            y0 = null;
        });
        $('#modals').append(ov);
        ov.style.zIndex = 30 + Modal.stack.length;
        document.documentElement.classList.add('locked');
        if (!Modal.stack.length && !(history.state && history.state.modal)) {
            try { history.pushState({ modal: true }, ''); } catch (e) { }
        }
        Modal.stack.push(m);
        const auto = $('[data-auto]', ov);
        (auto && matchMedia('(hover: hover)').matches ? auto : m.sheet).focus({ preventScroll: true });
        return m;
    },
    remove(m) {
        const i = Modal.stack.indexOf(m);
        if (i < 0) return;
        Modal.stack.splice(i, 1);
        m.el.remove();
        if (m.onClose) m.onClose();
        if (!Modal.stack.length) document.documentElement.classList.remove('locked');
        if (m.back && m.back.isConnected) m.back.focus({ preventScroll: true });
    },
    close(m) {
        Modal.remove(m || Modal.top());
        /* Агар дарҳол тирезаи нав кушода нашавад, таърихи браузерро як қадам бармегардонем.
           Танҳо як бор: вақте якчанд тиреза якбора баста мешавад, ду «қафо» барномаро тарк мекард. */
        if (Modal.backTimer || Modal.ownBack) return;
        Modal.backTimer = setTimeout(() => {
            Modal.backTimer = 0;
            if (!Modal.stack.length && history.state && history.state.modal) { Modal.ownBack = true; history.back(); }
        }, 0);
    },
    closeAll() { [...Modal.stack].reverse().forEach(m => Modal.close(m)); },
    top: () => Modal.stack[Modal.stack.length - 1]
};

window.addEventListener('popstate', () => {
    /* Қафогардие, ки худи барнома пас аз бастани тиреза кард: агар дар ин миён тирезаи нав кушода шуда бошад, онро намебандем */
    if (Modal.ownBack) {
        Modal.ownBack = false;
        if (Modal.stack.length) { try { history.pushState({ modal: true }, ''); } catch (e) { } }
        return;
    }
    if (Modal.stack.length) {
        /* тиреза метавонад «қафо»-ро худаш истифода барад (масалан, фурӯш: аз сабад ба каталог) */
        const top = Modal.top();
        if (!(top.onBack && top.onBack())) Modal.remove(top);
        if (Modal.stack.length) { try { history.pushState({ modal: true }, ''); } catch (e) { } }
        return;
    }
    const k = location.hash.slice(1) || 'home';
    if (S.user && k !== S.page && NAV.some(n => n.k === k)) go(k, {}, false);
});

document.addEventListener('keydown', e => {
    const m = Modal.top();
    if (!m) return;
    if (e.key === 'Escape') { e.preventDefault(); m.close(); return; }
    if (e.key !== 'Tab') return;
    const all = $$('button, input, select, textarea, a[href], summary', m.sheet).filter(x => !x.disabled && x.offsetParent !== null);
    if (!all.length) return;
    const first = all[0], last = all[all.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === m.sheet)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* Баландии воқеии экран: клавиатураи телефон тирезаро напӯшонад */
if (window.visualViewport) {
    const fit = () => document.documentElement.style.setProperty('--vvh', visualViewport.height + 'px');
    visualViewport.addEventListener('resize', fit);
    fit();
}

function ask({ title, text = '', ok = 'Тасдиқ', danger = false, cancel = 'Бекор кардан' }) {
    return new Promise(res => {
        let done = false;
        const m = Modal.open({
            title, size: 'sm',
            body: text ? `<p class="card-p" style="margin:0">${esc(text)}</p>` : '',
            foot: `<button type="button" class="btn" data-no>${esc(cancel)}</button>
                   <button type="button" class="btn ${danger ? 'danger-solid' : 'primary'}" data-yes>${esc(ok)}</button>`,
            onClose: () => { if (!done) res(false); }
        });
        $('[data-no]', m.el).onclick = () => m.close();
        $('[data-yes]', m.el).onclick = () => { done = true; m.close(); res(true); };
    });
}

/* Тирезаи форма: хатогиро дар дохили худаш нишон медиҳад, дубора фиристода намешавад */
function formModal({ title, sub, icon, tone, body, submit = 'Сабт кардан', submitClass = 'primary', size, footExtra = '', footClass = '', onSubmit, onClose }) {
    const m = Modal.open({
        title, sub, icon, tone, body: body + '<p class="form-err" data-err hidden style="margin-top:14px"></p>', size, form: true, onClose,
        foot: `${footExtra}<button type="button" class="btn lg" data-cancel>Бекор кардан</button>
               <button type="submit" class="btn ${submitClass} lg" data-save>${esc(submit)}</button>`
    });
    if (footClass) $('.sheet-f', m.el).classList.add(footClass);
    const err = $('[data-err]', m.el), save = $('[data-save]', m.el);
    $('[data-cancel]', m.el).onclick = () => m.close();
    m.fail = msg => {
        err.textContent = msg;
        err.hidden = false;
        err.scrollIntoView({ block: 'nearest' });
    };
    m.sheet.addEventListener('submit', async e => {
        e.preventDefault();
        if (save.disabled) return;
        err.hidden = true;
        save.disabled = true;
        const label = save.textContent;
        save.textContent = 'Сабт мешавад…';
        try {
            const data = Object.fromEntries(new FormData(m.sheet).entries());
            const r = await onSubmit(data, m);
            if (r !== false) m.close();
        } catch (ex) {
            if (!ex.known) console.error(ex);
            m.fail(errText(ex));
        } finally {
            save.disabled = false;
            save.textContent = label;
        }
    });
    return m;
}
const bad = text => known(text);
const field = (label, input, hint = '') => `<label class="field"><span class="field-l">${label}</span>${input}${hint ? `<span class="field-h">${hint}</span>` : ''}</label>`;
const options = (list, sel) => list.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`).join('');
const locOptions = sel => options(activeLocs().map(l => [l.id, l.name]), sel);

/* ==================================================================
   РАҚАМҲО ДАР ТЕЛЕФОН: КАЛКУЛЯТОРИ КАЛОН
   Дар телефон майдони рақам (data-numpad) клавиатураи телефонро намекушояд: тугмаҳои калони рақам аз поён мебароянд.
   Экран намеҷаҳад, сабад ва ҷамъ пӯшида намешаванд, бо як ангушт навиштан осон аст.
   Ҳисоб ҳам мешавад: «12+8» ё «3×250». Дар компютер клавиатураи оддӣ мемонад.
   ================================================================== */
function npCalc(str) {
    const s = String(str || '').replace(/,/g, '.').replace(/×/g, '*').replace(/−/g, '-').replace(/\s+/g, '');
    if (!s || !/^[0-9.+*-]+$/.test(s)) return NaN;
    let total = 0;
    for (const term of s.match(/[+-]?[^+-]+/g) || []) {
        const sign = term[0] === '-' ? -1 : 1;
        let prod = 1;
        for (const f of term.replace(/^[+-]/, '').split('*')) {
            const v = parseFloat(f);
            if (!isFinite(v)) return NaN;
            prod *= v;
        }
        total += sign * prod;
    }
    return isFinite(total) ? round3(total) : NaN;
}

/* Танҳо экрани ламсӣ бе муш ва клавиатура (телефон, планшет) */
const touchOnly = () => {
    try { return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches; } catch (e) { return false; }
};

/* opts: { label, hint, chips: [[value, text]], raw (рақамҳо бе ҳисоб, масалан штрихкод), onDone(value) } */
function openNumpad(inp, opts = {}) {
    if (!inp || inp.disabled) return;
    const fld = inp.closest('.field, .nbox, .qty-box');
    const lab = fld && $('.field-l, .nbox-l', fld);
    const label = opts.label || inp.dataset.npLabel || (lab ? lab.textContent.replace(/\(.*?\)/g, '').trim() : '') || 'Рақам';
    const hint = opts.hint ?? (inp.dataset.npHint || '');
    const chips = opts.chips || (inp.dataset.npChips ? inp.dataset.npChips.split('|').filter(Boolean).map(x => { const [v, t] = x.split('~'); return [v, t || v]; }) : []);
    let expr = String(inp.value ?? '').trim().replace(/\s/g, '');
    let fresh = expr !== '';   // пахши аввал рақами кӯҳнаро иваз мекунад, мисли калкулятор
    const key = (k, t = k, cls = '') => `<button type="button" class="np-k ${cls}" data-k="${k}">${t}</button>`;
    const m = Modal.open({
        title: label, sub: hint, size: 'np',
        body: `<div class="np-disp" aria-live="polite"><span class="np-x" data-x></span><span class="np-r" data-r></span></div>
            ${chips.length ? `<div class="np-chips">${chips.map(([v, t]) => `<button type="button" class="np-chip" data-v="${esc(v)}">${esc(t)}</button>`).join('')}</div>` : ''}
            <div class="np-grid">
                ${key(7)}${key(8)}${key(9)}${key('bk', '⌫', 'op')}
                ${key(4)}${key(5)}${key(6)}${key('×', '×', 'op')}
                ${key(1)}${key(2)}${key(3)}${key('+', '+', 'op')}
                ${key('C', 'C', 'op')}${key(0)}${key('.', ',')}${key('−', '−', 'op')}
            </div>`,
        foot: `<button type="button" class="btn lg np-kbd" data-kbd>${ic('edit', 16)}Клавиатура</button>
            <button type="button" class="btn sale-solid lg" data-ok>${ic('check', 18)}Тайёр</button>`
    });
    const xEl = $('[data-x]', m.el), rEl = $('[data-r]', m.el);
    const ops = '×+−';
    const draw = () => {
        xEl.textContent = (expr || '0').replace(/\./g, ',');
        xEl.classList.toggle('fresh', fresh && !!expr);
        const v = [...ops].some(o => expr.includes(o)) ? npCalc(expr) : NaN;
        rEl.textContent = isFinite(v) ? '= ' + fmt(v, 3) : '';
    };
    const commit = () => {
        const v = expr === '' ? '' : opts.raw ? expr.replace(/\D/g, '') : npCalc(expr);
        if (v !== '' && !opts.raw && !isFinite(v)) { m.sheet.classList.remove('np-bad'); void m.sheet.offsetWidth; m.sheet.classList.add('np-bad'); return; }
        const out = v === '' || opts.raw ? String(v) : String(Math.max(0, v));
        inp.value = out;
        m.close();
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        if (opts.onDone) opts.onDone(out);
    };
    const press = k => {
        if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) { }
        if (k === 'C') { expr = ''; fresh = false; return draw(); }
        if (k === 'bk') { expr = fresh ? '' : expr.slice(0, -1); fresh = false; return draw(); }
        if (ops.includes(k)) {
            if (opts.raw) return;
            fresh = false;
            if (!expr) return;
            expr = ops.includes(expr.slice(-1)) ? expr.slice(0, -1) + k : expr + k;
            return draw();
        }
        if (fresh) { expr = ''; fresh = false; }
        const last = expr.split(/[×+−]/).pop();
        if (k === '.' && opts.raw) return;
        if (k === '.') { if (!last.includes('.')) expr += last ? '.' : '0.'; return draw(); }
        if (last === '0' && !opts.raw) expr = expr.slice(0, -1);
        if (expr.length < (opts.raw ? 40 : 16)) expr += k;
        draw();
    };
    m.el.addEventListener('click', e => {
        const k = e.target.closest('[data-k]');
        if (k) return press(k.dataset.k);
        const c = e.target.closest('[data-v]');
        if (c) { expr = c.dataset.v; fresh = false; return commit(); }
        if (e.target.closest('[data-ok]')) return commit();
        if (e.target.closest('[data-kbd]')) {
            m.close();
            inp.readOnly = false;
            inp.inputMode = 'decimal';
            inp.dataset.npOff = '1';
            setTimeout(() => { inp.focus(); inp.select(); }, 60);
        }
    });
    m.el.addEventListener('keydown', e => {
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
        else if (e.key === ',' || e.key === '.') { e.preventDefault(); press('.'); }
        else if (e.key === '+') { e.preventDefault(); press('+'); }
        else if (e.key === '-') { e.preventDefault(); press('−'); }
        else if (e.key === '*' || e.key === 'x') { e.preventDefault(); press('×'); }
        else if (e.key === 'Backspace') { e.preventDefault(); press('bk'); }
        else if (e.key === 'Enter') { e.preventDefault(); commit(); }
    });
    draw();
    return m;
}

/* Майдонҳои рақам дар телефон: клавиатураи телефон намебарояд, пахш — калкулятор */
function numpadReady(root) {
    if (!touchOnly()) return;
    const list = root.matches && root.matches('input[data-numpad]') ? [root] : $$('input[data-numpad]', root);
    list.forEach(inp => {
        if (inp.dataset.npOff) return;
        inp.readOnly = true;
        inp.inputMode = 'none';
        inp.classList.add('np-in');
    });
}
new MutationObserver(list => {
    if (!touchOnly()) return;
    for (const r of list) for (const n of r.addedNodes) if (n.nodeType === 1) numpadReady(n);
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('click', e => {
    const inp = e.target.closest && e.target.closest('input[data-numpad]');
    if (inp && inp.readOnly && !inp.dataset.npOff && touchOnly()) { e.preventDefault(); openNumpad(inp); }
});
/* пас аз навиштан бо клавиатура майдон боз ба калкулятор бармегардад */
document.addEventListener('focusout', e => {
    const inp = e.target.closest && e.target.closest('input[data-numpad]');
    if (inp && inp.dataset.npOff) { delete inp.dataset.npOff; numpadReady(inp); }
});

/* ==================================================================
   НАВИГАТСИЯ ВА НАМОИШ
   ================================================================== */
/* Огоҳӣ танҳо молҳоеро мешуморад, ки корбар ҳанӯз дар «Анбор» надидааст.
   Моле, ки бақияаш барқарор шуд, аз рӯйхати дидашуда меравад ва дафъаи дигар боз огоҳ мекунад. */
function unseenNeed() {
    const need = activeProds().filter(p => stockState(p) !== 'ok').map(p => String(p.id));
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem('delus.needSeen')) || []; } catch (e) { }
    seen = S.page === 'stock' ? need : seen.filter(id => need.includes(id));
    try { localStorage.setItem('delus.needSeen', JSON.stringify(seen)); } catch (e) { }
    return need.filter(id => !seen.includes(id)).length;
}

function drawNav() {
    const low = unseenNeed();
    $('#sideNav').innerHTML = NAV.map(n => `<button class="nav-a ${n.k === S.page ? 'on' : ''}" data-act="go" data-page="${n.k}" ${n.k === S.page ? 'aria-current="page"' : ''}>
        ${ic(n.icon, 19)}<span>${n.t}</span>${n.k === 'stock' && low ? `<span class="nav-n">${low}</span>` : ''}</button>`).join('');
    /* Телефон: чор саҳифаи асосӣ ва «Бештар» барои боқимонда */
    const tabs = NAV.filter(n => TAB_MAIN.includes(n.k));
    const inMore = !TAB_MAIN.includes(S.page);
    $('#tabNav').innerHTML = tabs.map(n => `<button class="tab ${n.k === S.page ? 'on' : ''}" data-act="go" data-page="${n.k}" ${n.k === S.page ? 'aria-current="page"' : ''}>
        <i>${ic(n.icon, 21)}${n.k === 'stock' && low ? '<b class="tab-n"></b>' : ''}</i><span>${n.t}</span></button>`).join('') +
        `<button class="tab ${inMore ? 'on' : ''}" data-act="navMore" aria-haspopup="dialog"><i>${ic('more', 21)}</i><span>${inMore ? (NAV.find(n => n.k === S.page) || {}).t : 'Бештар'}</span></button>`;
}
const TAB_MAIN = ['home', 'prod', 'stock', 'debt'];

function moreSheet() {
    const items = NAV.filter(n => !TAB_MAIN.includes(n.k));
    const m = Modal.open({
        title: 'Бештар', size: 'sm',
        body: `<div class="more-grid">${items.map(n => `<button class="more-i ${n.k === S.page ? 'on' : ''}" data-act="go" data-page="${n.k}">
            <span class="tile ${{ tx: 'tone-move', rep: 'tone-buy', set: 'tone-warn' }[n.k] || ''}">${ic(n.icon, 22)}</span><b>${n.t}</b><small>${n.s}</small></button>`).join('')}
            <button class="more-i" data-act="logout"><span class="tile tone-bad">${ic('out', 22)}</span><b>Баромадан</b><small>${esc(S.user || '')}</small></button></div>`
    });
    return m;
}

/* ==================================================================
   ФИЛТР: тирезаи калон бо тугмаҳо, на рӯйхатҳои кушодашаванда
   sections: [{ key, label, opts: [[value, text, html]] }]      — тугмаҳо (value '' = ҳама)
             [{ key: ['from', 'to'], label, type: 'dates' }]    — аз сана то сана
             [{ key, label, type: 'text', ph }]                 — матн
   state — филтрҳои ҳозира, count(state) — чанд натиҷа мешавад, apply(state) — истифода
   ================================================================== */
function filterSheet({ title = 'Филтр', sections, state, count, apply, unit = 'мол' }) {
    const st = { ...state };
    const keys = sections.flatMap(s => Array.isArray(s.key) ? s.key : [s.key]);
    const m = Modal.open({
        title, size: 'fs', icon: 'filter', tone: 'tone-buy',
        body: '<div class="fs" data-fs></div>',
        foot: `<button type="button" class="btn lg" data-reset>${ic('x', 16)}Тоза кардан</button><button type="button" class="btn primary lg" data-apply></button>`
    });
    const box = $('[data-fs]', m.el), btn = $('[data-apply]', m.el);
    const label = () => {
        const n = count(st);
        btn.textContent = n ? `Нишон додан: ${fmt(n)} ${unit}` : 'Ҳеҷ чиз ёфт намешавад';
        btn.classList.toggle('none', !n);
    };
    const draw = () => {
        box.innerHTML = sections.map(s => {
            if (s.type === 'dates') return `<section class="fs-s"><h4>${esc(s.label)}</h4><div class="dates">
                <input class="input" type="date" data-in="${s.key[0]}" value="${esc(st[s.key[0]] || '')}" aria-label="Аз сана"><span>то</span>
                <input class="input" type="date" data-in="${s.key[1]}" value="${esc(st[s.key[1]] || '')}" aria-label="То сана"></div></section>`;
            if (s.type === 'text') return `<section class="fs-s"><h4>${esc(s.label)}</h4>
                <input class="input" type="search" data-in="${s.key}" value="${esc(st[s.key] || '')}" placeholder="${esc(s.ph || '')}" autocomplete="off"></section>`;
            return `<section class="fs-s"><h4>${esc(s.label)}</h4><div class="fs-chips">${s.opts.map(([v, t, html]) => {
                const on = String(st[s.key] || '') === String(v);
                return `<button type="button" class="fchip ${on ? 'on' : ''}" data-k="${esc(s.key)}" data-v="${esc(v)}" aria-pressed="${on}">${html || ''}<span>${esc(t)}</span>${on ? ic('check', 15) : ''}</button>`;
            }).join('')}</div></section>`;
        }).join('');
        label();
    };
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        st[b.dataset.k] = b.dataset.v;
        draw();
    });
    box.addEventListener('input', e => { const k = e.target.dataset.in; if (k) { st[k] = e.target.value; label(); } });
    $('[data-reset]', m.el).onclick = () => { keys.forEach(k => { st[k] = ''; }); draw(); };
    btn.onclick = () => { m.close(); apply(st); };
    draw();
    return m;
}

/* Филтрҳои интихобшуда дар болои рӯйхат: ҳар кадом бо «×» пок мешавад */
const filterPills = (list, allAct = 'fDropAll') => !list.length ? '' : `<div class="fpills">${list.map(([text, key, act = 'fDrop', html = '']) =>
    `<button type="button" class="fpill" data-act="${act}" data-key="${esc(key)}" aria-label="Пок кардан: ${esc(text)}">${html}<span>${esc(text)}</span>${ic('x', 13)}</button>`).join('')}
    ${list.length > 1 ? `<button type="button" class="fpill clear" data-act="${allAct}">Ҳамаро пок кардан</button>` : ''}</div>`;

/* Интихоб аз якчанд роҳ: калиди тугмаи интихобшуда ё null бармегардад */
function choose({ title, text = '', options }) {
    return new Promise(res => {
        let done = false;
        const m = Modal.open({
            title, size: 'sm',
            body: `${text ? `<p class="card-p" style="margin:0 0 14px">${esc(text)}</p>` : ''}<div class="choose">${options.map(([k, label, cls]) =>
                `<button type="button" class="btn lg block ${cls || ''}" data-k="${esc(k)}">${esc(label)}</button>`).join('')}
                <button type="button" class="btn lg block quiet" data-k="">Бекор кардан</button></div>`,
            onClose: () => { if (!done) res(null); }
        });
        $('.choose', m.el).addEventListener('click', e => {
            const b = e.target.closest('[data-k]');
            if (!b) return;
            done = true;
            m.close();
            res(b.dataset.k || null);
        });
    });
}

function go(page, filters = {}, push = true) {
    if (Modal.stack.length) Modal.closeAll();
    const changed = page !== S.page;
    if (changed) { S.selOn = false; S.sel.clear(); }
    S.page = page;
    S.f = filters;
    S.limit = PAGE_SIZE;
    if (push && changed) { try { history.pushState({}, '', '#' + page); } catch (e) { } }
    renderPage();
    window.scrollTo(0, 0);
}

const PAGES = {};

function renderPage() {
    const meta = NAV.find(n => n.k === S.page);
    $('#app').dataset.page = S.page;
    $('#pageTitle').textContent = meta.t;
    $('#pageSub').textContent = meta.s || todayLong();
    $('#brandName').textContent = S.cfg.company_name || 'DELUS';
    document.title = `${meta.t} · ${S.cfg.company_name || 'DELUS'}`;
    drawNav();
    const pg = PAGES[S.page];
    $('#view').innerHTML = `<div id="pageHead">${pg.head ? pg.head() : ''}</div><div id="pageBody"></div>`;
    renderBody();
    drawBanner();
}
const renderBody = () => { $('#pageBody').innerHTML = PAGES[S.page].body(); };

/* Пас аз навсозӣ: агар корбар дар ҷустуҷӯ менависад, танҳо рӯйхат иваз мешавад */
let pressing = false;
document.addEventListener('pointerdown', () => { pressing = true; }, true);
['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { setTimeout(() => { pressing = false; }, 0); }, true));

function refresh() {
    if (!S.user || !$('#pageBody')) return;
    if (pressing) { setTimeout(refresh, 250); return; }
    if ($('#pageHead').contains(document.activeElement)) { drawNav(); renderBody(); }
    else renderPage();
}

const searchBox = (ph, scan = false) => `<div class="search ${scan ? 'has-scan' : ''}">${ic('search', 17)}
    <input type="search" data-f="q" placeholder="${esc(ph)}" value="${esc(S.f.q || '')}" autocomplete="off" aria-label="${esc(ph)}">
    <button type="button" class="search-x" data-act="clearQ" aria-label="Тоза кардан" ${S.f.q ? '' : 'hidden'}>${ic('x', 15)}</button>
    ${scan ? `<button type="button" class="search-scan" data-act="scanSearch" aria-label="Скан кардани штрихкод" title="Скан бо камера">${ic('scan', 18)}</button>` : ''}</div>`;
const chips = (key, list) => `<div class="chips">${list.map(([k, t]) => `<button type="button" class="chip ${(S.f[key] || '') === k ? 'on' : ''}" data-act="chip" data-key="${key}" data-k="${k}">${t}</button>`).join('')}</div>`;
const categories = () => [...new Set(S.products.map(p => String(p.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
const catSelect = () => `<select class="input" data-f="cat" aria-label="Гурӯҳ">${options([['', 'Ҳамаи гурӯҳҳо'], ...categories().map(c => [c, c])], S.f.cat || '')}</select>`;
/* Тугмаи «Филтр» — тирезаи филтрро мекушояд; рақам: чанд филтр интихоб шудааст */
const filterBtn = n => `<button type="button" class="fbtn ${n ? 'on' : ''}" data-act="fOpen" aria-haspopup="dialog">${ic('filter', 16)}<span>Филтр</span>${n ? `<b class="f-n">${n}</b>` : ''}</button>`;
/* Вақте танҳо рӯйхат нав мешавад, рақами филтр ва тугмаи тозакунӣ низ бояд нав шаванд */
function syncFilterUi() {
    const n = S.page === 'rep' ? repFilters()
        : S.page === 'tx' ? [S.f.type, S.f.loc, S.f.from, S.f.to].filter(Boolean).length
            : +!!S.f.cat;
    const btn = $('#pageHead .fbtn');
    if (btn) {
        btn.classList.toggle('on', !!n);
        let b = $('.f-n', btn);
        if (n && !b) { b = document.createElement('b'); b.className = 'f-n'; btn.append(b); }
        if (b) { if (n) b.textContent = n; else b.remove(); }
    }
    const clear = $('#pageHead [data-act=repClear]');
    if (clear) clear.hidden = !n;
}
const moreBtn = (shown, all) => all > shown ? `<button class="btn more" data-act="more">Боз нишон додан (${fmt(all - shown)})</button>` : '';
const empty = (title, text = '', btn = '', icon = 'search') => `<div class="empty"><span class="empty-i">${ic(icon, 26)}</span><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}${btn ? `<div class="empty-a">${btn}</div>` : ''}</div>`;

