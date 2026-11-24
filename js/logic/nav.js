// FinDash 純邏輯模組：導覽（側邊欄／底部列）。不依賴畫面與 Vue，可直接用 Node 測試。
export const NAV_TABS = [
    { key: 'expenses', title: '日常收支與對帳管理', short: '日常收支' },
    { key: 'investments', title: 'ETF 與股票投資儀表板', short: 'ETF 與股票' },
    { key: 'monthly', title: '月收支表', short: '月收支表' },
    { key: 'cards', title: '信用卡待結算', short: '信用卡' }
];

// 側邊欄要不要「展開」：使用者沒選過（''）→ 1280px 以上展開、其餘窄欄；選了展開 → 1024px 以上才有空間展開；選了收合 → 一律窄欄
export const isNavWide = (pref, vw) => (pref === 'wide' ? vw >= 1024 : pref === 'mini' ? false : vw >= 1280);

// 按下「收合／展開」按鈕後的新偏好：目前是展開 → 收合；目前是窄欄 → 展開
export const nextNavPref = (wideNow) => (wideNow ? 'mini' : 'wide');

export const navTabIndex = (key) => Math.max(0, NAV_TABS.findIndex(t => t.key === key));
