/* DELUS — санҷиши асосии браузер: node ui.test.mjs
   Сервери воқеии барнома + ҷадвали сохта (lib.mjs). Ба Google ва ба ҷадвали воқеӣ намерасад.
   Аксҳои экран ва файли Excel дар tests/out мемонанд. */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { serve, launch, watch, fakeSheets, login, layoutIssues, wait, OUT } from './lib.mjs';
import { ean13, writeY4M } from './barcode.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); };
const day = d => Math.floor((Date.now() + 5 * 36e5) / 864e5 + 25569) - d + 0.5;

const srv = await serve(8191);
const b = await launch();

/* ---------- маълумоти санҷишӣ ---------- */
const names = ['Розетка 2-ҷойгоҳа бо заминкунӣ', 'Калиди 1-клавишӣ', 'Калиди 2-клавишӣ', 'Кабели ВВГ 3×2.5', 'Кабели ПВС 2×1.5', 'Автомати 1P 16A', 'Автомати 2P 32A',
    'Лампаи LED 12W E27', 'Лампаи LED 18W', 'Удлинитель 5 м', 'Прожектор LED 50W', 'Қуттии тақсимот 12', 'Моли бе амалиёт А', 'Моли бе амалиёт Б'];
async function photos(n) {   // аксҳои ҳақиқии JPEG, мисли акси телефон пас аз омодасозӣ
    const p = await b.newPage();
    const out = await p.evaluate(n => Array.from({ length: n }, (_, i) => {
        const c = document.createElement('canvas'); c.width = c.height = 400;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 400);
        g.fillStyle = `hsl(${i * 47 % 360} 60% 55%)`; g.beginPath(); g.roundRect(80, 80, 240, 240, 40); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold 120px Arial'; g.textAlign = 'center'; g.fillText(String(i + 1), 200, 245);
        return c.toDataURL('image/jpeg', 0.85);
    }), n);
    await p.close();
    return out;
}
const imgs = await photos(8);
function tables() {
    const P = [['id', 'product_code', 'name', 'category', 'series', 'color', 'mesta', 'taga', 'unit', 'units_per_box', 'purchase_price', 'sale_price', 'image_url', 'description', 'status', 'created_at', 'min_stock']];
    names.forEach((n, i) => P.push([i + 1, 'DL-' + String(i + 1).padStart(3, '0'), n, ['Розетка', 'Калид', 'Калид', 'Кабел', 'Кабел', 'Автомат', 'Автомат', 'Равшанӣ', 'Равшанӣ', 'Удлинитель', 'Равшанӣ', 'Қуттӣ', 'Дигар', 'Дигар'][i],
        '', ['White', 'Сафед', 'Black', ''][i % 4], '', '', i === 3 || i === 4 ? 'метр' : 'дона', '', 10 + i, 18 + i * 2, i < 8 ? 'img:' + (i + 1) : '', '', 'ACTIVE', day(90), '']));
    const L = [['id', 'name', 'location_type', 'status'], [1, 'Анбори асосӣ', 'Warehouse', 'ACTIVE'], [2, 'Анбори 2', 'Warehouse', 'ACTIVE'], [3, 'Мағоза', 'Shop', 'ACTIVE']];
    const T = [['id', 'transaction_code', 'date', 'type', 'product_id', 'from_location_id', 'to_location_id', 'quantity', 'unit', 'base_quantity', 'unit_cost', 'unit_price', 'note', 'created_at', 'receipt_code']];
    let id = 0;
    const tx = (d, type, p, from, to, q, price, rc = '') => { id++; T.push([id, 'TR-' + String(id).padStart(5, '0'), day(d), type, p, from, to, q, 'дона', q, 10 + p, price, '', day(d), rc]); };
    for (let p = 1; p <= 12; p++) tx(40, 'PURCHASE', p, '', 1, p === 6 ? 4 : 100, 18);
    for (let p = 1; p <= 12; p++) tx(35, 'TRANSFER', p, 1, p % 2 ? 3 : 2, p === 6 ? 2 : 30, 18);
    for (let k = 0; k < 30; k++) tx(k % 20, 'SALE', 1 + k % 5, 3, '', 1 + k % 3, 25, 'R-' + String(100 + k).padStart(5, '0'));
    const I = [['product_id', 'data', 'updated_at'], ...imgs.map((d, i) => [i + 1, d, day(10)])];
    const D = [['id', 'customer', 'phone', 'amount', 'paid', 'status', 'date', 'due_date', 'receipt_code', 'note', 'created_at'],
        [1, 'Фирӯз Раҳимов', '+992 93 555 12 34', 75, 0, 'OPEN', day(5), day(-10), 'R-00100', '', day(5)]];
    const DP = [['id', 'debt_id', 'amount', 'date', 'method', 'note', 'created_at'], [1, 1, 25, day(2), 'CASH', '', day(2)]];
    return { Products: P, Locations: L, Transactions: T, Settings: [['key', 'value', 'note'], ['company_name', 'DELUS', '']], Expenses: [['id', 'date', 'category', 'amount', 'location_id', 'note', 'created_at']], Debts: D, DebtPayments: DP, Images: I };
}

async function session(viewport = { width: 1280, height: 860 }, { browser = b, data = tables } = {}) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const errors = [];
    watch(page, errors);
    await page.setViewport(viewport);
    const t = data();
    const log = await fakeSheets(page, t);
    await login(page, srv.url);
    return { ctx, page, errors, t, log };
}
const st = (page, f, ...a) => page.evaluate(f, ...a);
/* навбати сабт холӣ шуд: ҳама чиз ба ҷадвал рафт */
const flushed = page => page.waitForFunction(() => !Q.busy && !Q.list.some(j => j.state === 'wait' || j.state === 'send'), { timeout: 20000 });
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

/* ================= 1. Фурӯши якчанд мол дар як чек ================= */
{
    const { ctx, page, errors, t, log } = await session();
    await page.evaluate(() => docModal('sale'));
    await page.waitForSelector('.ov .pick-grid .pick-i');
    const tiles = await page.$$eval('.ov .pick-i', e => e.length);
    ok(tiles >= 8, `sale window shows a photo catalog right away (${tiles} tiles)`);
    const nameOf = i => page.$eval(`.ov .pick-i:nth-child(${i}) .pt-n`, e => e.textContent);
    const a = await nameOf(1), c = await nameOf(3);
    await page.click('.ov .pick-i:nth-child(1)');
    await page.click('.ov .pick-i:nth-child(2)');
    await page.click('.ov .pick-i:nth-child(3)');
    await page.click('.ov .pick-i:nth-child(1)');
    const cart = await st(page, () => ({
        lines: [...document.querySelectorAll('.ov .line')].map(l => [l.querySelector('.mini-b b').textContent, l.querySelector('[data-v=q]').value]),
        badges: [...document.querySelectorAll('.ov .pick-i .pt-c')].map(x => x.textContent),
        count: document.querySelector('.ov [data-count]').textContent, total: document.querySelector('.ov [data-total]').textContent
    }));
    ok(cart.lines.length === 3 && cart.lines[0][0] === a && cart.lines[0][1] === '2', 'four taps -> three lines, first item quantity 2: ' + JSON.stringify(cart.lines));
    ok(cart.badges.includes('×2') && cart.badges.filter(x => x === '×1').length === 2, 'tiles show how many are in the cart: ' + cart.badges.join(' '));
    ok(cart.count === '3 мол', 'footer counts the lines: ' + cart.count);
    ok(await page.$('.ov .pick-i:nth-child(1).in') !== null && await nameOf(3) === c, 'catalog stays open after picking (no hiding)');
    // ҷустуҷӯ: пахши такрорӣ ҳамон молро зиёд мекунад, ҷустуҷӯ мемонад
    await page.type('.ov .pick input', 'лампа');
    await wait(80);
    const lamp = await page.$eval('.ov .pick-i:nth-child(1) .pt-n', e => e.textContent);
    await page.click('.ov .pick-i:nth-child(1)');
    await page.click('.ov .pick-i:nth-child(1)');
    const lampLine = await st(page, n => { const l = [...document.querySelectorAll('.ov .line')].find(x => x.querySelector('.mini-b b').textContent === n); return l && l.querySelector('[data-v=q]').value; }, lamp);
    ok(lampLine === '2' && await page.$eval('.ov .pick input', e => e.value) === 'лампа', 'tapping a search result twice adds 2 of the same item, search stays');
    ok(await page.$eval('.ov .pick-i:nth-child(1) .pt-c', e => e.textContent) === '×2', 'search result shows ×2');
    await page.click('.ov .pick [data-clear]');
    ok(await page.$eval('.ov .pick input', e => e.value) === '' && await page.$$eval('.ov .pick-i', e => e.length) >= 8, 'clear button brings the full catalog back');
    // ҷустуҷӯ + Enter
    await page.type('.ov .pick input', 'прожектор');
    await wait(80);
    ok(await page.$$eval('.ov .pick-i', e => e.length) === 1, 'search filters the catalog to one match');
    await page.keyboard.press('Enter');
    await wait(80);
    ok(await page.$eval('.ov .pick input', e => e.value) === '' && await page.$$eval('.ov .line', e => e.length) === 5, 'Enter adds the match and clears the search');
    await page.screenshot({ path: path.join(OUT, 'sale-1280.png') });
    const before = t.Transactions.length;
    await page.click('.ov [data-save]');
    // баъзе мол дар мағоза нест: барнома огоҳ мекунад ва танҳо пас аз тасдиқ сабт мекунад
    await page.waitForSelector('.ov:last-child [data-yes]', { timeout: 5000 });
    const warnTitle = await page.$eval('.ov:last-child [role=dialog]', e => e.getAttribute('aria-label'));
    ok(/Бақия намерасад|дар анбор нест/.test(warnTitle), 'short stock is warned before saving: ' + warnTitle);
    await page.click('.ov:last-child [data-yes]');
    await page.waitForFunction(() => !document.querySelector('.ov'), { timeout: 10000 });
    await flushed(page);
    const ap = log.appends.filter(x => x.sheet === 'Transactions');
    ok(ap.length === 1 && ap[0].rows.length === 5 && new Set(ap[0].rows.map(r => r[14])).size === 1, 'saved as ONE append of 5 rows with one receipt code');
    ok(t.Transactions.length === before + 5, 'sheet got 5 sale rows');
    ok(errors.length === 0, 'no console errors in sale flow ' + JSON.stringify(errors.slice(0, 2)));
    await ctx.close();
}

/* ================= 2. Воридот: моли нав аз каталог ================= */
{
    const { ctx, page } = await session();
    await page.evaluate(() => docModal('buy'));
    await page.waitForSelector('.ov .pick input');
    await page.type('.ov .pick input', 'Чароғи девории нав');
    await wait(80);
    ok(await page.$('.ov .pick-i.new') !== null, 'buy: unknown name offers a "new product" tile');
    await page.click('.ov .pick-i.new');
    await page.waitForFunction(() => document.querySelectorAll('.ov').length === 2);
    ok(await page.$eval('.ov:last-child [name=name]', e => e.value) === 'Чароғи девории нав', 'new product form opens with the typed name');
    await ctx.close();
}

/* ================= 3. Нест кардани мол ================= */
{
    const { ctx, page, t, log } = await session();
    // мол бе амалиёт: як тасдиқ, нест мешавад
    await page.evaluate(() => productView(13));
    await page.waitForSelector('.ov [data-del]');
    await page.click('.ov [data-del]');
    await page.waitForSelector('.ov:last-child [data-yes]');
    ok(/ягон амалиёт надорад/.test(await page.$eval('.ov:last-child .card-p', e => e.textContent)), 'product without history: simple confirmation');
    await page.click('.ov:last-child [data-yes]');
    await page.waitForFunction(() => !document.querySelector('.ov'), { timeout: 10000 });
    ok(!t.Products.some(r => r[0] === 13) && await st(page, () => !prodBy(13)), 'deleted from the product card in one step');
    // мол бо таърих: бойгонӣ тавсия дода мешавад
    await page.evaluate(() => productView(2));
    await page.waitForSelector('.ov [data-del]');
    await page.click('.ov [data-del]');
    await page.waitForSelector('.ov:last-child .choose');
    const opts = await page.$$eval('.ov:last-child .choose [data-k]', e => e.map(x => x.dataset.k));
    ok(opts[0] === 'archive' && opts.includes('delete'), 'product with history: archive is offered first: ' + opts.join(','));
    await page.click('.ov:last-child [data-k=archive]');
    await page.waitForFunction(() => !document.querySelector('.ov'), { timeout: 10000 });
    ok(t.Products.find(r => r[0] === 2)[14] === 'INACTIVE' && t.Transactions.some(r => r[4] === 2), 'archived: status INACTIVE, history kept');

    // ҳолати «Интихоб»: ду мол якбора
    await page.evaluate(() => go('prod'));
    await page.click('[data-act=selMode]');
    await page.waitForSelector('.pcard-sel');
    await page.click('.pcard-sel[data-id="14"]');
    await page.click('.pcard-sel[data-id="12"]');
    ok(/2/.test(await page.$eval('.selbar-n', e => e.textContent)), 'selection bar counts 2');
    await page.screenshot({ path: path.join(OUT, 'select-1280.png') });
    const delBefore = log.deletes.length, txOf12 = t.Transactions.filter(r => r[4] === 12).length;
    await page.click('.selbar [data-act=selDelete]');
    await page.waitForSelector('.ov .choose');
    await page.click('.ov [data-k=delete]');
    await page.waitForFunction(() => !document.querySelector('.ov') && !document.querySelector('.selbar'), { timeout: 10000 });
    const dels = log.deletes.slice(delBefore);
    ok(!t.Products.some(r => r[0] === 12 || r[0] === 14) && dels.filter(d => d.sheet === 'Transactions').length === txOf12 && dels.filter(d => d.sheet === 'Products').length === 2,
        `bulk delete removed 2 products and their ${txOf12} transactions in one request`);
    ok(await st(page, () => !S.selOn && S.sel.size === 0), 'selection mode closes after the action');
    await ctx.close();
}

/* ================= 4. Акси калон ================= */
{
    const { ctx, page, errors } = await session({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.evaluate(() => productView(1));
    await page.waitForSelector('.ov .pv-zoom .ph', { timeout: 10000 });
    await page.click('.ov .pv-zoom');
    await page.waitForSelector('.ov .zoom img');
    ok(await page.$$eval('.ov', e => e.length) === 2, 'tapping the photo opens it large');
    const box = await page.$('.ov:last-child .zoom');
    const bb = await box.boundingBox();
    await page.mouse.click(bb.x + bb.width / 2 + 40, bb.y + bb.height / 2 + 40);
    await wait(260);
    ok(/scale\(2\.5\)/.test(await page.$eval('.ov:last-child .zoom img', e => e.style.transform)), 'second tap zooms in 2.5×');
    await page.screenshot({ path: path.join(OUT, 'zoom-390.png') });
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await wait(260);
    ok(/scale\(1\)/.test(await page.$eval('.ov:last-child .zoom img', e => e.style.transform)), 'tap again returns to normal');
    await page.keyboard.press('Escape');
    await wait(150);
    ok(await page.$$eval('.ov', e => e.length) === 1, 'Escape closes the large photo, product card stays');
    ok(errors.length === 0, 'no console errors in zoom ' + JSON.stringify(errors.slice(0, 2)));
    await ctx.close();
}

/* ================= 5. Excel ================= */
{
    const { ctx, page, errors, t } = await session();
    await page.evaluate(() => { window.__blobs = []; const o = URL.createObjectURL; URL.createObjectURL = x => { window.__blobs.push(x); return o.call(URL, x); }; window.__names = []; const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__names.push(this.download); return; } return c.call(this); }; });
    await page.evaluate(() => go('set'));
    await page.click('[data-act=xlsx]');
    await page.waitForFunction(() => window.__names.length === 1, { timeout: 20000 });
    const file = await page.evaluate(async () => {
        const bl = window.__blobs.find(x => x.type.includes('spreadsheetml'));
        const buf = new Uint8Array(await bl.arrayBuffer()); let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return { name: window.__names[0], b64: btoa(s), expect: S.products.map(p => ({ id: num(p.id), name: p.name, locs: [1, 2, 3].map(l => qtyAt(p.id, l)), total: qtyAll(p.id), photo: !!imgSrc(p) })) };
    });
    const out = path.join(OUT, file.name);
    fs.writeFileSync(out, Buffer.from(file.b64, 'base64'));
    ok(/^DELUS-Molho-\d{4}-\d{2}-\d{2}\.xlsx$/.test(file.name), 'Excel file name: ' + file.name);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(out);
    const ws = wb.getWorksheet('Молҳо');
    ok(!!ws && wb.worksheets.length === 1, 'one sheet named «Молҳо»');
    const head = ws.getRow(7).values.slice(1);
    ok(['Анбори асосӣ', 'Анбори 2', 'Мағоза'].every(n => head.includes(n)) && head.includes('Ҳамагӣ') && head.includes('Акс'), 'header has photo, every warehouse and total: ' + head.join(' | '));
    const col = n => head.indexOf(n) + 1;
    const rows = [];
    for (let r = 8; r < 8 + file.expect.length; r++) rows.push(ws.getRow(r));
    const byName = new Map(rows.map(r => [r.getCell(col('Номи мол')).value, r]));
    const mism = file.expect.filter(e => {
        const r = byName.get(e.name); if (!r) return true;
        const locs = ['Анбори асосӣ', 'Анбори 2', 'Мағоза'].map(n => r.getCell(col(n)).value);
        const tot = r.getCell(col('Ҳамагӣ')).value;
        return locs.some((v, i) => +v !== e.locs[i]) || +(tot.result ?? 0) !== e.total || !/SUM/.test(tot.formula) || +r.getCell(col('ID')).value !== e.id;
    });
    ok(rows.length === file.expect.length && mism.length === 0, `every product row matches the app (${rows.length} rows, mismatches ${mism.length})`);
    mism.forEach(e => { const r = byName.get(e.name); console.log('     mismatch', JSON.stringify(e), r && JSON.stringify(r.values)); });
    const totRow = ws.getRow(8 + file.expect.length);
    ok(/ҲАМАГӢ/.test(totRow.getCell(1).value) && /SUM\(/.test(totRow.getCell(col('Ҳамагӣ')).value.formula), 'totals row with SUM formulas');
    const images = ws.getImages();
    ok(images.length === file.expect.filter(e => e.photo).length && images.length > 0, `photos embedded in the «Акс» column: ${images.length}`);
    ok(images.every(im => im.range.tl.nativeCol === col('Акс') - 1), 'every photo sits in the photo column');
    ok(ws.views[0] && ws.views[0].state === 'frozen' && ws.views[0].ySplit === 7, 'header row frozen');
    ok(ws.getRow(1).getCell(1).font && ws.getRow(1).getCell(1).font.bold && ws.getRow(7).getCell(1).fill.fgColor.argb === 'FF0B1430', 'styled title and navy header');
    // маълумоти тоза: пеш аз боргирӣ ҷадвал аз нав хонда шуд
    t.Products.push([99, 'DL-099', 'Моли навтарин', 'Дигар', '', '', '', '', 'дона', '', 5, 9, '', '', 'ACTIVE', day(0), '']);
    await page.evaluate(() => { window.__names = []; window.__blobs = []; });
    await wait(3200);
    await page.click('[data-act=xlsx]');
    await page.waitForFunction(() => window.__names.length === 1, { timeout: 20000 });
    const fresh = await page.evaluate(() => S.products.some(p => p.name === 'Моли навтарин'));
    ok(fresh, 'each export reads the sheet again (a product added in the sheet appears)');
    ok(errors.length === 0, 'no console errors in export ' + JSON.stringify(errors.slice(0, 2)));
    await ctx.close();
}

/* ================= 7. Телефон: фурӯш бо ду пахш, калкулятор, ҷавоби фаврӣ ================= */
{
    const { ctx, page, errors, t, log } = await session(PHONE);
    await page.waitForFunction(() => (S.heads.Products || []).includes('barcode'), { timeout: 10000 });
    ok(t.Products[0][t.Products[0].length - 1] === 'barcode', 'the app adds the «barcode» column to the sheet header by itself');
    await page.evaluate(() => go('prod'));
    await page.waitForSelector('.pcard [data-act=quick]');
    const pid = await page.$eval('.pcard [data-act=quick]', e => e.dataset.id);
    const stock0 = await page.evaluate(id => qtyAll(id), pid);
    await page.click('.pcard [data-act=quick]');
    await page.waitForSelector('.ov .sheet.qs');
    ok(await page.$eval('.ov [name=q]', e => e.readOnly && e.inputMode === 'none'), 'phone: number fields do not open the phone keyboard');
    await page.click('.ov [name=q]');
    await page.waitForSelector('.ov .sheet.np');
    for (const k of ['3', '×', '4']) await page.click(`.ov:last-child .np-k[data-k="${k}"]`);
    ok(await page.$eval('.ov:last-child [data-r]', e => e.textContent) === '= 12', 'big keypad calculates 3 × 4 = 12');
    await page.click('.ov:last-child [data-ok]');
    await wait(80);
    ok(await page.$eval('.ov [name=q]', e => e.value) === '12', 'keypad writes 12 into the quantity');
    await page.click('.ov .qs-chips [data-set="2"]');
    const label = await page.$eval('.ov [data-save]', e => e.textContent);
    ok(/Фурӯхтан · /.test(label), 'sell button shows the total: ' + label);
    await page.screenshot({ path: path.join(OUT, 'quick-390.png') });
    log.op.delay = 2500;
    const t0 = Date.now();
    await page.click('.ov [data-save]');
    await page.waitForFunction(() => !document.querySelector('.ov'), { timeout: 4000 });
    const ms = Date.now() - t0;
    ok(ms < 1200, `two taps: the sale closes at once even with a slow server (${ms} ms)`);
    const now = await page.evaluate(id => ({ q: qtyAll(id), queued: S.tx.filter(x => x._q && isQueued(x.id)).length, badge: (document.querySelector('.sync-n') || {}).textContent || '' }), pid);
    ok(now.q === stock0 - 2 && now.queued === 1, `stock drops right away: ${stock0} → ${now.q}`);
    ok(now.badge === '1', 'sync button shows 1 record on its way');
    await flushed(page);
    log.op.delay = 0;
    const last = t.Transactions[t.Transactions.length - 1];
    ok(last[3] === 'SALE' && String(last[4]) === pid && last[7] === 2 && /^R-\d{5}$/.test(last[14]), 'the sale reached the sheet with a receipt number');
    ok(await page.evaluate(() => !document.querySelector('.sync-n') && S.tx.every(x => !isQueued(x.id))), 'after sending: real numbers, badge gone');
    ok(errors.length === 0, 'no console errors on the phone ' + JSON.stringify(errors.slice(0, 2)));
    await ctx.close();
}

/* ================= 8. Бе интернет: навбат, бозкушоӣ, ҷавоби гумшуда, бекор кардан, қарз ================= */
{
    const { ctx, page, errors, t, log } = await session();
    const n0 = t.Transactions.length;
    log.op.fail = 1000;
    await page.evaluate(() => quickSale(prodBy(1)));
    await page.click('.ov [data-save]');
    await page.waitForFunction(() => !document.querySelector('.ov'));
    await page.waitForFunction(() => Q.list.length === 1 && Q.list[0].state === 'wait' && Q.wait > 0, { timeout: 10000 });
    ok(t.Transactions.length === n0, 'no internet: nothing reached the sheet yet');
    ok(await page.$eval('#banner', e => /Интернет нест|нарафт/.test(e.textContent)), 'banner explains the record is kept: ' + (await page.$eval('#banner', e => e.textContent.trim())).slice(0, 90));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([hidden]) .hero', { timeout: 20000 });
    ok(await page.evaluate(() => Q.list.length === 1 && S.tx.some(x => isQueued(x.id))), 'app closed and opened again: the waiting sale is still there');
    log.op.fail = 0;
    log.op.lose = 1;
    await page.evaluate(() => retryJob(Q.list[0].id));
    await flushed(page);
    ok(t.Transactions.length === n0 + 1, `internet back, first answer lost: written exactly once (+${t.Transactions.length - n0})`);
    ok(new Set(log.ops).size === 1 && log.ops.length >= 3, `the same record id was sent ${log.ops.length} times, the sheet got it once`);

    // бекор кардани сабти навбат
    log.op.fail = 1000;
    const q0 = await page.evaluate(() => qtyAll(2));
    await page.evaluate(() => quickSale(prodBy(2)));
    await page.click('.ov [data-save]');
    await page.waitForFunction(() => Q.list.some(j => j.state === 'wait' && j.tries > 0), { timeout: 10000 });
    await page.evaluate(() => txView(S.tx.find(x => isQueued(x.id)).id));
    await page.click('.ov [data-cancel-job]');
    await page.waitForSelector('.ov:last-child [data-yes]');
    await page.click('.ov:last-child [data-yes]');
    await wait(100);
    ok(await page.evaluate(q0 => !S.tx.some(x => isQueued(x.id)) && qtyAll(2) === q0, q0), 'a waiting sale can be cancelled: stock comes back');
    log.op.fail = 0;
    await page.evaluate(() => flush());
    await wait(300);
    ok(t.Transactions.length === n0 + 1, 'the cancelled sale never reaches the sheet');

    // фурӯш ба қарз ва пардохт бе интернет: пардохт ба қарзи ҳанӯз нафиристода пайваст мешавад
    log.op.fail = 1000;
    await page.evaluate(() => docModal('sale', prodBy(3)));
    await page.click('.ov [data-pay=debt]');
    await page.type('.ov [name=debt_customer]', 'Навбат Тестов');
    await page.type('.ov [name=debt_prepay]', '5');
    const price = await page.evaluate(() => num(prodBy(3).sale_price));
    await page.click('.ov [data-save]');
    await page.waitForFunction(() => !document.querySelector('.ov'));
    await page.evaluate(() => payCustomer(customers().find(c => c.name === 'Навбат Тестов'), 4));
    const local = await page.evaluate(() => { const c = customers().find(x => x.name === 'Навбат Тестов'); return c && c.left; });
    ok(local === price - 9, `offline: debt and a later payment show at once (left ${local})`);
    log.op.fail = 0;
    await page.evaluate(() => retryJob(''));
    await flushed(page);
    const d = t.Debts.find(r => r[1] === 'Навбат Тестов'), pays = t.DebtPayments.filter(r => d && r[1] === d[0]);
    const sale = t.Transactions.find(r => d && r[14] === d[8] && r[3] === 'SALE');
    ok(d && pays.length === 2 && d[4] === 9 && d[5] === 'OPEN' && sale, `sheet: debt with its receipt, 2 payments linked, paid 9 (${d && d[4]})`);
    const real = errors.filter(e => !/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET/.test(e));
    ok(real.length === 0, 'no console errors offline (only the simulated network failures) ' + JSON.stringify(real.slice(0, 2)));
    await ctx.close();
}

/* ================= 9. Сканери штрихкод: камераи сохта бо EAN-13 ================= */
{
    const code = ean13('460123456789');
    const y4m = writeY4M(path.join(OUT, 'ean13.y4m'), code);
    const cam = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`]);
    const withCode = () => { const d = tables(); d.Products[0].push('barcode'); d.Products.slice(1).forEach(r => { while (r.length < 17) r.push(''); r.push(''); }); return d; };
    const { ctx, page, errors, t } = await session(PHONE, { browser: cam, data: withCode });
    await page.evaluate(() => docModal('sale'));
    await page.waitForSelector('.ov .pick [data-scan]');
    await page.click('.ov .pick [data-scan]');
    await page.waitForSelector('.ov .sheet.scan video');
    // штрихкоди нав: барнома мепурсад, ки ин кадом мол аст
    await page.waitForFunction(() => [...document.querySelectorAll('.ov [role=dialog]')].some(d => /штрихкод дар рӯйхат нест/.test(d.getAttribute('aria-label'))), { timeout: 30000 });
    ok(true, 'camera read the EAN-13 box code (unknown yet): ' + code);
    await page.click('.ov:last-child [data-k=link]');
    await page.waitForSelector('.ov:last-child .pick-i');
    await page.click('.ov:last-child .pick-i:nth-child(5)');
    await page.waitForFunction(() => document.querySelectorAll('.ov .line').length === 1, { timeout: 10000 });
    const linked = await page.evaluate(c => { const p = findByCode(c); return p && [p.id, p.barcode]; }, code);
    ok(linked && String(linked[1]).includes(code), 'code linked to the chosen product: ' + JSON.stringify(linked));
    const row = t.Products.find(r => r[0] === linked[0]);
    ok(row && String(row[row.length - 1]).includes(code), 'code saved in the sheet barcode column');
    await page.click('.ov .pick [data-scan]');
    await page.waitForFunction(() => { const l = document.querySelector('.ov .line [data-v=q]'); return l && l.value === '2'; }, { timeout: 30000 });
    ok(true, 'next scan of the same box adds one more (×2)');
    await page.screenshot({ path: path.join(OUT, 'scan-390.png') });
    await page.click('.ov:last-child [data-done]');
    await wait(100);
    ok(await page.evaluate(c => matchProducts(c)[0] && String(matchProducts(c)[0].barcode).includes(c), code), 'typing the code in search finds the product');
    ok(errors.filter(e => !/getUserMedia|NotReadable/.test(e)).length === 0, 'no console errors with the scanner ' + JSON.stringify(errors.slice(0, 2)));
    await ctx.close();
    await cam.close();
}

/* ================= 10. Ранг, филтр, пешниҳоди ном, фурӯши ду-қадама, қарз ================= */
{
    const { ctx, page, errors, t } = await session();
    // ранг: «White» ва «Сафед» як ранг; ҷустуҷӯи тоҷикӣ ва русӣ
    const whites = t.Products.slice(1).filter(r => ['White', 'Сафед'].includes(r[5])).length;
    const exact = t.Products.slice(1).filter(r => r[5] === 'White').length;
    const byWord = await page.evaluate(() => ['сафед', 'белый', 'white'].map(q => filterProducts({ q }).length));
    ok(byWord.every(n => n === byWord[0]) && byWord[0] >= whites, 'search by colour: «сафед», «белый», «white» find the same products: ' + byWord);
    await page.evaluate(() => go('prod'));
    await page.click('#pageHead [data-act=fOpen]');
    await page.waitForSelector('.ov .sheet.fs');
    const chipsText = await page.$$eval('.ov .fchip[data-k=color] span', e => e.map(x => x.textContent));
    ok(chipsText.some(x => x.startsWith('White (')) && chipsText.some(x => x.startsWith('Сафед (')) && chipsText.some(x => x.startsWith('Black (')), 'colour chips show the colours exactly as written in the sheet: ' + chipsText.join(', '));
    ok(await page.$('.ov .fchip[data-k=color][data-v=White] .sw') !== null, 'each colour chip has a colour dot');
    await page.click('.ov .fchip[data-k=color][data-v=White]');
    const label = await page.$eval('.ov [data-apply]', e => e.textContent);
    ok(label.includes(String(exact)), 'apply button counts the result: ' + label);
    await page.click('.ov [data-apply]');
    await wait(150);
    const shown = await page.$$eval('#pageBody .pcard', e => e.length);
    ok(shown === exact && await page.evaluate(() => S.f.color === 'White'), `colour filter «White» shows only products written «White» (${shown} of ${exact})`);
    ok(await page.$eval('#pageHead .fpill', e => /White/.test(e.textContent)), 'active filter is shown as a pill');
    ok(await page.$eval('#pageHead .fbtn .f-n', e => e.textContent) === '1', 'filter button shows 1 active filter');
    await page.click('#pageHead .fpill');
    await wait(150);
    ok(await page.evaluate(() => !S.f.color) && await page.$$eval('#pageBody .pcard', e => e.length) > exact, 'tapping the pill removes the filter');
    // гурӯҳ ва тартиб дар ҳамон тиреза
    await page.click('#pageHead [data-act=fOpen]');
    await page.waitForSelector('.ov .sheet.fs');
    await page.click('.ov .fchip[data-k=cat][data-v="Кабел"]');
    await page.click('.ov .fchip[data-k=sort][data-v=priceDown]');
    await page.click('.ov [data-apply]');
    await wait(150);
    const prices = await page.$$eval('#pageBody .pcard .sell', e => e.map(x => parseFloat(x.textContent.replace(/\s/g, '').replace(',', '.'))));
    ok(prices.length === 2 && prices[0] >= prices[1], 'category + price sort together: ' + prices);
    await page.evaluate(() => ACT.fDropAll());

    // пешниҳоди ном ҳангоми иловаи мол
    await page.evaluate(() => productForm());
    await page.waitForSelector('.ov [name=name]');
    await page.type('.ov [name=name]', 'Розет');
    await page.waitForSelector('.ov [data-sug]:not([hidden]) .sug', { timeout: 3000 });
    const sugName = await page.$eval('.ov .sug b', e => e.textContent);
    await page.click('.ov .sug');
    const filled = await page.evaluate(() => ({ name: document.querySelector('.ov [name=name]').value, cat: document.querySelector('.ov [name=category]').value, price: document.querySelector('.ov [name=sale_price]').value }));
    ok(filled.name === sugName && filled.cat === 'Розетка' && filled.price !== '', 'typing a name suggests existing products; a tap fills name, group and price: ' + JSON.stringify(filled));
    await page.click('.ov .col-chips [data-col="Сиёҳ"]');
    ok(await page.$eval('.ov [name=color]', e => e.value) === 'Сиёҳ', 'colour is chosen with one tap');
    await page.evaluate(() => Modal.closeAll());

    // саҳифаи қарз холӣ: тугмаҳо бо навиштаҷот, аломат дар ҷояш
    t.Debts.splice(1); t.DebtPayments.splice(1);
    await page.evaluate(() => sync());
    await page.evaluate(() => go('debt'));
    await wait(100);
    const em = await page.evaluate(() => {
        const b = [...document.querySelectorAll('#pageBody .empty-a .btn')];
        return { n: b.length, text: b.map(x => x.textContent.trim()), icMargin: b.map(x => getComputedStyle(x.querySelector('.ic')).marginTop) };
    });
    ok(em.n === 2 && em.text[0].includes('насия') && em.icMargin.every(x => x === '0px'), 'empty debt page: two labelled buttons, icons in place ' + JSON.stringify(em));
    ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors.slice(0, 2)));
    await ctx.close();
}
{
    // фурӯш дар телефон: ду қадам, тугмаи «қафо»-и телефон ба каталог бармегардад
    const { ctx, page, errors } = await session(PHONE);
    await page.evaluate(() => go('prod'));
    await page.evaluate(() => docModal('sale'));
    await page.waitForSelector('.ov .sheet.s1 .pick-i');
    ok(await page.$eval('.ov .doc-r', e => e.offsetParent === null), 'phone step 1: only the catalog is shown');
    await page.click('.ov .pick-i:nth-child(1)');
    await page.click('.ov .pick-i:nth-child(1)');
    ok(/\(1\)/.test(await page.$eval('.ov [data-next]', e => e.textContent)), 'the big button shows the cart: ' + await page.$eval('.ov [data-next]', e => e.textContent));
    await page.click('.ov [data-next]');
    await page.waitForSelector('.ov .sheet.s2');
    ok(await page.$eval('.ov .doc-l', e => e.offsetParent === null) && await page.$eval('.ov .line [data-v=q]', e => e.value) === '2', 'step 2: cart with quantity 2, catalog hidden');
    ok(await page.$eval('.ov [data-save]', e => e.textContent.trim()) === 'Фурӯхтан', 'sell button says «Фурӯхтан»');
    await page.goBack();
    await wait(200);
    ok(await page.$('.ov .sheet.s1') !== null, 'phone back button returns to the catalog, the sale stays open');
    await page.screenshot({ path: path.join(OUT, 'sale-steps-390.png') });
    ok(errors.length === 0, 'no console errors in the phone sale ' + JSON.stringify(errors.slice(0, 2)));
    await ctx.close();
}

/* ================= 6. Андозаҳои экран: ҳамаи саҳифаҳо ва тирезаҳо ================= */
const VP = [[320, 640], [360, 760], [375, 667], [390, 844], [414, 896], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const issues = [];
for (const [w, h] of VP) {
    const mob = w < 720;
    const { ctx, page, errors } = await session({ width: w, height: h, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    const tag = `${w}x${h}`;
    for (const k of ['home', 'prod', 'stock', 'debt', 'tx', 'rep', 'set']) {
        await page.evaluate(k => go(k), k);
        await wait(60);
        (await layoutIssues(page)).forEach(x => issues.push(`${tag} ${k}: ${x}`));
        if (w === 390 || w === 1440) await page.screenshot({ path: path.join(OUT, `p-${k}-${w}.png`) });
    }
    await page.evaluate(() => { go('prod'); ACT.selMode(); ACT.selToggle({ dataset: { id: '1' } }); });
    await wait(60);
    (await layoutIssues(page)).forEach(x => issues.push(`${tag} prod-select: ${x}`));
    if (w === 390 || w === 320) await page.screenshot({ path: path.join(OUT, `p-select-${w}.png`) });
    const modals = {
        sale: async () => { await page.evaluate(() => docModal('sale')); await page.waitForSelector('.ov .pick-i'); for (const i of [1, 2, 3, 1]) await page.click(`.ov .pick-i:nth-child(${i})`); },
        saleDebt: async () => { await page.evaluate(() => docModal('sale', prodBy(1))); await page.click('.ov [data-pay=debt]'); },
        buy: () => page.evaluate(() => { docModal('buy', prodBy(2)); }),
        move: () => page.evaluate(() => { docModal('move', prodBy(3)); }),
        fix: () => page.evaluate(() => { fixModal(prodBy(1)); }),
        view: () => page.evaluate(() => { productView(1); }),
        zoom: () => page.evaluate(() => { productView(1); photoZoom(imgSrc(prodBy(1)), prodBy(1).name); }),
        form: () => page.evaluate(() => { productForm(prodBy(1)); }),
        debtor: () => page.evaluate(() => { debtorView(customers()[0].key); }),
        receipt: () => page.evaluate(() => { debtReceipt(customers()[0].key); }),
        quick: () => page.evaluate(() => { quickSale(prodBy(1)); }),
        filter: () => page.evaluate(() => { go('prod'); ACT.fOpen(); }),
        txFilter: () => page.evaluate(() => { go('tx'); ACT.fOpen(); }),
        newProduct: async () => { await page.evaluate(() => productForm()); await page.type('.ov [name=name]', 'Лам'); await wait(200); },
        quickDebt: async () => { await page.evaluate(() => quickSale(prodBy(1))); await page.click('.ov [data-pay=debt]'); },
        numpad: () => page.evaluate(() => { quickSale(prodBy(1)); openNumpad(document.querySelector('.ov [name=q]'), { chips: [['1', '1'], ['5', '5'], ['25', 'Ҳама 25']] }); }),
        scanner: () => page.evaluate(() => { scanCode({ title: 'Скан' }); })
    };
    for (const [name, open] of Object.entries(modals)) {
        await open();
        await wait(name === 'receipt' ? 900 : 320);
        (await layoutIssues(page)).forEach(x => issues.push(`${tag} modal:${name}: ${x}`));
        if (w === 390 || w === 1440 || (w === 320 && name === 'sale')) await page.screenshot({ path: path.join(OUT, `m-${name}-${w}.png`) });
        await page.evaluate(() => Modal.closeAll());
        await wait(60);
    }
    errors.forEach(e => issues.push(`${tag} console: ${e}`));
    await ctx.close();
    console.log('     checked', tag);
}
ok(issues.length === 0, 'layout at 10 screen sizes, 8 pages, 17 windows: ' + (issues.length ? '\n   ' + issues.slice(0, 15).join('\n   ') : 'no issues'));

await b.close();
srv.close();
console.log(`\nui.test: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
