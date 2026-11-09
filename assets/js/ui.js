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
        /* Агар дарҳол тирезаи нав кушода нашавад, таърихи браузерро як қадам бармегардонем */
        setTimeout(() => {
            if (!Modal.stack.length && history.state && history.state.modal) history.back();
        }, 0);
    },
    closeAll() { [...Modal.stack].reverse().forEach(m => Modal.close(m)); },
    top: () => Modal.stack[Modal.stack.length - 1]
};

window.addEventListener('popstate', () => {
    if (Modal.stack.length) {
        Modal.remove(Modal.top());
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
        save.textContent = 'Сабт шуда истодааст…';
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
    $('#tabNav').innerHTML = NAV.filter(n => n.k !== 'set').map(n => `<button class="tab ${n.k === S.page ? 'on' : ''}" data-act="go" data-page="${n.k}" ${n.k === S.page ? 'aria-current="page"' : ''}>
        <i>${ic(n.icon, 21)}</i><span>${n.t}</span></button>`).join('');
}

function go(page, filters = {}, push = true) {
    if (Modal.stack.length) Modal.closeAll();
    const changed = page !== S.page;
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
    document.title = `${meta.t} — ${S.cfg.company_name || 'DELUS'}`;
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

const searchBox = ph => `<div class="search">${ic('search', 17)}
    <input type="search" data-f="q" placeholder="${esc(ph)}" value="${esc(S.f.q || '')}" autocomplete="off" aria-label="${esc(ph)}">
    <button type="button" class="search-x" data-act="clearQ" aria-label="Тоза кардан" ${S.f.q ? '' : 'hidden'}>${ic('x', 15)}</button></div>`;
const chips = (key, list) => `<div class="chips">${list.map(([k, t]) => `<button type="button" class="chip ${(S.f[key] || '') === k ? 'on' : ''}" data-act="chip" data-key="${key}" data-k="${k}">${t}</button>`).join('')}</div>`;
const categories = () => [...new Set(S.products.map(p => String(p.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
const catSelect = () => `<select class="input" data-f="cat" aria-label="Гурӯҳ">${options([['', 'Ҳамаи гурӯҳҳо'], ...categories().map(c => [c, c])], S.f.cat || '')}</select>`;
const filterBtn = n => `<button type="button" class="btn f-btn" data-act="fToggle" aria-expanded="${S.fOpen}">${ic('filter', 16)}Филтр${n ? `<span class="f-n">${n}</span>` : ''}</button>`;
/* Вақте танҳо рӯйхат нав мешавад, рақами филтр ва тугмаи тозакунӣ низ бояд нав шаванд */
function syncFilterUi() {
    const n = S.page === 'rep' ? repFilters()
        : S.page === 'tx' ? [S.f.type, S.f.loc, S.f.from, S.f.to].filter(Boolean).length
            : +!!S.f.cat;
    const btn = $('#pageHead .f-btn');
    if (btn) {
        let b = $('.f-n', btn);
        if (n && !b) { b = document.createElement('span'); b.className = 'f-n'; btn.append(b); }
        if (b) { if (n) b.textContent = n; else b.remove(); }
    }
    const clear = $('#pageHead [data-act=repClear]');
    if (clear) clear.hidden = !n;
}
const moreBtn = (shown, all) => all > shown ? `<button class="btn more" data-act="more">Боз нишон додан (${fmt(all - shown)})</button>` : '';
const empty = (title, text = '', btn = '') => `<div class="empty">${ic('search', 26)}<b>${esc(title)}</b>${esc(text)}${btn ? `<br>${btn}` : ''}</div>`;

