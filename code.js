/* ==================================================================
   DELUS — бекенд (Google Apps Script)
   Кушодан: дар Google Sheet → Extensions → Apps Script → ин кодро гузоред
   → Deploy → New deployment → Web app → Execute as: Me → Access: Anyone
   → линки /exec-ро дар файли main.js (сатри DEFAULT_API) гузоред.
   Калиди сервисӣ лозим НЕСТ — варақҳо аз дохили худашон хонда мешаванд.
   ================================================================== */

var SHEETS = ['Products', 'Locations', 'Transactions'];
var TZ = 'Asia/Dushanbe';
var TOKEN_HOURS = 12;

/* ---------- нуқтаи вуруд ---------- */
function doPost(e) {
  var out;
  try {
    out = handle(JSON.parse(e.postData.contents || '{}'));
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'DELUS', time: new Date().toISOString() }));
}

/* ---------- амон (ключ-сессия) ----------
   CacheService дар Apps Script аз 10 дақиқа зиёд нигоҳ намедорад, бинобар ин
   рақами сессия бо муҳлаташ дар PropertiesService (доимӣ) нигоҳ дошта мешавад. */
function props() { return PropertiesService.getScriptProperties(); }
function putToken(token) {
  var p = props(), exp = Date.now() + TOKEN_HOURS * 3600 * 1000;
  p.setProperty('t_' + token, String(exp));
  var all = p.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf('t_') === 0 && Number(all[k]) < Date.now()) p.deleteProperty(k); });
}
function tokenValid(token) {
  if (!token) return false;
  var v = props().getProperty('t_' + token);
  return !!v && Number(v) > Date.now();
}
function dropToken(token) {
  if (token) props().deleteProperty('t_' + token);
  return { ok: true };
}

/* ---------- тақсимоти амалҳо ---------- */
function handle(q) {
  if (q.action === 'login') return login(q);

  if (!tokenValid(q.token)) return { ok: false, error: 'AUTH' };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    switch (q.action) {
      case 'load': return load();
      case 'save': return save(q.sheet, q.row || {});
      case 'remove': return remove(q.sheet, q.id);
      case 'setLogin': return setLogin(q.login, q.pass);
      case 'logout': return dropToken(q.token);
      case 'setSetting': return setSetting(q.key, q.value);
      case 'uploadImage': return uploadImage(q.name, q.data);
      default: throw new Error('Амал номаълум аст: ' + q.action);
    }
  } finally {
    lock.releaseLock();
  }
}

/* ---------- варақҳо ---------- */
function sheet(name) {
  var s = SpreadsheetApp.getActive().getSheetByName(name);
  if (!s) throw new Error('Варақи «' + name + '» дар ҷадвал нест');
  return s;
}
function settingsSheet() {
  var ss = SpreadsheetApp.getActive();
  var s = ss.getSheetByName('Settings');
  if (!s) {
    s = ss.insertSheet('Settings');
    s.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    s.getRange(2, 1, 2, 2).setValues([['low_stock', 10], ['company', 'DELUS']]);
  }
  return s;
}
function settings() {
  var out = {};
  settingsSheet().getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0]) out[String(r[0])] = r[1];
  });
  return out;
}
function setSetting(key, value) {
  var s = settingsSheet(), v = s.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(key)) { s.getRange(i + 1, 2).setValue(value); return { ok: true }; }
  }
  s.appendRow([key, value]);
  return { ok: true };
}

/* сатрҳоро ба объект табдил медиҳад; санаҳоро ҳамчун матни ISO меорад */
function rows(name) {
  var v = sheet(name).getDataRange().getValues();
  if (!v.length) return [];
  var head = v.shift();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (v[i][0] === '' || v[i][0] === null) continue;
    var o = {};
    for (var j = 0; j < head.length; j++) {
      var cell = v[i][j];
      o[head[j]] = cell instanceof Date ? Utilities.formatDate(cell, TZ, 'yyyy-MM-dd HH:mm:ss') : cell;
    }
    out.push(o);
  }
  return out;
}
function headers(name) {
  return sheet(name).getDataRange().getValues()[0] || [];
}

/* ---------- вуруд ---------- */
function login(q) {
  var L = rows('login');
  var ok = L.some(function (r) {
    return String(r.login).trim() === String(q.login).trim() && String(r.pass).trim() === String(q.pass).trim();
  });
  if (!ok) return { ok: false, error: 'Логин ё парол нодуруст аст' };
  var token = Utilities.getUuid();
  putToken(token);
  return { ok: true, token: token };
}
function setLogin(loginName, pass) {
  var s = sheet('login'), v = s.getDataRange().getValues();
  var name = String(loginName || '').trim(), pw = String(pass || '').trim();
  if (!name || !pw) throw new Error('Логин ё парол холӣ аст');
  var i = -1;
  for (var k = 1; k < v.length; k++) if (String(v[k][0]).trim() === name) { i = k; break; }
  if (i >= 0) s.getRange(i + 1, 2).setValue(pw);
  else s.appendRow([name, pw]);
  setSetting('login', name);
  return { ok: true };
}

/* ---------- хондани ҳама ---------- */
function load() {
  return {
    ok: true,
    products: rows('Products'),
    locations: rows('Locations'),
    transactions: rows('Transactions'),
    settings: settings()
  };
}

/* ---------- нигоҳ доштан (эҷод/тағйир) ---------- */
function save(name, row) {
  if (SHEETS.indexOf(name) < 0) throw new Error('Ҷадвал нодуруст: ' + name);
  var s = sheet(name), v = s.getDataRange().getValues(), head = v[0];
  if (!head || head.length === 0) throw new Error('Сутунҳои сарлавҳа нест');

  var id = row.id === '' || row.id === null || row.id === undefined ? '' : row.id;
  var i = -1;
  if (id !== '') for (var k = 1; k < v.length; k++) if (String(v[k][0]) === String(id)) { i = k; break; }

  var isNew = i < 0;
  if (isNew) {
    var max = 0;
    for (var m = 1; m < v.length; m++) max = Math.max(max, Number(v[m][0]) || 0);
    id = max + 1;
    i = v.length;
  }

  var old = v[i] || [];
  var out = head.map(function (col, j) {
    if (String(col) === 'id') return id;
    // агар майдон дар ин дархост бошад (ҳатто холӣ) — ҳамон қимат навишта мешавад;
    // дар ғайри ин сурат қимати пешина нигоҳ дошта мешавад
    if (Object.prototype.hasOwnProperty.call(row, col)) return row[col] === null || row[col] === undefined ? '' : row[col];
    if (isNew) return '';
    return old[j] === undefined ? '' : old[j];
  });

  // майдонҳои ҳатмии системавӣ — ҳама автоматӣ пур мешаванд
  var ts = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
  var idxCreated = head.indexOf('created_at');
  if (idxCreated >= 0 && (isNew || !out[idxCreated])) out[idxCreated] = ts;
  /* сана ва соат: корбар онро интихоб намекунад — ҳамеша ҳамин лаҳза */
  var idxDate = head.indexOf('date');
  if (idxDate >= 0 && name === 'Transactions' && !out[idxDate]) out[idxDate] = ts;
  var idxCode = head.indexOf('transaction_code');
  if (isNew && idxCode >= 0 && !out[idxCode]) out[idxCode] = 'TR-' + ('00000' + id).slice(-5);
  /* рамзи мол: агар холӣ гузошта шавад, барнома худаш месозад (DL-00012) */
  var idxPCode = head.indexOf('product_code');
  if (idxPCode >= 0 && name === 'Products' && !String(out[idxPCode] || '').trim()) out[idxPCode] = 'DL-' + ('00000' + id).slice(-5);
  var idxUnits = head.indexOf('base_quantity');
  if (idxUnits >= 0 && name === 'Transactions' && !out[idxUnits]) out[idxUnits] = out[head.indexOf('quantity')] || 0;

  s.getRange(i + 1, 1, 1, head.length).setValues([out]);
  return { ok: true, id: id };
}

/* ---------- нест кардан ---------- */
function remove(name, id) {
  if (SHEETS.indexOf(name) < 0) throw new Error('Ҷадвал нодуруст: ' + name);
  var s = sheet(name), v = s.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(id)) { s.deleteRow(i + 1); return { ok: true }; }
  }
  return { ok: false, error: 'Сатр ёфт нашуд' };
}

/* ---------- акс ба Google Drive ---------- */
function uploadImage(fileName, base64) {
  if (!base64) throw new Error('Акс дода нашуд');
  var folder = driveFolder();
  var bytes = Utilities.base64Decode(base64.replace(/^data:[^;]+;base64,/, ''));
  var blob = Utilities.newBlob(bytes, 'image/jpeg', 'delus-' + Utilities.getUuid().slice(0, 8) + '.jpg');
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var id = file.getId();
  return { ok: true, url: 'https://lh3.googleusercontent.com/d/' + id };
}
function driveFolder() {
  var name = 'DELUS-photos';
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}
    