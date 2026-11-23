/* DELUS — санҷиши асосии браузер: node ui.test.mjs
   Сервери воқеии барнома + ҷадвали сохта (lib.mjs). Ба Google ва ба ҷадвали воқеӣ намерасад.
   Аксҳои экран ва файли Excel дар tests/out мемонанд. */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { serve, launch, watch, fakeSheets, login, layoutIssues, wait, OUT } from './lib.mjs';

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
        '', '', '', '', i === 3 || i === 4 ? 'метр' : 'дона', '', 10 + i, 18 + i * 2, i < 8 ? 'img:' + (i + 1) : '', '', 'ACTIVE', day(90), '']));
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

async function session(viewport = { width: 1280, height: 860 }) {
    const ctx = await b.createBrowserContext();
    const page = await ctx.newPage();
    const errors = [];
    watch(page, errors);
    await page.setViewport(viewport);
    const t = tables();
    const log = await fakeSheets(page, t);
    await login(page, srv.url);
    return { ctx, page, errors, t, log };
}
const st = (page, f, ...a) => page.evaluate(f, ...a);

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
    // ҷустуҷӯ + Enter
    await page.type('.ov .pick input', 'прожектор');
    await wait(80);
    ok(await page.$$eval('.ov .pick-i', e => e.length) === 1, 'search filters the catalog to one match');
    await page.keyboard.press('Enter');
    await wait(80);
    ok(await page.$eval('.ov .pick input', e => e.value) === '' && await page.$$eval('.ov .line', e => e.length) === 4, 'Enter adds the match and clears the search');
    await page.screenshot({ path: path.join(OUT, 'sale-1280.png') });
    const before = t.Transactions.length;
    await page.click('.ov [data-save]');
    // баъзе мол дар мағоза нест: барнома огоҳ мекунад ва танҳо пас аз тасдиқ сабт мекунад
    await page.waitForSelector('.ov:last-child [data-yes]', { timeout: 5000 });
    const warnTitle = await page.$eval('.ov:last-child [role=dialog]', e => e.getAttribute('aria-label'));
    ok(/Бақия намерасад|дар анбор нест/.test(warnTitle), 'short stock is warned before saving: ' + warnTitle);
    await page.click('.ov:last-child [data-yes]');
    await page.waitForFunction(() => !document.querySelector('.ov'), { timeout: 10000 });
    const ap = log.appends.filter(x => x.sheet === 'Transactions');
    ok(ap.length === 1 && ap[0].rows.length === 4 && new Set(ap[0].rows.map(r => r[14])).size === 1, 'saved as ONE append of 4 rows with one receipt code');
    ok(t.Transactions.length === before + 4, 'sheet got 4 sale rows');
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
        receipt: () => page.evaluate(() => { debtReceipt(customers()[0].key); })
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
ok(issues.length === 0, 'layout at 10 screen sizes, 8 pages, 10 windows: ' + (issues.length ? '\n   ' + issues.slice(0, 15).join('\n   ') : 'no issues'));

await b.close();
srv.close();
console.log(`\nui.test: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
