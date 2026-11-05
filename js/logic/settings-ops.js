// FinDash 純邏輯模組（不依賴畫面、Vue、瀏覽器），可直接用 Node 測試。
// 第一個參數 st 是設定物件（畫面端傳 appSettings.value）
// 改名／刪除選項時，同步更新「類別對照、儲值事件、非消費類別、信用卡、預付類」等設定，避免設定指向已不存在的名稱
export const renameInSettings = (st, type, oldVal, clean) => {
    if (type === 'category') {
        st.categoryItems = Object.fromEntries(Object.entries(st.categoryItems).map(([k, v]) => [k === oldVal ? clean : k, v]));
        st.fundingRules.forEach(r => { if (r.category === oldVal) r.category = clean; });
        st.nonConsumptionCategories = st.nonConsumptionCategories.map(c => c === oldVal ? clean : c);
        st.passThroughCategories = (st.passThroughCategories || []).map(c => c === oldVal ? clean : c);
        if (st.categoryColors && st.categoryColors[oldVal]) { st.categoryColors[clean] = st.categoryColors[oldVal]; delete st.categoryColors[oldVal]; }
    } else if (type === 'item') {
        Object.keys(st.categoryItems).forEach(k => { const a = st.categoryItems[k]; if (Array.isArray(a)) st.categoryItems[k] = Array.from(new Set(a.map(i => i === oldVal ? clean : i))); });
        st.fundingRules.forEach(r => { if (r.item === oldVal) r.item = clean; });
    } else if (type === 'payment') {
        st.creditCards.forEach(c => { if (c.name === oldVal) c.name = clean; });
        st.prepaidMethods = Array.from(new Set(st.prepaidMethods.map(p => p === oldVal ? clean : p)));
    }
};
export const removeFromSettings = (st, type, val) => {
    if (type === 'category') {
        delete st.categoryItems[val];
        st.nonConsumptionCategories = st.nonConsumptionCategories.filter(c => c !== val);
        st.passThroughCategories = (st.passThroughCategories || []).filter(c => c !== val);
        if (st.categoryColors) delete st.categoryColors[val];
    } else if (type === 'item') {
        Object.keys(st.categoryItems).forEach(k => { const a = st.categoryItems[k]; if (Array.isArray(a)) st.categoryItems[k] = a.filter(i => i !== val); });
    } else if (type === 'payment') {
        st.prepaidMethods = st.prepaidMethods.filter(p => p !== val);
        st.creditCards = st.creditCards.filter(c => c.name !== val);
    }
};
