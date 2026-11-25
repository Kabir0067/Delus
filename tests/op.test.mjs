/* Сабти амал дар сервер (/api/op): node op.test.mjs
   server.js-и воқеӣ бо ҷадвали сохтаи Google (fakegoogle.mjs) кор мекунад — бе интернет ва бе ҷадвали воқеӣ.
   Санҷида мешавад: сабти якбора, такрор нашудан (ҳамон амал ду бор, ҷавоби гумшуда, хатои Google, хомӯшии сервер),
   қарз бо пешпардохт, пардохти қарз, нархи нав ҳангоми воридот, хароҷот, хатоҳои дархост. */
import fs from 'node:fs';
import path from 'node:path';
import { serve, wait, OUT } from './lib.mjs';
import { sheetsApi, serveGoogle } from './fakegoogle.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); };

const tables = {
    Products: [['id', 'product_code', 'name', 'category', 'series', 'color', 'mesta', 'taga', 'unit', 'units_per_box', 'purchase_price', 'sale_price', 'image_url', 'description', 'status', 'created_at', 'min_stock', 'barcode'],
        [1, 'DL-1', 'Розетка', '', '', '', '', '', 'дона', '', 10, 18, '', '', 'ACTIVE', 46000, '', ''],
        [2, 'DL-2', 'Кабел', '', '', '', '', '', 'метр', '', 5, 8, '', '', 'ACTIVE', 46000, '', '']],
    Locations: [['id', 'name', 'location_type', 'status'], [1, 'Анбор', 'Warehouse', 'ACTIVE'], [2, 'Мағоза', 'Shop', 'ACTIVE']],
    Transactions: [['id', 'transaction_code', 'date', 'type', 'product_id', 'from_location_id', 'to_location_id', 'quantity', 'unit', 'base_quantity', 'unit_cost', 'unit_price', 'note', 'created_at', 'receipt_code'],
        [1, 'TR-00001', 46000, 'PURCHASE', 1, '', 1, 100, 'дона', 100, 10, 18, '', 46000, '']],
    Settings: [['key', 'value', 'note']],
    Images: [['product_id', 'data', 'updated_at']],
    Expenses: [['id', 'date', 'category', 'amount', 'location_id', 'note', 'created_at']],
    Debts: [['id', 'customer', 'phone', 'amount', 'paid', 'status', 'date', 'due_date', 'receipt_code', 'note', 'created_at'],
        [1, 'Фирӯз', '', 100, 0, 'OPEN', 46000, '', '', '', 46000]],
    DebtPayments: [['id', 'debt_id', 'amount', 'date', 'method', 'note', 'created_at'], [1, 1, 30, 46001, 'CASH', '', 46001]],
    login: [['login', 'password'], ['test', 'test']]
};
const api = sheetsApi(tables);
const g = await serveGoogle(api, 8297);
const DATA = path.join(OUT, 'op-data');
fs.rmSync(DATA, { recursive: true, force: true });
const env = { GOOGLE_API: g.url, GOOGLE_TOKEN: 'test', SPREADSHEET_ID: 'TEST', DATA_DIR: DATA };
let srv = await serve(8296, env);
const base = 'http://127.0.0.1:8296/api';
let cookie = '';
const call = async (p, body) => {
    const r = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, j: await r.json().catch(() => ({})) };
};
const rows = s => tables[s].slice(1);
const sale = (id, extra = {}) => ({
    id, receipt: true,
    tx: [{ date: 46350.5, type: 'SALE', product_id: 1, from_location_id: 2, to_location_id: '', quantity: 2, unit: 'дона', unit_cost: 10, unit_price: 18, note: '', created_at: 46350.5 },
        { date: 46350.5, type: 'SALE', product_id: 2, from_location_id: 2, to_location_id: '', quantity: 3, unit: 'метр', unit_cost: 5, unit_price: 8, note: '', created_at: 46350.5 }],
    ...extra
});

ok((await call('/op', sale('aaaaaaaaaaaa'))).status === 401, 'without login: 401');
ok((await call('/login', { user: 'test', pass: 'test' })).status === 200, 'login');

/* 1. фурӯш: ду сатр бо як чек, як дархост ба Google */
let b0 = api.log.batches;
let r = await call('/op', sale('sale000000001'));
const tx = rows('Transactions');
ok(r.status === 200 && r.j.tx === 2 && r.j.receipt === 'R-00002', 'sale saved: ids from 2, receipt R-00002 ' + JSON.stringify(r.j));
ok(tx.length === 3 && tx[1][1] === 'TR-00002' && tx[2][1] === 'TR-00003' && tx[1][14] === 'R-00002' && tx[2][14] === 'R-00002', 'two rows, codes TR-00002/3, same receipt');
ok(tx[2][9] === 3 && tx[1][4] === 1 && tx[2][7] === 3, 'columns by name (base_quantity, product, quantity)');
ok(api.log.batches - b0 === 1, 'one Google write for the whole sale');

/* 2. ҳамон амал боз: ҳеҷ сатри нав */
r = await call('/op', sale('sale000000001'));
ok(r.status === 200 && r.j.receipt === 'R-00002' && rows('Transactions').length === 3, 'same op again: same answer, nothing written twice');

/* 3. ҳамон амали нав ду бор якбора */
const [p1, p2] = await Promise.all([call('/op', sale('sale000000002')), call('/op', sale('sale000000002'))]);
ok(p1.j.receipt === p2.j.receipt && rows('Transactions').length === 5, 'same op twice at once: written once ' + p1.j.receipt);

/* 4. ҷавоби Google гум шуд (сатрҳо сабт шуданд): телефон боз мефиристад — дубора сабт намешавад */
g.fault.lose = 1;
r = await call('/op', sale('sale000000003'));
ok(r.status >= 500, 'lost Google reply: server says try again (' + r.status + ')');
const afterLost = rows('Transactions').length;
r = await call('/op', sale('sale000000003'));
ok(r.status === 200 && rows('Transactions').length === afterLost && afterLost === 7, 'retry after lost reply: no duplicate rows (' + afterLost + ')');

/* 5. Google хато дод (чизе сабт нашуд): боз фиристодан ҳамон рақамҳоро истифода мебарад */
g.fault.fail = 1;
r = await call('/op', sale('sale000000004'));
const failedStatus = r.status;
r = await call('/op', sale('sale000000004'));
ok(failedStatus === 503 && r.status === 200 && r.j.tx === 8 && rows('Transactions').length === 9, 'Google error then retry: written once with the reserved ids ' + JSON.stringify(r.j));

/* 6. фурӯш ба қарз бо пешпардохт: қарз, пардохт ва чек дар як сабт */
r = await call('/op', sale('saledebt00001', {
    debt: { customer: 'Алӣ', phone: '+992 90 000 00 00', amount: 60, paid: 0, status: 'OPEN', date: 46350.5, due_date: '', receipt_code: '', note: '', created_at: 46350.5 },
    pays: [{ debt_id: '$debt', amount: 20, method: 'CASH', note: 'Пешпардохт', date: 46350.5, created_at: 46350.5 }]
}));
const d = rows('Debts').find(x => x[1] === 'Алӣ'), py = rows('DebtPayments').find(x => x[5] === 'Пешпардохт');
ok(r.status === 200 && d && d[0] === r.j.debt && d[8] === r.j.receipt && d[4] === 20 && d[5] === 'OPEN', 'debt row: own id, receipt of the sale, paid 20, OPEN');
ok(py && py[1] === r.j.debt && py[2] === 20, 'prepayment row points to the new debt');

/* 7. пардохт ба қарзи кӯҳна: «пардохт шуд» аз ҳамаи пардохтҳо ҳисоб мешавад */
r = await call('/op', { id: 'pay0000000001', pays: [{ debt_id: 1, amount: 70, method: 'CASH', note: '', date: 46351, created_at: 46351 }] });
const d1 = rows('Debts').find(x => x[0] === 1);
ok(r.status === 200 && d1[4] === 100 && d1[5] === 'CLOSED', 'old debt: 30 + 70 = 100 paid, CLOSED (' + d1[4] + ', ' + d1[5] + ')');

/* 8. воридот: нархи нав дар корти мол */
r = await call('/op', {
    id: 'buy0000000001', tx: [{ date: 46351, type: 'PURCHASE', product_id: 2, from_location_id: '', to_location_id: 1, quantity: 50, unit: 'метр', unit_cost: 6, unit_price: 9, note: '', created_at: 46351 }],
    prices: [{ id: 2, purchase_price: 6, sale_price: 9 }]
});
const p2row = rows('Products').find(x => x[0] === 2);
ok(r.status === 200 && p2row[10] === 6 && p2row[11] === 9, 'purchase updates product prices in the same write');

/* 9. хароҷот */
r = await call('/op', { id: 'exp0000000001', exp: { date: 46351, category: 'Иҷора', amount: 500, location_id: '', note: '', created_at: 46351 } });
ok(r.status === 200 && rows('Expenses').length === 1 && rows('Expenses')[0][0] === r.j.exp && rows('Expenses')[0][3] === 500, 'expense saved with its own id');

/* 10. дархости нодуруст: 400 ва ҳеҷ чиз сабт намешавад */
const before = JSON.stringify(tables);
ok((await call('/op', { id: 'x', tx: [] })).status === 400, 'bad op id: 400');
ok((await call('/op', { id: 'empty00000001' })).status === 400, 'empty op: 400');
ok((await call('/op', { id: 'bad0000000001', pays: [{ debt_id: '$debt', amount: 5 }] })).status === 400, 'payment to a missing new debt: 400');
ok((await call('/op', { id: 'bad0000000002', pays: [{ debt_id: 999, amount: 5, method: 'CASH', date: 46351, created_at: 46351 }] })).status === 400, 'payment to an unknown debt: 400');
ok((await call('/op', { id: 'bad0000000003', tx: [{ 'bad key': 1 }] })).status === 400, 'unknown field name: 400');
ok(JSON.stringify(tables) === before, 'rejected requests changed nothing');

/* 11. сервер дар мобайни сабт хомӯш шуд: пас аз бозоғозӣ ҳамон амал ду бор сабт намешавад */
g.fault.lose = 1;
await call('/op', sale('sale000000005'));
const mid = rows('Transactions').length;
srv.close();
await wait(400);
srv = await serve(8296, env);
/* Windows равандро якбора мекушад (бе SIGTERM): сессия шояд то сабт нарасида бошад — аз нав ворид мешавем */
await call('/login', { user: 'test', pass: 'test' });
r = await call('/op', sale('sale000000005'));
ok(r.status === 200 && rows('Transactions').length === mid, 'after server restart: the half-finished op is recognised, no duplicate');
r = await call('/op', sale('sale000000006'));
ok(r.status === 200 && r.j.tx > Math.max(...rows('Transactions').slice(0, -2).map(x => x[0])), 'ids keep growing after restart: ' + r.j.tx);

/* 12. рақамҳои /api/ids ва /api/op ҳеҷ гоҳ якхела намешаванд */
const ids = await call('/ids', { sheet: 'Transactions', n: 1 });
ok(ids.status === 200 && !rows('Transactions').some(x => x[0] === ids.j.first), '/api/ids gives a fresh id: ' + ids.j.first);

srv.close();
g.close();
console.log(`\nop.test: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
