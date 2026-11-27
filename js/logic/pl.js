// FinDash 純邏輯：損益的顏色／箭頭／正負號（台股慣例：紅漲綠跌；零或四捨五入後為零＝持平，不加箭頭與正負號）
const tone = (n) => { const r = Math.round(Number(n) || 0); return r > 0 ? 'gain' : r < 0 ? 'loss' : 'flat'; };
export const plClass = (n) => 'fd-' + tone(n);
export const plArrow = (n) => ({ gain: '▲', loss: '▼', flat: '' })[tone(n)];
export const plSign = (n) => (tone(n) === 'gain' ? '+' : '');
