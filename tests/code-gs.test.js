import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// 用假的 Google Apps Script 環境載入 Code.gs，驗證 doPost 的保護規則（V22）
const makeEnv = ({ rev = 5, cloudRows = 0, failOn = null } = {}) => {
    const props = { REV: String(rev), LAST_BACKUP: '99999999' };   // LAST_BACKUP 設成「今天已備份」，略過備份
    const calls = [];
    const sheets = {};
    const mkSheet = (name, rows) => ({
        getLastRow: () => rows, clearContents: () => calls.push('clear:' + name), hideSheet() {}, copyTo() { return { setName() {}, hideSheet() {} }; },
        getRange: () => ({ setValues: () => { if (failOn === name) throw new Error('boom'); calls.push('write:' + name); }, setNumberFormat() {}, getValue: () => '' })
    });
    sheets['日常收支紀錄'] = mkSheet('exp', cloudRows + 1); sheets['ETF股票交易歷史'] = mkSheet('stock', 1);
    const ctx = {
        console, JSON, Number, String, Array, Object, Date, isFinite, Math, parseFloat,
        ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
        PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
        SpreadsheetApp: { flush() {}, getActiveSpreadsheet: () => ({
            getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n, 1)), getSheets: () => [], deleteSheet() {} }) },
        Utilities: { formatDate: () => '20260101' }, CacheService: {}, UrlFetchApp: {}
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8'), ctx);
    const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }));
    return { post, props, calls };
};
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, date: '2026-11-15', amount: 1 }));

test('版本不符 → conflict，不寫入', () => {
    const { post, calls } = makeEnv({ rev: 5 });
    assert.equal(post({ baseRev: 4, expenses: rows(1), stockTrades: [] }).status, 'conflict');
    assert.equal(calls.length, 0);
});
test('V22：force 不能略過版本檢查（縮水確認期間別台裝置寫入過 → 仍回 conflict）', () => {
    const { post, calls } = makeEnv({ rev: 6, cloudRows: 40 });
    assert.equal(post({ baseRev: 5, force: true, expenses: rows(1), stockTrades: [] }).status, 'conflict');
    assert.equal(calls.length, 0);
});
test('筆數縮水 → shrink；確認後 force=true 且版本相符 → 寫入成功、版本 +1', () => {
    const { post, props } = makeEnv({ rev: 5, cloudRows: 40 });
    const s = post({ baseRev: 5, expenses: rows(3), stockTrades: [] });
    assert.equal(s.status, 'shrink'); assert.equal(s.cloudCount, 40);
    const ok = post({ baseRev: 5, force: true, expenses: rows(3), stockTrades: [] });
    assert.equal(ok.status, 'success'); assert.equal(ok.rev, 6); assert.equal(props.REV, '6');
});
test('baseRev 為 null → conflict；payload 不完整 → 拒絕', () => {
    const { post } = makeEnv();
    assert.equal(post({ baseRev: null, expenses: rows(1), stockTrades: [] }).status, 'conflict');
    assert.equal(post({ baseRev: 5, expenses: rows(1) }).status, 'error');
});
test('V22：資料先組好才動表——組資料就出錯時，沒有任何清除或寫入、版本不變', () => {
    const { post, calls, props } = makeEnv({ rev: 5 });
    const bad = { baseRev: 5, expenses: rows(1), stockTrades: [null] };   // null 會讓組資料時丟錯
    assert.equal(post(bad).status, 'error');
    assert.equal(calls.length, 0); assert.equal(props.REV, '5');
});
