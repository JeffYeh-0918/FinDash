// FinDash 功能模組：拖曳排序（Pointer Events；手機、平板的卡片與電腦版表格共用同一套）
// 手勢：
//   觸控／手寫筆：長按 450ms →（未選取的卡片先選取）→ 不放手、移動超過約 5px 就開始拖；放開沒移動＝只是選取／準備拖而已。
//                 長按「已選取」的卡片不會取消選取，而是準備拖（要取消選取請點一下）。
//   滑鼠：按住並移動超過約 5px 才算拖；單純點擊維持原本行為（開啟編輯）。
//   拖的這一筆若已勾選，所有已勾選的整疊一起搬；沒勾選就只搬這一筆。
//   V23：清單依日期排序，放開時「游標所在的那一列」決定放進哪一天：整疊（可能來自不同天）全部改成那一天的日期，並放在你放開的位置（股票連動的收支不能單獨改日期，不同天的會留在原處）。
// 畫面：浮動的卡片堆（數量徽章、整併動畫）、插入位置指示線、原位置淡化、靠近邊緣自動捲動、Esc／拖回原處可取消。
// 排序邏輯在 js/logic/order.js（moveToDay）與 js/logic/drag.js，這裡只負責手勢與畫面。
import { moveToDay, isLinkedOtherDay, retargetLinked } from '../logic/order.js';
import { slotFromY, edgeScrollDelta, movedBeyond, groupIdsFor, isNoopSlot, clampSlotToDay, dayAtY } from '../logic/drag.js';

const { ref, computed, nextTick } = Vue;

export const useCardDrag = (ctx) => {
    // 取用前面模組已建立的成員
    const { selectedExpenseIds, selectedStockIds, expenses, stockTrades, pushToCloud, renderCharts, filteredExpenses, filteredStockTrades, fdmToggleSel, captureUndo, armUndo } = ctx;

    const LONG_MS = 450;      // 觸控長按時間
    const SCROLL_SLOP = 10;   // 長按前手指移動超過這個距離＝在捲動，不算長按
    const DRAG_PX = 5;        // 移動超過這個距離才算開始拖
    const STACK_MAX = 2;      // 浮動卡片堆最多露出幾張墊底的卡片

    /* ---------- 給範本用：哪些紀錄正在被拖（原位置淡化） ---------- */
    const dragKind = ref('');
    const dragIds = ref([]);
    const dragSet = computed(() => new Set(dragIds.value));
    const isDragSrc = (kind, id) => dragKind.value === kind && dragSet.value.has(String(id));

    const selRef = (kind) => (kind === 'stock' ? selectedStockIds : selectedExpenseIds);
    const fullRef = (kind) => (kind === 'stock' ? stockTrades : expenses);
    const viewOf = (kind) => (kind === 'stock' ? filteredStockTrades : filteredExpenses).value;
    // 畫面上看得到的列（手機卡片與電腦表格都在 DOM 裡，隱藏的那一套 getClientRects 是空的）；順序＝畫面由上到下
    const visibleRows = (kind) => Array.from(document.querySelectorAll('[data-fd-row][data-fd-kind="' + kind + '"]')).filter(el => el.getClientRects().length > 0);

    let g = null;    // 這一次按下的手勢：{ kind, id, rawId, pid, touchLike, sx, sy, x, y, phase, timer, row, swallow, ax, ay }
    let ui = null;   // 拖曳中的畫面元素與狀態

    /* ---------- 放開後瀏覽器還會送一次 click：長按、拖曳之後要吞掉，不然會同時打開編輯視窗 ---------- */
    const swallowNextClick = () => {
        let t = 0;
        const clear = () => { window.removeEventListener('click', h, true); clearTimeout(t); };
        const h = (e) => { e.stopPropagation(); e.preventDefault(); clear(); };
        window.addEventListener('click', h, true);
        t = setTimeout(clear, 400);
    };

    /* ---------- 找可捲動的外層（電腦版表格有自己的捲動框；手機卡片是整頁捲動） ---------- */
    const findScrollParent = (el) => {
        for (let p = el && el.parentElement; p && p !== document.body; p = p.parentElement) {
            const oy = getComputedStyle(p).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
        }
        return window;
    };

    // 浮層與指示線沿用該區塊的主色（收支綠、股票靛）：從原本那一列讀 CSS 變數
    const accentOf = (el) => { try { const cs = getComputedStyle(el); return typeof cs.getPropertyValue === 'function' ? cs.getPropertyValue('--fdm-accent').trim() : ''; } catch (e) { return ''; } };

    /* ---------- 浮動卡片堆 ---------- */
    const makeCard = (row) => {
        const card = document.createElement('div');
        card.className = 'fd-ghost-card';
        const ic = row.querySelector && row.querySelector('.fdm-ic, .fdd-ic');
        if (ic) { const c = ic.cloneNode(true); c.classList.remove('is-sel'); c.classList.add('fd-ghost-ic'); card.appendChild(c); }
        const t = document.createElement('div'); t.className = 'fd-ghost-t'; t.textContent = row.dataset.fdLabel || '';
        const a = document.createElement('div'); a.className = 'fd-ghost-a'; a.textContent = row.dataset.fdAmt || '';
        if (a.textContent.charAt(0) === '+') a.classList.add('is-in');   // 收入、賣出＝綠色
        card.appendChild(t); card.appendChild(a);
        return card;
    };
    const buildGhost = (srcRow, groupRows, n) => {   // 回傳 { ghost, badge }；badge 的數字會隨放開位置所在的日期變動（股票連動收支被排除時）
        const r = srcRow.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = 'fd-ghost'; ghost.setAttribute('aria-hidden', 'true');
        ghost.style.width = Math.min(r.width, 460) + 'px';
        const acc = accentOf(srcRow); if (acc) { ghost.style.setProperty('--fdm-accent', acc); }
        const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const others = groupRows.filter(el => el !== srcRow).slice(0, 12);
        const stackN = Math.min(STACK_MAX, Math.max(0, n - 1));
        // 墊底的卡片（先放，才會在下層）
        others.forEach((el, i) => {
            const card = makeCard(el);
            const keep = i < stackN;                                   // 前幾張留在堆疊裡，其餘飛過來就消失
            card.classList.add('fd-ghost-under');
            if (keep) card.style.zIndex = String(2 - i);
            const to = keep ? 'translate(' + (i + 1) * 6 + 'px,' + (i + 1) * 6 + 'px)' : 'translate(0,0)';
            const b = el.getBoundingClientRect();
            const from = 'translate(' + Math.round(b.left - r.left) + 'px,' + Math.round(b.top - r.top) + 'px)';
            card.style.transform = to;
            if (!keep) card.style.opacity = '0';
            ghost.appendChild(card);
            if (typeof card.animate === 'function') {                 // 整併動畫：原本散在各處的已選卡片，飛到手指下疊成一疊
                try { card.animate([{ transform: from, opacity: 0.95 }, { transform: to, opacity: keep ? 1 : 0 }], { duration: reduce ? 0 : 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }); } catch (e) { /* 不支援動畫就直接就定位 */ }
            }
        });
        // 即使勾選的卡片都不在畫面上（只選到畫面外的），堆疊也要有厚度
        for (let i = others.length; i < stackN; i++) {
            const card = makeCard(srcRow); card.classList.add('fd-ghost-under'); card.style.zIndex = String(2 - i);
            card.style.transform = 'translate(' + (i + 1) * 6 + 'px,' + (i + 1) * 6 + 'px)'; ghost.appendChild(card);
        }
        const top = makeCard(srcRow); top.classList.add('fd-ghost-top'); ghost.appendChild(top);
        let badge = null;
        if (n > 1) { badge = document.createElement('div'); badge.className = 'fd-ghost-badge'; badge.textContent = String(n); ghost.appendChild(badge); }
        document.body.appendChild(ghost);
        return { ghost, badge };
    };

    /* ---------- 拖曳過程 ---------- */
    const schedule = () => { if (ui && !ui.raf) ui.raf = requestAnimationFrame(tick); };
    const tick = () => {
        if (!ui) return;
        ui.raf = 0;
        if (!g || g.phase !== 'dragging') return;
        ui.ghost.style.transform = 'translate3d(' + (g.x - ui.gx) + 'px,' + (g.y - ui.gy) + 'px,0)';

        // 自動捲動：先捲表格自己的捲動框，捲不動再捲整頁。可捲範圍要避開固定在上方的分頁列／標題列、下方的批次操作列
        const nav = document.querySelector('.fd-top');   // V24：固定在上方的薄頂欄（自動捲動的上緣要避開它）
        const wTop = (nav ? nav.getBoundingClientRect().bottom : 0) + (ui.cards ? 52 : 0);
        const bar = document.querySelector('.fdm-bar');
        const wBottom = window.innerHeight - (bar && bar.offsetHeight ? bar.offsetHeight + 16 : 0);
        let dy = 0;
        if (ui.sp !== window) {
            const rc = ui.sp.getBoundingClientRect(), th = ui.sp.querySelector ? ui.sp.querySelector('thead') : null;
            dy = edgeScrollDelta(g.y, Math.max(rc.top + (th ? th.offsetHeight : 0), wTop), Math.min(rc.bottom, wBottom));
            if (dy) { const b = ui.sp.scrollTop; ui.sp.scrollTop += dy; if (ui.sp.scrollTop === b) dy = 0; }
        }
        if (!dy) {
            dy = edgeScrollDelta(g.y, wTop, wBottom);
            if (dy) { const b = window.scrollY; window.scrollBy(0, dy); if (window.scrollY === b) dy = 0; }
        }

        const rects = compute();
        if (rects.length) {
            const slot = ui.slot;
            const at = slot < rects.length ? rects[slot] : rects[rects.length - 1];
            const y = slot < rects.length ? at.top : at.bottom;
            ui.line.style.width = at.width + 'px';
            ui.line.style.transform = 'translate3d(' + at.left + 'px,' + (y - 1.5) + 'px,0)';
            ui.line.style.display = 'block';
            ui.line.classList.toggle('is-noop', !ui.cross && isNoopSlot(ui.viewIds, ui.gids, slot));
        }
        if (dy) schedule();   // 還在邊緣捲動中：不用等手指動，下一格繼續
    };

    // 依目前游標位置算出：放進哪一天（ui.day）、插入位置（ui.slot）、實際會搬的紀錄（ui.gids）。tick 與 drop 共用，放開時一定用最新位置
    const compute = () => {
        const rows = visibleRows(ui.kind);
        const rects = rows.map(el => el.getBoundingClientRect());
        const dates = rows.map(el => ui.dateById[el.dataset.fdId]);
        // V23：游標所在的那一列決定放進哪一天；插入位置再夾在那一天的範圍內（依各列垂直中心判斷）
        const day = rects.length ? dayAtY(rects, dates, g.y) : ui.day;
        ui.day = day;
        ui.slot = clampSlotToDay(dates, slotFromY(rects.map(b => b.top + b.height / 2), g.y), day);
        ui.rowIds = rows.map(el => el.dataset.fdId);
        // 股票連動的收支不能單獨改日期：與目標日期不同天的留在原處，不跟著搬
        const gids = ui.allIds.filter(id => !isLinkedOtherDay(ui.byId.get(id), day));
        if (gids.length !== ui.gids.length || gids.some((id, i) => id !== ui.gids[i])) {
            ui.gids = gids; dragIds.value = gids;
            if (ui.badge) { ui.badge.textContent = String(gids.length); ui.badge.style.display = gids.length > 1 ? '' : 'none'; }
        }
        ui.locked = ui.allIds.length - gids.length;
        ui.cross = gids.some(id => ui.dateById[id] !== day);
        return rects;
    };

    const teardown = () => {
        if (ui) {
            if (ui.raf) cancelAnimationFrame(ui.raf);
            if (ui.ghost && ui.ghost.remove) ui.ghost.remove();
            if (ui.line && ui.line.remove) ui.line.remove();
            ui = null;
        }
        if (document.body && document.body.classList) document.body.classList.remove('fd-dragging');
        dragKind.value = ''; dragIds.value = [];
    };

    const startDrag = () => {
        const view = viewOf(g.kind);
        const viewIds = view.map(x => String(x.id));
        if (!viewIds.includes(g.id)) { endGesture(false); return; }   // 這筆已經不在清單裡（例如剛好被同步更新）
        const dragged = view.find(x => String(x.id) === g.id);
        const day = String((dragged && dragged.date) || '');   // 起始值；拖動時由游標位置重新決定
        const dateById = {}; view.forEach(x => { dateById[String(x.id)] = String(x.date || ''); });
        const byId = new Map(view.map(x => [String(x.id), x]));
        const allIds = groupIdsFor(g.id, selRef(g.kind).value, viewIds);
        const gids = allIds.slice();
        const rows = visibleRows(g.kind);
        const srcRow = rows.find(el => el.dataset.fdId === g.id) || g.row;
        const gidSet = new Set(gids);
        const groupRows = rows.filter(el => gidSet.has(el.dataset.fdId));
        const r = srcRow.getBoundingClientRect();
        const line = document.createElement('div'); line.className = 'fd-drop-line'; line.style.display = 'none'; line.setAttribute('aria-hidden', 'true');
        { const acc = accentOf(srcRow); if (acc) line.style.setProperty('--fdm-accent', acc); }
        document.body.appendChild(line);
        g.phase = 'dragging'; g.swallow = true;
        ui = {
            kind: g.kind, allIds, byId, gids, viewIds, day, dateById, cross: false, locked: 0, line, raf: 0, slot: 0, rowIds: [], badge: null,
            gx: Math.max(0, Math.min(g.x - r.left, 460)), gy: Math.max(0, g.y - r.top),
            sp: findScrollParent(srcRow), cards: !!(srcRow.classList && srcRow.classList.contains('fdm-item')),
            ghost: null
        };
        { const built = buildGhost(srcRow, groupRows, gids.length); ui.ghost = built.ghost; ui.badge = built.badge; }
        document.body.classList.add('fd-dragging');
        dragKind.value = g.kind; dragIds.value = gids;
        try { if (g.row && g.row.setPointerCapture) g.row.setPointerCapture(g.pid); } catch (e) { /* 拖出視窗外追不到指標也沒關係 */ }
        schedule();
    };

    const drop = () => {
        if (!ui) return;
        compute();   // 用放開當下的位置再算一次（不用等下一個動畫格）
        const { kind, gids, slot, rowIds, day, locked } = ui;
        const view = viewOf(kind);
        // 放在第 slot 列之前；放到畫面最後一列之後時，接在「畫面還沒載入的下一筆」之前（沒有就是清單最後）
        let beforeId = null;
        if (slot < rowIds.length) beforeId = rowIds[slot];
        else { const nxt = view[rowIds.length]; beforeId = nxt ? String(nxt.id) : null; }
        const f = fullRef(kind);
        const res = moveToDay(f.value, view, gids, beforeId, day);
        teardown();
        if (res.list !== f.value) {
            const n = res.dateChanged.length;
            if (n) captureUndo();   // 有改日期才需要「復原」
            f.value = res.list;
            if (kind === 'stock' && n) expenses.value = retargetLinked(expenses.value, res.dateChanged, day);   // 股票交易改日期，連動的收支跟著改
            pushToCloud(); nextTick(() => renderCharts());
            if (n) armUndo(`已將 ${n} 筆改為 ${parseInt(day.slice(5, 7), 10)}/${parseInt(day.slice(8, 10), 10)}` + (locked ? `（${locked} 筆股票連動收支維持原日期）` : ''));
        }
    };

    /* ---------- 手勢 ---------- */
    const arm = () => {
        if (!g) return;
        g.timer = null; g.phase = 'armed'; g.swallow = true; g.ax = g.x; g.ay = g.y;
        if (!selRef(g.kind).value.map(String).includes(g.id)) fdmToggleSel(g.kind, g.rawId);   // 已選取的不再切換（否則會被取消）
        if (typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* 不支援震動就算了 */ } }
    };
    const onMove = (ev) => {
        if (!g || ev.pointerId !== g.pid) return;
        g.x = ev.clientX; g.y = ev.clientY;
        if (g.phase === 'pending') {
            if (g.touchLike) { if (movedBeyond(g.x - g.sx, g.y - g.sy, SCROLL_SLOP)) endGesture(false); }   // 長按前就移動＝在捲動
            else if (movedBeyond(g.x - g.sx, g.y - g.sy, DRAG_PX)) startDrag();
        } else if (g.phase === 'armed') {
            if (movedBeyond(g.x - g.ax, g.y - g.ay, DRAG_PX)) startDrag();
        } else if (g.phase === 'dragging') schedule();
    };
    const onUp = (ev) => {
        if (!g || ev.pointerId !== g.pid) return;
        if (g.phase === 'dragging') drop();
        endGesture(g.swallow);
    };
    const onCancel = (ev) => {
        if (!g || (ev && ev.pointerId !== undefined && ev.pointerId !== g.pid)) return;   // blur 事件沒有 pointerId
        teardown();            // 瀏覽器接手捲動、來電、切換視窗等：取消，不搬動
        endGesture(g.swallow);
    };
    const onKey = (ev) => {
        if (!g || ev.key !== 'Escape' || (g.phase !== 'dragging' && g.phase !== 'armed')) return;
        ev.preventDefault(); ev.stopPropagation();   // 不要讓同一個 Esc 又去關別的視窗
        teardown(); g.phase = 'cancelled'; g.swallow = true;   // 手指／滑鼠還按著：等放開再收尾
    };
    const onTouchMove = (ev) => { if (g && (g.phase === 'armed' || g.phase === 'dragging') && ev.cancelable) ev.preventDefault(); };   // 長按後不要讓頁面跟著捲

    const endGesture = (swallow) => {
        if (!g) return;
        clearTimeout(g.timer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('blur', onCancel);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('touchmove', onTouchMove);
        if (ui) teardown();
        try { if (g.row && g.row.releasePointerCapture && g.phase !== 'pending') g.row.releasePointerCapture(g.pid); } catch (e) { /* 已經釋放了 */ }
        g = null;
        if (swallow) swallowNextClick();
    };

    // 範本：@pointerdown="rowDown('expense', item.id, $event)"
    const rowDown = (kind, id, ev) => {
        if (g) return;
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        if (ev.target && ev.target.closest && ev.target.closest('button, a, input, select, textarea, label')) return;   // 列裡的按鈕（圓圈、刪除）自己處理
        const touchLike = ev.pointerType !== 'mouse';
        g = { kind, id: String(id), rawId: id, pid: ev.pointerId, touchLike, sx: ev.clientX, sy: ev.clientY, x: ev.clientX, y: ev.clientY, phase: 'pending', timer: null, row: ev.currentTarget, swallow: false, ax: 0, ay: 0 };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('blur', onCancel);
        window.addEventListener('keydown', onKey, true);
        if (touchLike) {
            window.addEventListener('touchmove', onTouchMove, { passive: false });
            g.timer = setTimeout(arm, LONG_MS);
        }
    };

    return { rowDown, isDragSrc };
};
