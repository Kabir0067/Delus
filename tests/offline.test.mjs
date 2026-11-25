/* Кор бе интернет: node offline.test.mjs
   Сервери воқеӣ (server.js + /api/op) бо ҷадвали сохтаи Google ва service worker-и воқеӣ (sw.js).
   1. Барнома як бор бо интернет кушода мешавад.
   2. Интернет хомӯш, барнома аз нав кушода мешавад: бояд аз хотираи телефон кушода шавад.
   3. Фурӯш бе интернет сабт мешавад ва дар экран фавран намоён аст.
   4. Интернет бармегардад: фурӯш худаш ба ҷадвал меравад, як бор. */
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, watch, wait, OUT } from './lib.mjs';
import { sheetsApi, serveGoogle } from './fakegoogle.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); };
const day = d => Math.floor((Date.now() + 5 * 36e5) / 864e5 + 25569) - d + 0.5;

const tables = {
    Products: [['id', 'product_code', 'name', 'category', 'series', 'color', 'mesta', 'taga', 'unit', 'units_per_box', 'purchase_price', 'sale_price', 'image_url', 'description', 'status', 'created_at', 'min_stock', 'barcode'],
        [1, 'DL-1', 'Розетка 2-ҷойгоҳа', 'Розетка', '', '', '', '', 'дона', '', 10, 18, '', '', 'ACTIVE', day(30), '', ''],
        [2, 'DL-2', 'Кабели ВВГ 3×2.5', 'Кабел', '', '', '', '', 'метр', '', 5, 8, '', '', 'ACTIVE', day(30), '', '']],
    Locations: [['id', 'name', 'location_type', 'status'], [1, 'Анбор', 'Warehouse', 'ACTIVE'], [2, 'Мағоза', 'Shop', 'ACTIVE']],
    Transactions: [['id', 'transaction_code', 'date', 'type', 'product_id', 'from_location_id', 'to_location_id', 'quantity', 'unit', 'base_quantity', 'unit_cost', 'unit_price', 'note', 'created_at', 'receipt_code'],
        [1, 'TR-00001', day(20), 'PURCHASE', 1, '', 2, 40, 'дона', 40, 10, 18, '', day(20), ''],
        [2, 'TR-00002', day(20), 'PURCHASE', 2, '', 2, 100, 'метр', 100, 5, 8, '', day(20), '']],
    Settings: [['key', 'value', 'note'], ['company_name', 'DELUS', '']],
    Images: [['product_id', 'data', 'updated_at']],
    Expenses: [['id', 'date', 'category', 'amount', 'location_id', 'note', 'created_at']],
    Debts: [['id', 'customer', 'phone', 'amount', 'paid', 'status', 'date', 'due_date', 'receipt_code', 'note', 'created_at']],
    DebtPayments: [['id', 'debt_id', 'amount', 'date', 'method', 'note', 'created_at']],
    login: [['login', 'password'], ['test', 'test']]
};
const api = sheetsApi(tables);
const g = await serveGoogle(api, 8299);
const DATA = path.join(OUT, 'offline-data');
fs.rmSync(DATA, { recursive: true, force: true });
const srv = await serve(8298, { GOOGLE_API: g.url, GOOGLE_TOKEN: 'test', SPREADSHEET_ID: 'TEST', DATA_DIR: DATA });
const url = 'http://127.0.0.1:8298/?sw=1';

const b = await launch();
const ctx = await b.createBrowserContext();
const page = await ctx.newPage();
const errors = [];
watch(page, errors);
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loginUser', { visible: true });
    await page.type('#loginUser', 'test');
    await page.type('#loginPass', 'test');
    await page.click('#loginBtn');
    await page.waitForSelector('#app:not([hidden]) .hero', { timeout: 20000 });
    ok(true, 'logged in through the real server');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 20000 });
    await page.waitForFunction(async () => (await caches.keys()).length && (await (await caches.open((await caches.keys())[0])).keys()).some(r => r.url.includes('app.js?v=')), { timeout: 20000 });
    ok(true, 'service worker controls the page and keeps the app files');

    /* бе интернет */
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([hidden]) .hero', { timeout: 20000 });
    ok(await page.evaluate(() => S.products.length === 2), 'no internet: the app opens from the phone memory with the last data');

    const n0 = tables.Transactions.length;
    await page.evaluate(() => quickSale(prodBy(1)));
    await page.click('.ov .qs-chips [data-set="3"]');
    await page.click('.ov [data-save]');
    await page.waitForFunction(() => !document.querySelector('.ov'));
    await wait(500);
    const offline = await page.evaluate(() => ({ q: qtyAll(1), waiting: Q.list.filter(j => j.state === 'wait').length, banner: document.querySelector('#banner').textContent }));
    ok(offline.q === 37 && offline.waiting === 1, `sale without internet: stock 40 → ${offline.q} at once, 1 record waiting`);
    ok(/Интернет нест/.test(offline.banner) && /телефон/.test(offline.banner), 'banner: no internet, the record is kept in the phone');
    ok(tables.Transactions.length === n0, 'nothing reached the sheet while offline');
    await page.screenshot({ path: path.join(OUT, 'offline-390.png') });

    /* интернет баргашт */
    await page.setOfflineMode(false);
    await page.waitForFunction(() => !Q.busy && !Q.list.some(j => j.state === 'wait' || j.state === 'send'), { timeout: 70000 });
    const last = tables.Transactions[tables.Transactions.length - 1];
    ok(tables.Transactions.length === n0 + 1 && last[3] === 'SALE' && last[7] === 3 && /^R-\d{5}$/.test(last[14]), 'internet back: the sale reached the sheet once, with a receipt number');
    await page.evaluate(() => sync());
    ok(await page.evaluate(() => qtyAll(1) === 37 && Q.list.length === 0 && !document.querySelector('.sync-n')), 'after re-reading the sheet: stock 37, queue empty');
    const real = errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR/.test(e));
    ok(real.length === 0, 'no console errors (apart from the expected offline network failures) ' + JSON.stringify(real.slice(0, 3)));
} catch (e) {
    ok(false, 'aborted: ' + e.message);
} finally {
    await b.close();
    srv.close();
    g.close();
}
console.log(`\noffline.test: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
