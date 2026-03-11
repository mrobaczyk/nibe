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

    mapData(filtered, keyOrFn) {
        return filtered.map(d => ({
            x: new Date(d.timestamp + " UTC").setSeconds(0, 0),
            y: typeof keyOrFn === 'function' ? keyOrFn(d) : d[keyOrFn]
        }));
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

        if (id === 'c-curve') { finalMin = -10; finalMax = 15; }
        else if (id === 'c-cwu-mode') { finalMin = 0; finalMax = 2; }
        else if (id === 'c-gm') { finalMax = 100; }

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
                    backgroundColor: s.t === 'bar' ? s.c : (isBar ? s.c + '80' : s.c),
                    pointBackgroundColor: s.c,
                    pointRadius: (s.yAxisID === 'y-work' || hrs >= 6 || unit) ? 0 : 2,
                    pointHoverRadius: s.yAxisID === 'y-work' ? 0 : 5,
                    tension: s.s === false ? 0.1 : 0,
                    stepped: isBar ? false : (s.s !== false),
                    borderWidth: s.yAxisID === 'y-work' ? 0 : 2,
                    spanGaps: true,
                    clip: false,
                    hidden: s.h || false,
                    type: s.t || undefined,
                    yAxisID: s.yAxisID || 'y',
                    barPercentage: s.yAxisID === 'y-work' ? 1 : undefined,
                    categoryPercentage: s.yAxisID === 'y-work' ? 1 : undefined
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
                            padding: 15,
                            filter: (item) => !['Praca CO', 'Ciepła Woda', 'Defrost'].includes(item.text)
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
                            title: (items) => Utils.formatDate(items[0].parsed.x),
                            label: (context) => {
                                if (context.dataset.yAxisID === 'y-work') return null;
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            }
                        }
                    },
                    datalabels: {
                        display: (ctx) => {
                            // Włączamy etykiety TYLKO dla wykresów słupkowych (analityka)
                            // i TYLKO jeśli wartość jest większa od 0
                            const isBar = ctx.dataset.type === 'bar' || ctx.chart.config.type === 'bar';
                            const isWorkZone = ctx.dataset.yAxisID === 'y-work';

                            if (isBar && !isWorkZone) {
                                const val = ctx.dataset.data[ctx.dataIndex]?.y;
                                return val > 0;
                            }
                            return false; // Dla linii (Live View) zostawiamy wyłączone
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
                        stacked: stacked, // zostawiamy Twoje
                        time: {
                            unit: timeUnit, // pobiera z options
                            displayFormats: {
                                minute: 'HH:mm',
                                hour: 'HH:mm',
                                day: 'dd.MM',
                                month: 'MMM' // Tutaj masz MMM (np. MAR), możesz zmienić na 'MMM yyyy' jeśli wolisz
                            }
                        },
                        ticks: {
                            color: '#64748b',
                            font: { size: 10 },
                            source: timeUnit === 'month' ? 'data' : 'auto',
                            autoSkip: timeUnit !== 'month', // Nie pomijaj miesięcy!
                            maxTicksLimit: timeUnit === 'month' ? 12 : tickLimitX,
                            maxRotation: 0
                        },
                        grid: {
                            display: true,
                            color: 'rgba(30, 41, 59, 0.4)',
                            offset: false
                        },
                        offset: false
                    },
                    y: {
                        stacked: stacked,
                        grid: {
                            color: (context) => {
                                // Kolorujemy na czerwono tylko gdy id to c-gm i wartość to 0
                                if (id === 'c-gm' && context.tick?.value === 0) return 'rgba(248, 113, 113, 0.9)';
                                return 'rgba(30, 41, 59, 0.4)';
                            },
                            // Szerokość linii pozostaje standardowa (1)
                            lineWidth: 1,
                            drawOnChartArea: true
                        },
                        min: finalMin,
                        max: finalMax,
                        ticks: {
                            // Etykieta "0" na osi Y dla GM również na czerwono
                            color: (context) => (id === 'c-gm' && context.tick?.value === 0) ? '#f87171' : '#64748b',
                            font: { size: 10 },
                            padding: 8,
                            stepSize: (id === 'c-cwu-mode' || id === 'c-stats') ? 1 : undefined,
                            maxTicksLimit: 8,
                            callback: function (value) {
                                if (id === 'c-cwu-mode') {
                                    const modes = { 0: 'Oszczędny', 1: 'Normalny', 2: 'Luksusowy' };
                                    return modes[value] || null;
                                }
                                if (value % 1 === 0) return value;
                                return value.toFixed(1);
                            }
                        },
                        suggestedMin: (showZero || isBar) ? 0 : undefined
                    },
                    'y-work': {
                        display: false,
                        min: 0,
                        max: 1,
                        position: 'right',
                        grid: { display: false }
                    }
                }
            }
        });
    }
}