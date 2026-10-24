/* بيئة Google Apps Script وهمية لاختبار الجزء 7 (مخزن Sheets) بنفس اختبارات الخدمة */
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');

function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

class FakeRange {
  constructor(sh, r, c, nr, nc) {
    if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('bad range ' + [r, c, nr, nc]);
    if (r + nr - 1 > sh.maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet. ' + sh.name + ' rows ' + (r + nr - 1) + ' > ' + sh.maxRows);
    Object.assign(this, { sh, r, c, nr, nc });
  }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.grid[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } this.sh.book.stats.reads++; return out; }
  setValues(arr) {
    this.sh.book.stats.writes++;
    if (arr.length !== this.nr || arr.some(a => a.length !== this.nc)) throw new Error('setValues dimension mismatch ' + arr.length + 'x' + (arr[0] || []).length + ' vs ' + this.nr + 'x' + this.nc);
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh._put(this.r + i, this.c + j, arr[i][j]);
    return this;
  }
  setValue(v) { this.sh.book.stats.writes++; for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh._put(this.r + i, this.c + j, v); return this; }
  setNumberFormat(f) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.fmt[(this.r + i) + ':' + (this.c + j)] = f; return this; }
  setNumberFormats(a) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.fmt[(this.r + i) + ':' + (this.c + j)] = a[i][j]; return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { if (this.sh.grid[this.r - 1 + i]) this.sh.grid[this.r - 1 + i][this.c - 1 + j] = ''; } return this; }
}
['setBackground', 'setFontColor', 'setFontWeight', 'setHorizontalAlignment', 'setFontStyle'].forEach(m => { FakeRange.prototype[m] = function () { return this; }; });

class FakeSheet {
  constructor(book, name) { this.book = book; this.name = name; this.grid = []; this.fmt = {}; this.maxRows = 1000; }
  _put(r, c, v) {
    while (this.grid.length < r) this.grid.push([]);
    const row = this.grid[r - 1]; while (row.length < c) row.push('');
    const f = this.fmt[r + ':' + c];
    /* يحاكي تحويلات Sheets التلقائية للخلايا غير النصية */
    if (f !== '@' && typeof v === 'string') {
      if (/^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '') { this.book.stats.autoconv++; v = Number(v); }
      else if (/^=/.test(v)) { this.book.stats.formula++; v = '#NAME?'; }
    }
    row[c - 1] = v;
  }
  getLastRow() { let last = 0; this.grid.forEach((row, i) => { if (row.some(v => v !== '' && v !== undefined && v !== null)) last = i + 1; }); return last; }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(pos, n) { this.maxRows += n; }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr || 1, nc || 1); }
  setFrozenRows() { } setRightToLeft() { } setTabColor() { } setColumnWidths() { } getName() { return this.name; }
}
class FakeBook {
  constructor() { this.sheets = [new FakeSheet(this, 'Sheet1')]; this.stats = { reads: 0, writes: 0, autoconv: 0, formula: 0 }; }
  getId() { return 'fake-book'; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(this, n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
}

function make(opts) {
  opts = opts || {};
  const book = new FakeBook(), mails = [], propsMap = {}, cacheMap = {}, triggers = [];
  let sentCount = 0;
  const cfgOffset = (date) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', timeZoneName: 'longOffset' }).formatToParts(date);
    const z = parts.find(p => p.type === 'timeZoneName').value;      // GMT+02:00 / GMT+03:00
    const m = /GMT([+-])(\d\d):(\d\d)/.exec(z);
    return m ? m[1] + m[2] + m[3] : '+0000';
  };
  const sandbox = {
    console, Date, Math, JSON, Object, Array, String, Number, Error, parseInt, parseFloat, isNaN, Intl, Uint8Array, Uint32Array, RegExp, Set, Map,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book, openById: () => book,
      getUi: () => ({ alert: (...a) => { sandbox.__alerts.push(a.join(' | ')); return 'OK'; }, ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' }, Button: { YES: 'YES' }, createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; } })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in propsMap ? propsMap[k] : null), setProperty: (k, v) => { propsMap[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cacheMap[k] || null, put: (k, v) => { cacheMap[k] = v; }, remove: k => { delete cacheMap[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { if (sandbox.__lockHeld) throw new Error('lock'); sandbox.__lockHeld = true; }, releaseLock: () => { sandbox.__lockHeld = false; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, fmt) => {
        if (fmt === 'Z') return cfgOffset(d);
        const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
        return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute;
      }
    },
    MailApp: { sendEmail: o => { mails.push({ to: [o.to], sub: o.subject, body: o.body, html: o.htmlBody }); sentCount++; }, getRemainingDailyQuota: () => 100 - sentCount },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(), deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => { const t = { getHandlerFunction: () => fn, n }; triggers.push(t); return t; } }) }) }),
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/FAKE/exec' })
    },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (s) => { const o = { text: String(s), mime: null, setMimeType(m) { this.mime = m; return this; }, getContent() { return this.text; } }; return o; } },
    HtmlService: { createHtmlOutputFromFile: (f) => { const o = { file: f, setTitle(t) { this.title = t; return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }; return o; }, XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' } },
    __alerts: [], __lockHeld: false
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const src = fs.readFileSync(__dirname + '/dist/core_gas.js', 'utf8');
  vm.runInContext(src, ctx, { filename: 'core_gas.js' });
  if (opts.now) vm.runInContext('GAS.setNow', ctx)(opts.now);
  return { ctx, book, mails, props: propsMap, cache: cacheMap, triggers, sandbox };
}
module.exports = { make, FakeBook };
