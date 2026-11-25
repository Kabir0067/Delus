/* Ҷустуҷӯи мол: node search.test.mjs
   Худи коди ҷустуҷӯ аз assets/js/core.js гирифта мешавад (бе браузер). Номҳо мисли номҳои воқеии мағоза. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const src = fs.readFileSync(path.join(ROOT, 'assets/js/core.js'), 'utf8');
const a = src.indexOf('/* ---------- ҷустуҷӯ ----------'), b = src.indexOf('/* ==================================================================\n   ПАЙВАСТ БО GOOGLE SHEETS');
const S = new Function(src.slice(a, b) + '\nreturn { norm, matchScore, rankBy, prodText, hasAll };')();

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); };

const P = [
    [1, 'Розетка 1-местная с заземлением 16А', 'Розетки', 'White'],
    [2, 'Розетка 2-местная с заземлением 16А', 'Розетки', 'White'],
    [3, 'Выключатель 1-клавишный 10А', 'Выключатели', 'White'],
    [4, 'Выключатель 2-клавишный 10А', 'Выключатели', 'White'],
    [6, 'Кабель ВВГ-Пнг 3х1.5', 'Кабель и провод', 'Black'],
    [7, 'Кабель ВВГ-Пнг 3х2.5', 'Кабель и провод', 'Black'],
    [8, 'Светильник LED 18W потолочный', 'Освещение', 'White'],
    [9, 'Автоматический выключатель 1P 16A', 'Автоматика', 'Grey'],
    [10, 'Удлинитель 3 розетки 5 м с заземлением', 'Удлинители', 'White'],
    [12, 'Razvetka', 'Glass', 'Gray'],
    [15, 'Ultra-thin glass gream gold', 'Розетки', 'Gream gold'],
    [16, 'Лампаи LED 12W E27', 'Равшанӣ', ''],
    [17, 'Прожектор LED 50W', 'Равшанӣ', ''],
    [18, 'Қуттии тақсимот 12', 'Қуттӣ', '']
].map(([id, name, category, color]) => ({ id, name, category, color, product_code: 'DL-' + id, barcode: id === 1 ? '4601234567890' : '' }));
const find = q => S.rankBy(P, S.prodText, q).map(p => p.id);
const first = (q, id, msg) => { const r = find(q); ok(r[0] === id, `«${q}» → ${msg} (${r.join(',')})`); };
const only = (q, ids, msg) => { const r = find(q); ok(r.length === ids.length && ids.every(i => r.includes(i)), `«${q}» → ${msg} (${r.join(',')})`); };

first('розетка', 1, 'socket first');
first('разетка', 1, 'a/o mix-up still finds the socket');
first('разедка', 1, 't/d mix-up too');
first('razetka', 1, 'Latin letters');
first('розетка 2', 2, 'socket + number picks the 2-gang one');
first('виключател', 3, 'switch without ы and ь');
first('выкл 2', 4, 'short word + number');
first('афтомат 16', 9, 'breaker with a typo and a number');
first('автамат', 9, 'breaker with another typo');
only('кабел 2,5', [7], 'cable 2,5 only (not 1.5)');
only('кабель 2.5', [7], 'dot and comma are the same');
only('прожектор', [17], 'exact name: no unrelated lamps');
ok(find('16').includes(9) && find('16').includes(1) && !find('16').includes(8), 'numbers are exact: 16 never finds 18W (' + find('16') + ')');
first('лампа', 16, 'lamp');
ok(find('чароғ').includes(16) && find('чароғ').includes(8) && find('чароғ').includes(17) && !find('чароғ').includes(1), 'Tajik «чароғ» (not in any name) finds lamps, light and projector');
ok(find('сим').every(id => [6, 7].includes(id)) && find('сим').length === 2, 'Tajik «сим» finds cables: ' + find('сим'));
ok(find('калид').includes(3) && find('калид').includes(4), 'Tajik «калид» finds switches: ' + find('калид'));
first('gold', 15, 'Latin word');
first('голд', 15, 'Latin word typed in Cyrillic');
first('қуттӣ', 18, 'Tajik letters');
first('кутти', 18, 'Tajik letters typed without Tajik keyboard');
first('4601234567890', 1, 'barcode digits');
first('виклчател', 3, 'a missing letter in a long word');
first('удлинител', 10, 'extension cord without ь');
only('qwerty', [], 'nonsense finds nothing');
ok(!find('калид').includes(15), '«калид» does not drift to «gold» by typo rules');
ok(S.hasAll('Розетка', ''), 'empty search matches everything');
ok(S.norm('Ёлка ҚҒҲҶӢӮ') === 'елка кгхчиу', 'Tajik letters normalised: ' + S.norm('Ёлка ҚҒҲҶӢӮ'));

const t0 = performance.now();
const many = Array.from({ length: 2000 }, (_, i) => ({ ...P[i % P.length], id: i }));
for (const q of ['раз', 'разе', 'разет', 'разетк', 'разетка']) S.rankBy(many, S.prodText, q);
const ms = performance.now() - t0;
ok(ms < 400, `2000 products, 5 keystrokes: ${ms.toFixed(0)} ms`);

console.log(`\nsearch.test: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
