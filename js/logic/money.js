// FinDash 純邏輯：金額顯示（前綴只留「$ 」，不加 NT；窄螢幕的大卡片，100 萬以上改用「萬／億」）
export const COMPACT_FROM = 1000000;
export const fmtMoney = (v) => '$ ' + Math.round(Number(v) || 0).toLocaleString('zh-TW');
export const fmtCompact = (v, from = COMPACT_FROM) => {
    const n = Math.round(Number(v) || 0), a = Math.abs(n), sign = n < 0 ? '-' : '';
    if (a < from) return fmtMoney(n);
    const fmt = (x, d) => Number(x.toFixed(d)).toLocaleString('zh-TW', { maximumFractionDigits: d });
    const man = a / 1e4, dec = man >= 1000 ? 0 : 1;   // 千萬以上不顯示小數（窄螢幕才放得下）
    if (Number(man.toFixed(dec)) >= 10000) return '$ ' + sign + fmt(a / 1e8, 2) + '億';   // 進位後滿 1 億就改用億
    return '$ ' + sign + fmt(man, dec) + '萬';
};
