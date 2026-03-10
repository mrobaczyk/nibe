import { Utils } from './utils.js';

export class ChartManager {
    constructor() {
        this.charts = {};
        if (typeof ChartDataLabels !== 'undefined') {
            Chart.register(ChartDataLabels);
        }

        if (!Chart.registry.plugins.get('verticalLine')) {
            Chart.register({
                id: 'verticalLine',
                beforeDraw: (chart) => {
                    if (chart.tooltip?._active?.length) {
                        const x = chart.tooltip._active[0].element.x;
                        const yAxis = chart.scales.y;
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.beginPath();
                        ctx.setLineDash([5, 5]);
                        ctx.moveTo(x, yAxis.top);
                        ctx.lineTo(x, yAxis.bottom);
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            });
        }
    }

    mapData(filtered, keyOrFn, isStepped = true) {
        const mapped = filtered.map(d => ({
            x: new Date(d.timestamp + " UTC"),
            y: typeof keyOrFn === 'function' ? keyOrFn(d) : d[keyOrFn]
        }));
        if (mapped.length === 0) return [];
        const result = [mapped[0]];
        for (let i = 1; i < mapped.length; i++) {
            const current = mapped[i];
            const previous = mapped[i - 1];
            if (current.y !== previous.y) {
                if (isStepped) result.push({ x: current.x, y: previous.y });
                result.push(current);
            }
        }
        result.push({ x: mapped[mapped.length - 1].x, y: mapped[mapped.length - 1].y });
        return result;
    }

    draw(id, title, datasets, extraOptions = {}) {
        const {
            showZero = false,
            yMin = null,
            yMax = null,
            hrs = 6,
            unit = null,
            stacked = false
        } = extraOptions;

        const ctxEl = document.getElementById(id);
        if (!ctxEl) return;
        if (this.charts[id]) this.charts[id].destroy();

        const isBar = extraOptions.type === 'bar';

        let finalMin = yMin;
        let finalMax = yMax;

        if (id === 'c-curve') {
            finalMin = -10;
            finalMax = 15;
        }
        else if (id === 'c-cwu-mode') {
            finalMin = 0;
            finalMax = 2;
        }
        else if (id === 'c-gm') {
            finalMax = 150;
        }

        // Dynamiczne jednostki czasu osi X
        let timeUnit = unit;
        let tickLimitX = 6;
        if (!timeUnit) {
            if (hrs <= 1) { timeUnit = 'minute'; tickLimitX = 7; }
            else if (hrs <= 12) { timeUnit = 'hour'; tickLimitX = 7; }
            else if (hrs <= 24) { timeUnit = 'hour'; tickLimitX = 6; }
            else { timeUnit = 'day'; tickLimitX = 8; }
        } else {
            tickLimitX = 12;
        }

        this.charts[id] = new Chart(ctxEl, {
            type: extraOptions.type || 'line',
            data: {
                datasets: datasets.map(s => ({
                    label: s.l,
                    data: s.d,
                    borderColor: s.c,
                    backgroundColor: isBar ? s.c + '80' : s.c,
                    pointBackgroundColor: s.c,
                    pointRadius: (hrs >= 6 || unit) ? 0 : 2,
                    pointHoverRadius: 5,
                    tension: s.s === false ? 0.1 : 0,
                    stepped: isBar ? false : (s.s !== false),
                    borderWidth: 2,
                    spanGaps: true,
                    clip: false,
                    hidden: s.h || false
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 40, top: 5, left: 5, bottom: -5 } },
                interaction: { mode: 'index', axis: 'x', intersect: false },
                plugins: {
                    verticalLine: {},
                    title: {
                        display: true,
                        text: title.toUpperCase(),
                        color: '#fff',
                        font: { size: 13, weight: '700' },
                        padding: { top: 0, bottom: 10 }
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94a3b8',
                            usePointStyle: true,
                            pointStyle: isBar ? 'rect' : 'line',
                            boxWidth: 12,
                            font: { size: 10, weight: 'bold' },
                            padding: 15
                        }
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#94a3b8',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            title: (items) => {
                                return Utils.formatDate(items[0].parsed.x);
                            }
                        }
                    },
                    datalabels: {
                        display: (ctx) => {
                            if (isBar) {
                                const val = ctx.dataset.data[ctx.dataIndex]?.y;
                                return val !== undefined && val > 0.1;
                            }
                            return ctx.chart.isDatasetVisible(ctx.datasetIndex) && ctx.dataIndex === ctx.dataset.data.length - 1;
                        },
                        align: isBar ? 'center' : 'right',
                        anchor: isBar ? 'center' : 'end',
                        offset: isBar ? 0 : 10,
                        color: '#ffffff',
                        font: { size: 10, weight: 'bold' },
                        formatter: (v) => {
                            let val = (v && typeof v === 'object') ? v.y : v;
                            if (val === null || val === undefined || val === 0) return '';
                            const num = Number(val);
                            if (isNaN(num)) return '';
                            return num % 1 === 0 ? num : num.toFixed(1);
                        },
                        clip: true
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        stacked: stacked,
                        time: {
                            unit: timeUnit,
                            displayFormats: {
                                minute: 'HH:mm', hour: 'HH:mm', day: 'dd.MM', month: 'MMM'
                            }
                        },
                        ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: tickLimitX, autoSkip: true, maxRotation: 0 },
                        grid: { display: true, color: 'rgba(30, 41, 59, 0.4)' }
                    },
                    y: {
                        stacked: stacked,
                        grid: { color: 'rgba(30, 41, 59, 0.4)' },
                        min: finalMin,
                        max: finalMax,
                        ticks: {
                            color: '#64748b',
                            font: { size: 10 },
                            padding: 8,
                            stepSize: (id === 'c-cwu-mode' || id === 'c-stats') ? 1 : undefined,
                            maxTicksLimit: 8,
                            callback: function (value) {
                                if (id === 'c-cwu-mode') {
                                    const modes = {
                                        0: 'Oszczędny',
                                        1: 'Normalny',
                                        2: 'Luksusowy'
                                    };
                                    return modes[value] || null;
                                }

                                if (value % 1 === 0) return value;
                                return value.toFixed(1);
                            }
                        },
                        suggestedMin: (showZero || isBar) ? 0 : undefined
                    }
                }
            }
        });
    }
}