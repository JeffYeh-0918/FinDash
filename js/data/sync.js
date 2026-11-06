// 同步引擎：版本號 + 安全保護。不碰畫面、不直接碰網路（透過 api），可直接用 Node 測試。
// 畫面端（確認視窗、提示、套用資料到畫面）一律用 hooks 接進來。
//
// 安全規則（務必保留）：
//  1. 從未成功拉過雲端資料（rev 為 null）前，絕不上傳，避免空資料覆蓋雲端
//  2. 上傳帶著 baseRev，別台裝置已更新過 → conflict，由使用者決定
//  3. 要上傳的筆數遠少於雲端 → shrink，由使用者決定
//  4. 套用雲端資料時不算「使用者修改」（suppressDirty）
export const createSyncEngine = ({ api, storage, getUrl, getData, hooks = {}, debounceMs = 800, retryMs = 300,
    keyRev = 'findash_cloud_rev_v1', keyDirty = 'findash_dirty_v1' }) => {
    const h = {
        onState() {}, onBusy() {}, applyData() {}, nextTick: () => Promise.resolve(), afterApply() {}, afterSync() {},
        onFailure() {}, confirm: async () => false, ...hooks
    };
    let cloudRev = storage.getItem(keyRev);                    // 本機所依據的雲端版本；null = 從未成功同步過
    let dirty = storage.getItem(keyDirty) === '1';             // 有尚未上傳的本機修改
    let suppressDirty = false;                                 // 套用雲端資料時，不要把它當成「使用者修改」
    let pushTimer = null, pushing = false, editSeq = 0, syncing = false;

    const setDirty = (v) => { dirty = v; storage.setItem(keyDirty, v ? '1' : '0'); };
    const setRev = (r) => {
        cloudRev = (r === null || r === undefined) ? null : String(r);
        if (cloudRev === null) storage.removeItem(keyRev); else storage.setItem(keyRev, cloudRev);
    };

    // 使用者有修改 → 標記未同步，並延遲上傳（合併連續操作）
    const markEdited = () => {
        if (suppressDirty) return;
        editSeq++;
        setDirty(true);
        if (!getUrl()) return;
        h.onState('dirty');
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => { pushNow(); }, debounceMs);
    };

    const applyCloud = async (data) => {
        suppressDirty = true;
        try {
            h.applyData(data);
            setRev(data.rev || 0);
            setDirty(false);
            await h.nextTick();      // 等畫面端的監聽器跑完，這段時間內的變動不算使用者修改
        } finally {
            suppressDirty = false;
        }
        h.afterApply();
    };

    const pushNow = async (force = false) => {
        if (!getUrl() || pushing) return false;
        if (cloudRev === null && !force) return false;   // 從未拉過雲端資料前，絕不上傳
        pushing = true;
        const seq = editSeq;
        h.onState('syncing');
        try {
            const r = await api.pushAll(getUrl(), { baseRev: cloudRev === null ? null : Number(cloudRev), force: !!force, ...getData() });
            if (r.status === 'success') {
                setRev(r.rev);
                if (seq === editSeq) { setDirty(false); h.onState('ok'); }
                else { h.onState('dirty'); clearTimeout(pushTimer); pushTimer = setTimeout(() => { pushNow(); }, retryMs); }   // 上傳期間又有修改
                return true;
            }
            if (r.status === 'conflict') {
                h.onState('conflict');
                pushing = false;
                if (await h.confirm('conflict', {})) {
                    const data = await api.fetchAll(getUrl());
                    if (data.status === 'success') { await applyCloud(data); h.onState('ok'); h.afterSync(); }
                }
                return false;
            }
            if (r.status === 'shrink') {
                pushing = false;
                if (await h.confirm('shrink', { cloudCount: r.cloudCount, newCount: r.newCount })) {
                    return await pushNow(true);
                }
                h.onState('dirty');
                return false;
            }
            throw new Error(r.message || '未知錯誤');
        } catch (e) {
            console.warn('上傳雲端失敗:', e);
            h.onState('error');
            h.onFailure(true);
            return false;
        } finally {
            pushing = false;
        }
    };

    // 回傳結果：'no-url' | 'busy' | 'aborted'（先上傳失敗）| 'pushed'（雲端是空的，改成上傳）| 'synced' | 'failed'
    const syncFromCloud = async ({ silent = false } = {}) => {
        if (!getUrl()) return 'no-url';
        if (syncing) return 'busy';
        syncing = true;
        h.onBusy(true);
        h.onState('syncing');
        try {
            // 本機有尚未上傳的修改 → 先上傳，再拉取
            if (dirty && cloudRev !== null) {
                const ok = await pushNow();
                if (!ok) return 'aborted';
            }
            const data = await api.fetchAll(getUrl());
            if (data.status !== 'success') throw new Error(data.message || '雲端回傳格式錯誤');
            const cloudCount = (data.expenses || []).length + (data.stockTrades || []).length;
            const local = getData();
            const localCount = local.expenses.length + local.stockTrades.length;
            if (cloudCount === 0 && localCount > 0 && cloudRev === null) {
                if (await h.confirm('emptyCloud', {})) {
                    setRev(data.rev || 0);
                    await pushNow();
                    return 'pushed';
                }
            }
            await applyCloud(data);
            h.onState('ok');
            h.afterSync();
            return 'synced';
        } catch (e) {
            console.warn('同步失敗:', e);
            h.onState('error');
            h.onFailure(silent);
            return 'failed';
        } finally {
            syncing = false;
            h.onBusy(false);
        }
    };

    return {
        markEdited, pushNow, syncFromCloud,
        setDirty,                                  // 清空重來時：標記有未上傳的修改
        resetRev: () => setRev(null),              // 換了雲端網址，舊版本號作廢
        initialState: () => (getUrl() ? (dirty ? 'dirty' : 'idle') : 'local'),
        isDirty: () => dirty,
        getRev: () => cloudRev
    };
};
