/* Санҷиши сайти воқеӣ пас аз насб:
     DELUS_URL=https://delus.tech DELUS_USER=… DELUS_PASS=… node prod.check.mjs
   - Excel аз маълумоти воқеӣ: ҳар мол як сатр, аксҳо, ҷамъ;
   - фурӯши ду мол дар як чек бо ду моли санҷишии «ZZТЕСТ» (бо воридоти худашон);
   - нест кардани ҳарду бо ҳолати «Интихоб» — ҳамроҳи ҳамаи амалиётҳояшон.
   Пас аз санҷиш дар ҷадвал ҳеҷ чиз намемонад (молҳои ZZТЕСТ ва амалиётҳояшон нест мешаванд). */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { launch, watch, wait, OUT } from './lib.mjs';

const URL_ = process.env.DELUS_URL || 'https://delus.tech/';
const M = 'ZZТЕСТ';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); };

let receipt = '';
const b = await launch();
const page = await b.newPage();
const errors = [];
watch(page, errors);
await page.setViewport({ width: 1280, height: 860 });
try {
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#loginUser', { visible: true, timeout: 60000 });
    await page.type('#loginUser', process.env.DELUS_USER);
    await page.type('#loginPass', process.env.DELUS_PASS);
    await page.click('#loginBtn');
    await page.waitForSelector('#app:not([hidden]) .hero', { timeout: 90000 });
    ok(true, 'logged in');

    /* Excel аз маълумоти воқеӣ */
    await page.evaluate(() => { window.__blobs = []; window.__names = []; const o = URL.createObjectURL; URL.createObjectURL = x => { window.__blobs.push(x); return o.call(URL, x); }; const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__names.push(this.download); return; } return c.call(this); }; });
    await page.evaluate(() => go('set'));
    const t0 = Date.now();
    await page.click('[data-act=xlsx]');
    await page.waitForFunction(() => window.__names.length === 1, { timeout: 120000 });
    const x = await page.evaluate(async () => {
        const bl = window.__blobs.find(v => v.type.includes('spreadsheetml'));
        const buf = new Uint8Array(await bl.arrayBuffer()); let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return { name: window.__names[0], b64: btoa(s), n: S.products.length, photos: S.products.filter(p => imgSrc(p)).length, kb: Math.round(bl.size / 1024) };
    });
    const file = path.join(OUT, 'prod-' + x.name);
    fs.writeFileSync(file, Buffer.from(x.b64, 'base64'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet('Молҳо');
    /* бе мол сатри «Ҳоло мол нест» меистад */
    ok(ws && ws.getRow(8 + Math.max(x.n, 1)).getCell(1).value === 'ҲАМАГӢ', `Excel: ${x.n} products, totals row in place (${x.kb} KB, ${Date.now() - t0} ms)`);
    ok(ws.getImages().length === x.photos, `Excel: ${ws.getImages().length} of ${x.photos} photos embedded`);

    /* ду моли санҷишӣ бо бақия */
    const ids = await page.evaluate(async m => {
        const loc = shopLoc().id, out = [];
        for (const [n, price] of [[m + ' Розетка', 15], [m + ' Кабел', 4]]) {
            const p = await addProduct({ name: n, category: m, unit: 'дона', purchase_price: price - 3, sale_price: price, image_url: '' });
            out.push(p.id);
        }
        queueOp(m, { tx: out.map(id => ({ date: nowStr(), type: 'PURCHASE', product_id: id, from_location_id: '', to_location_id: loc, quantity: 10, unit: 'дона', unit_cost: 5, unit_price: 9, note: m, created_at: nowStr() })) });
        await flush();
        return out;
    }, M);
    ok(ids.length === 2, 'two test products with stock created: ' + ids.join(', '));

    /* фурӯш: ҳарду дар як чек аз каталог */
    await page.evaluate(() => { Modal.closeAll(); docModal('sale'); });
    await page.waitForSelector('.ov .pick input');
    await page.type('.ov .pick input', M);
    await wait(150);
    ok(await page.$$eval('.ov .pick-i', e => e.length) === 2, 'search shows both test products as tiles');
    // ҷустуҷӯ пас аз пахш мемонад: пахши дуюм ба ҳамон плитка — +1
    await page.click('.ov .pick-i:nth-child(1)');
    await page.click('.ov .pick-i:nth-child(2)');
    await page.click('.ov .pick-i:nth-child(2)');
    ok(await page.$$eval('.ov .pick-i .pt-c', e => e.map(x => x.textContent).sort().join(' ')) === '×1 ×2', 'tiles show ×1 and ×2');
    const lines = await page.$$eval('.ov .line', e => e.length);
    ok(lines === 2, 'cart has 2 lines (one item tapped twice)');
    receipt = 'pending';
    const t1 = Date.now();
    await page.click('.ov [data-save]');
    await page.waitForFunction(() => !document.querySelector('.ov'), { timeout: 60000 });
    const closed = Date.now() - t1;
    await page.waitForFunction(() => !Q.busy && !Q.list.some(j => j.state === 'wait' || j.state === 'send'), { timeout: 90000 });
    ok(closed < 1500, `sale window closes at once (${closed} ms), the server write happens in the background (${Date.now() - t1} ms)`);
    ok(await page.evaluate(() => !Q.list.some(j => j.state === 'fail')), 'no failed records in the queue');
    const sale = await page.evaluate(ids => {
        const rows = S.tx.filter(t => ids.includes(num(t.product_id)) && t.type === 'SALE');
        return { n: rows.length, rc: [...new Set(rows.map(r => r.receipt_code))], q: rows.map(r => num(r.quantity)).sort() };
    }, ids);
    receipt = sale.rc[0] || '';
    ok(sale.n === 2 && sale.rc.length === 1 && /^R-\d{5}$/.test(sale.rc[0]) && JSON.stringify(sale.q) === '[1,2]', 'sale saved as one receipt with 2 lines: ' + JSON.stringify(sale));
    await page.evaluate(() => sync());
    const inSheet = await page.evaluate(rc => S.tx.filter(t => t.receipt_code === rc && !t._q).length, receipt);
    ok(inSheet === 2, 'after re-reading the sheet: exactly 2 rows with that receipt (no duplicates)');

    /* нест кардан: ҳолати «Интихоб» */
    await page.evaluate(() => go('prod'));
    await page.click('[data-act=selMode]');
    for (const id of ids) await page.click(`.pcard-sel[data-id="${id}"]`);
    await page.click('.selbar [data-act=selDelete]');
    await page.waitForSelector('.ov .choose');
    await page.click('.ov [data-k=delete]');
    await page.waitForFunction(() => !document.querySelector('.ov') && !document.querySelector('.selbar'), { timeout: 60000 });
    await wait(3500);
    await page.evaluate(() => sync());
    const left = await page.evaluate(ids => ({ p: S.products.filter(p => ids.includes(num(p.id))).length, t: S.tx.filter(t => ids.includes(num(t.product_id))).length }), ids);
    ok(left.p === 0 && left.t === 0, 'bulk delete removed both products and all their transactions from the live sheet');
} catch (e) {
    ok(false, 'aborted: ' + e.message);
} finally {
    // ҳеҷ чизи санҷишӣ дар ҷадвал намемонад
    await page.evaluate(async (m, rc) => {
        while (Modal.stack.length) Modal.close();
        const rest = S.products.filter(p => String(p.name).startsWith(m));
        if (rest.length) await deleteProducts(rest);
        // ҳар сатре, ки бо чеки санҷишӣ мондааст (масалан, моли воқеие, ки тасодуфан ба сабад афтод)
        if (rc) for (const x of S.tx.filter(t => t.receipt_code === rc)) await deleteTx(x);
        await fetch('/api/logout', { method: 'POST' });
    }, M, receipt).catch(e => console.log('cleanup:', e.message));
    ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors.slice(0, 3)));
    await b.close();
}
console.log(`\nprod.check: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
