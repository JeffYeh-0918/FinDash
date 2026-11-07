// FinDash 功能模組：圖表（Chart.js）
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（其他模組提供的成員）。

export const useCharts = (ctx) => {
    // 取用「較晚建立」的模組成員（模組之間互相呼叫）：用到的當下才去 ctx 找
    const itemChartData = { get value() { return ctx.itemChartData.value; }, set value(v) { ctx.itemChartData.value = v; } };
    const catChartColor = (...args) => ctx.catChartColor(...args);
    const lightColor = (...args) => ctx.lightColor(...args);
    const openItemDetail = (...args) => ctx.openItemDetail(...args);
    const paymentChartData = { get value() { return ctx.paymentChartData.value; }, set value(v) { ctx.paymentChartData.value = v; } };
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
                const text = Math.round(total).toLocaleString();
                if (horizontal) { ctx.textAlign = 'left'; ctx.fillText(text, scales.x.getPixelForValue(total) + 6, bar.y); }
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
            const pay = paymentChartData.value;
            paymentChartInstance = new Chart(paymentCtx, {
                type: 'bar',
                data: { labels: pay.map(p => p[0]), datasets: [{ label: '支出 (NT$)', data: pay.map(p => p[1]), backgroundColor: 'rgba(99, 102, 241, 0.7)', borderRadius: 4 }] },
                options: {
                    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                    layout: { padding: { right: 64 } },
                    plugins: { legend: { display: false }, valueLabels: { display: true } },
                    scales: { x: valueAxisStyle(), y: categoryAxisStyle() }
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
