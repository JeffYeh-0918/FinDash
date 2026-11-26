// FinDash 邏輯：左滑刪除（純函式，不碰畫面；手勢與動畫在 js/features/card-drag.js）
export const SWIPE_SLOP = 10;        // 手指移動超過這個距離，才判斷是捲動還是滑動
export const SWIPE_RATIO = 0.4;      // 滑過卡片寬度的 40% 才算數（避免誤觸）
export const SWIPE_DAMP = 0.6;       // 過線之後的阻尼：手指再移 1px，卡片只多走 0.6px

// 手指從按下到現在的位移（dx 往左為負）→ 'none'＝還沒動夠、'swipe'＝往左橫滑、'scroll'＝其他（直向捲動、往右）
export const swipeIntent = (dx, dy, slop = SWIPE_SLOP) => {
    if (Math.hypot(dx, dy) <= slop) return 'none';
    if (dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.5) return 'swipe';
    return 'scroll';
};
export const swipeThreshold = (width, ratio = SWIPE_RATIO) => Math.max(1, width) * ratio;
// 手指有效往左的距離（扣掉判斷用的 slop，卡片才不會一開始就跳 10px）
const pulled = (dx, slop = SWIPE_SLOP) => Math.max(0, -dx - slop);
export const swipeReached = (dx, width) => pulled(dx) >= swipeThreshold(width);
// 卡片實際往左移的距離（過線後加阻尼，最多不超過卡片寬度）
export const swipeOffset = (dx, width) => {
    const raw = pulled(dx), t = swipeThreshold(width);
    const off = raw <= t ? raw : t + (raw - t) * SWIPE_DAMP;
    return Math.min(off, Math.max(1, width));
};
