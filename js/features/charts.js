// FinDash 功能模組：圖表（Chart.js）
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（其他模組提供的成員）。

export const useCharts = (ctx) => {
    // 取用「較晚建立」的模組成員（模組之間互相呼叫）：用到的當下才去 ctx 找
    const itemChartData = { get value() { return ctx.itemChartData.value; }, set value(v) { ctx.itemChartData.value = v; } };
    const catChartColor = (...args) => ctx.catChartColor(...args);
    const lightColor = (...args) => ctx.lightColor(...args);
    const openItemDetail = (...args) => ctx.openItemDetail(...args);
    const paymentChartData = { get value() { return ctx.paymentChartData.value; }, set value(v) { ctx.paymentChartData.value = v; } };
    const payChartMode = { get value() { return ctx.payChartMode.value; } };
    const payChartClip = { get value() { return ctx.payChartClip.value; } };
    const stockHoldings = { get value() { return ctx.stockHoldings.value; }, set value(v) { ctx.stockHoldings.value = v; } };

    let categoryChartInstance = null;
    let paymentChartInstance = null;
    let stockPLChartInstance = null;
    let stockAllocationChartInstance = null;
    // ---------- 圖表共用樣式：格線、刻度顏色、數值標籤（所有長條圖一致） ----------
    const CHART_GRID = 'rgba(148,163,184,0.1)';
    const valueAxisStyle = (extra = {}) => ({ beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: CHART_GRID }, ...extra });
    const categoryAxisStyle = (extra = {}) => ({ ticks: { color: '#e2e8f0' }, grid: { display: false }, ...extra });
    const valueLabelPlugin = {
        id: 'valueLabels',
        afterDatasetsDraw(chart, args, opts) {
            if (!opts || opts.display === false) return;
            const { ctx, scales } = chart;
            const horizontal = chart.options.indexAxis === 'y';
            ctx.save();
            ctx.font = '12px sans-serif';
            ctx.fillStyle = '#e2e8f0';
            ctx.textBaseline = 'middle';
            chart.data.labels.forEach((_, i) => {
                let total = 0, visible = false;
                chart.data.datasets.forEach((ds, di) => { if (chart.isDatasetVisible(di)) { total += Number(ds.data[i] || 0); visible = true; } });
                const bar = chart.getDatasetMeta(0).data[i];
                if (!visible || !bar || total === 0) return;
                // opts.totals：要顯示的實際總額（占比模式每條都是 100，但標籤仍要顯示金額）；長條超過刻度上限＝被截斷，標上斷線記號與「⫽」
                const real = opts.totals ? Number(opts.totals[i] || 0) : total;
                const clipped = horizontal && total > scales.x.max + 1e-6;   // 加一點容差：占比模式各段加總可能是 100.00000000000001
                const text = Math.round(real).toLocaleString() + (clipped ? ' ⫽' : '');
                if (horizontal && clipped) {
                    ctx.save(); ctx.strokeStyle = '#1b2336'; ctx.lineWidth = 5;
                    [-16, -8].forEach(dx => { ctx.beginPath(); ctx.moveTo(chart.chartArea.right + dx + 4, bar.y - bar.height / 2 - 2); ctx.lineTo(chart.chartArea.right + dx - 4, bar.y + bar.height / 2 + 2); ctx.stroke(); });
                    ctx.restore();
                }
                if (horizontal) { ctx.textAlign = 'left'; ctx.fillText(text, scales.x.getPixelForValue(Math.min(total, scales.x.max)) + 6, bar.y); }
                else { ctx.textAlign = 'center'; ctx.fillText(text, bar.x, scales.y.getPixelForValue(total) + (total >= 0 ? -10 : 12)); }
            });
            ctx.restore();
        }
    };
    const renderCharts = () => {
        const itemCtx = document.getElementById('itemChart')?.getContext('2d');
        if (itemCtx) {
            if (categoryChartInstance) categoryChartInstance.destroy();
            const items = itemChartData.value;
            const base = items.map(x => x.isOther ? '#64748b' : catChartColor(x.category));
            categoryChartInstance = new Chart(itemCtx, {
                type: 'bar',
                data: {
                    labels: items.map(x => x.item),
                    datasets: [
                        { label: '自己付', data: items.map(x => x.self), backgroundColor: base, borderRadius: 4 },
                        { label: '每月預付', data: items.map(x => x.prepaid), backgroundColor: base.map(c => lightColor(c)), borderColor: base, borderWidth: 1, borderRadius: 4 }
                    ]
                },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    layout: { padding: { right: 64 } },
                    plugins: {
                        legend: { display: false },
                        valueLabels: { display: true },
                        tooltip: { callbacks: { label: (c) => `${c.dataset.label}：NT$ ${Number(c.raw || 0).toLocaleString()}` } }
                    },
                    scales: { x: valueAxisStyle({ stacked: true }), y: categoryAxisStyle({ stacked: true }) },
                    onClick: (evt, els) => { if (els.length) openItemDetail(itemChartData.value[els[0].index]); },
                    onHover: (evt, els) => { if (evt.native && evt.native.target) evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; }
                },
                plugins: [valueLabelPlugin]
            });
        }

        const paymentCtx = document.getElementById('paymentChart')?.getContext('2d');
        if (paymentCtx) {
            if (paymentChartInstance) paymentChartInstance.destroy();
            const pay = paymentChartData.value;   // { categories, rows }：每個付款管道一條，條內依類別堆疊（顏色與項目圖的類別色一致）
            const share = payChartMode.value === 'share', clip = payChartClip.value;   // 占比：每條都當 100%；金額：有大額離群值時刻度上限截斷
            const totals = pay.rows.map(r => r.total);
            const rawOf = (c) => (c.dataset.raw ? c.dataset.raw[c.dataIndex] : c.raw);
            paymentChartInstance = new Chart(paymentCtx, {
                type: 'bar',
                data: {
                    labels: pay.rows.map(r => r.method),
                    datasets: pay.categories.map(cat => {
                        const raw = pay.rows.map(r => r.cats[cat] || 0);
                        return { label: cat, raw, data: share ? raw.map((v, i) => (totals[i] ? (v / totals[i]) * 100 : 0)) : raw, backgroundColor: catChartColor(cat), borderColor: 'rgba(15, 23, 42, 0.9)', borderWidth: 1, borderRadius: 3, clip: { right: 0, left: false, top: false, bottom: false } };   // 只在右側裁切：超過刻度上限的長條在圖框邊緣截斷
                    })
                },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    layout: { padding: { right: 72 } },
                    plugins: {
                        legend: { display: false },
                        valueLabels: { display: true, totals },
                        tooltip: {
                            filter: (c) => Number(rawOf(c) || 0) > 0,
                            callbacks: {
                                label: (c) => share ? `${c.dataset.label}：${Math.round(c.raw)}%（NT$ ${Number(rawOf(c) || 0).toLocaleString()}）` : `${c.dataset.label}：NT$ ${Number(c.raw || 0).toLocaleString()}`,
                                footer: (items) => items.length ? `合計：NT$ ${Math.round(totals[items[0].dataIndex] || 0).toLocaleString()}` : ''
                            }
                        }
                    },
                    scales: { x: valueAxisStyle({ stacked: true, ...(share ? { max: 100, ticks: { color: '#94a3b8', callback: (v) => v + '%' } } : (clip.max ? { max: clip.max } : {})) }), y: categoryAxisStyle({ stacked: true }) }
                },
                plugins: [valueLabelPlugin]
            });
        }

        const stockPLCtx = document.getElementById('stockPLChart')?.getContext('2d');
        if (stockPLCtx) {
            if (stockPLChartInstance) stockPLChartInstance.destroy();
            const holdings = stockHoldings.value;
            stockPLChartInstance = new Chart(stockPLCtx, {
                type: 'bar',
                data: {
                    labels: holdings.map(h => h.symbol),
                    datasets: [{ label: '未實現損益 (NT$)', data: holdings.map(h => h.unrealizedPL), backgroundColor: holdings.map(h => h.unrealizedPL >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(244, 63, 94, 0.7)'), borderRadius: 4 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    layout: { padding: { top: 18, bottom: 6 } },
                    plugins: { legend: { display: false }, valueLabels: { display: true } },
                    scales: { x: categoryAxisStyle(), y: valueAxisStyle({ beginAtZero: false }) }
                },
                plugins: [valueLabelPlugin]
            });
        }

        const stockAllocCtx = document.getElementById('stockAllocationChart')?.getContext('2d');
        if (stockAllocCtx) {
            if (stockAllocationChartInstance) stockAllocationChartInstance.destroy();
            const holdings = stockHoldings.value;
            stockAllocationChartInstance = new Chart(stockAllocCtx, {
                type: 'doughnut',
                data: {
                    labels: holdings.map(h => `${h.symbol} ${h.name}`),
                    datasets: [{ data: holdings.map(h => h.marketValue), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'], borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
            });
        }
    };

    return {
        renderCharts
    };
};
