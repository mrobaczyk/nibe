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
                afterDraw: (chart) => {
                    if (chart.activeTimestamp) {
                        const x = chart.scales.x.getPixelForValue(chart.activeTimestamp);
                        const yAxis = chart.scales.y;
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.beginPath();
                        ctx.setLineDash([5, 5]);
                        ctx.moveTo(x, yAxis.top);
                        ctx.lineTo(x, yAxis.bottom);
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            });
        }
    }

    mapData(filtered, keyOrFn) {
        return filtered
            .map(d => {
                if (!d.timestamp) return null; // Pomiń puste dane
                return {
                    x: new Date(d.timestamp + " UTC").setSeconds(0, 0),
                    y: typeof keyOrFn === 'function' ? keyOrFn(d) : d[keyOrFn]
                };
            })
            .filter(d => d !== null); // Usuń ewentualne null-e
    }

    syncCharts(timestamp) {
        Object.values(this.charts).forEach(chart => {
            // Zapisz aktualny stan przed zmianą, żeby nie rysować bez potrzeby
            const prevTimestamp = chart.activeTimestamp;

            if (!timestamp) {
                chart.activeTimestamp = null;
                chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            } else {
                chart.activeTimestamp = timestamp;
                const index = chart.data.datasets[0].data.findIndex(d => d.x === timestamp);

                if (index !== -1) {
                    const meta = chart.getDatasetMeta(0);
                    if (meta.data[index]) {
                        chart.tooltip.setActiveElements([
                            { datasetIndex: 0, index: index }
                        ], {
                            x: meta.data[index].x,
                            y: meta.data[index].y
                        });
                    }
                }
            }

            // Rysuj tylko jeśli timestamp faktycznie się zmienił
            if (prevTimestamp !== chart.activeTimestamp) {
                chart.render(); // render() jest wydajniejszy niż draw() w animacjach
            }
        });
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

        const { timeUnit, tickLimitX } = this._getTimeConfig(isBar, unit, hrs);
        const { finalMin, finalMax } = this._getLimits(id, yMin, yMax);

        this.charts[id] = new Chart(ctxEl, {
            type: extraOptions.type || 'line',
            data: {
                datasets: this._prepareDatasets(datasets, isBar, hrs, unit)
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 5, top: 5, left: -5, bottom: -5 } },
                interaction: { mode: 'index', axis: 'x', intersect: false },
                events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'touchend'],
                onHover: (event, elements, chart) => this._handleHover(event, elements, chart),
                plugins: this._getPluginsConfig(title, isBar, hrs, unit),
                scales: {
                    x: this._getXScale(isBar, timeUnit, tickLimitX, stacked),
                    y: this._getYScale(id, stacked, finalMin, finalMax, showZero, isBar),
                    'y-work': { display: false, min: 0, max: 1, position: 'right', grid: { display: false } },
                    'y-temp': this._getYTempScale(datasets)
                }
            }
        });
    }

    _getXScale(isBar, timeUnit, tickLimitX, stacked) {
        return {
            type: 'time',
            stacked: stacked,
            time: {
                unit: timeUnit,
                displayFormats: {
                    minute: 'HH:mm',
                    hour: 'HH:mm',
                    day: 'dd.MM',
                    month: 'MMM'
                }
            },
            ticks: {
                color: '#64748b',
                font: { size: 10 },
                source: isBar ? 'data' : 'auto',
                autoSkip: timeUnit !== 'month',
                maxTicksLimit: tickLimitX,
                maxRotation: 0
            },
            grid: {
                display: true,
                color: 'rgba(30, 41, 59, 0.4)',
                offset: false
            },
            offset: isBar
        };
    }

    _getYScale(id, stacked, finalMin, finalMax, showZero, isBar) {
        return {
            stacked: stacked,
            grid: {
                color: (context) => {
                    if (id === 'c-gm' && context.tick?.value === 0) return 'rgba(248, 113, 113, 0.9)';
                    return 'rgba(30, 41, 59, 0.4)';
                },
                lineWidth: 1,
                drawOnChartArea: true
            },
            min: finalMin,
            max: finalMax,
            ticks: {
                color: (context) => (id === 'c-gm' && context.tick?.value === 0) ? '#f87171' : '#64748b',
                font: { size: 10 },
                padding: 8,
                stepSize: (id === 'c-cwu-mode' || id === 'c-stats') ? 1 : undefined,
                maxTicksLimit: 8,
                callback: function (value) {
                    if (id === 'c-cwu-mode') {
                        const modes = { 0: 'Oszcz.', 1: 'Norm.', 2: 'Luks.' };
                        return modes[value] || null;
                    }
                    if (value % 1 === 0) return value;
                    return value.toFixed(1);
                }
            },
            suggestedMin: (showZero || isBar) ? 0 : undefined
        };
    }

    _getYTempScale(datasets) {
        return {
            type: 'linear',
            display: datasets.some(s => s.yAxisID === 'y-temp'),
            position: 'right',
            title: {
                display: true,
                text: 'Temp. (°C)',
                color: '#94a3b8',
                font: { size: 10 }
            },
            ticks: {
                color: '#94a3b8',
                font: { size: 10 }
            },
            grid: {
                drawOnChartArea: false,
                display: false
            }
        };
    }

    _getPluginsConfig(title, isBar, hrs, unit) {
        return {
            verticalLine: {},
            title: {
                display: true,
                text: title.toUpperCase(),
                color: '#fff',
                font: { size: 13, weight: '700' },
                padding: { top: 0, bottom: 15 }
            },
            legend: {
                position: 'bottom',
                labels: {
                    color: '#94a3b8',
                    usePointStyle: true,
                    pointStyle: isBar ? 'rect' : 'line',
                    boxWidth: 12,
                    font: { size: 10 },
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
                    const isBarLabel = ctx.dataset.type === 'bar' || ctx.chart.config.type === 'bar';
                    const isWorkZone = ctx.dataset.yAxisID === 'y-work';
                    if (isBarLabel && !isWorkZone) {
                        const val = ctx.dataset.data[ctx.dataIndex]?.y;
                        return val > 0;
                    }
                    return false;
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
                    return isNaN(num) ? '' : (num % 1 === 0 ? num : num.toFixed(1));
                },
                clip: true
            }
        };
    }

    _prepareDatasets(datasets, isBar, hrs, unit) {
        return datasets.map(s => ({
            label: s.l,
            data: s.d,
            borderColor: s.c,
            backgroundColor: s.t === 'bar' ? s.c : (isBar ? s.c + '80' : s.c),
            pointBackgroundColor: s.c,
            pointRadius: (s.yAxisID === 'y-work' || hrs >= 6 || !!unit) ? 0 : 2,
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
        }));
    }

    _handleHover(event, elements, chart) {
        // Zapobiegaj przewijaniu strony, gdy użytkownik przesuwa palcem po wykresie
        if (event.native && event.type.startsWith('touch')) {
            event.native.preventDefault();
        }

        // Obsługa wyjścia / puszczenia ekranu
        if (event.type === 'mouseout' || event.type === 'touchend') {
            this.syncCharts(null);
            return;
        }

        // Szukanie punktu
        if (elements && elements.length > 0) {
            const dataIndex = elements[0].index;
            // Ważne: pobieramy x z danych pierwszego datasetu
            const timestamp = chart.data.datasets[0].data[dataIndex].x;

            if (chart.activeTimestamp !== timestamp) {
                this.syncCharts(timestamp);
            }
        }
    }

    _getTimeConfig(isBar, unit, hrs) {
        let timeUnit = unit;
        let tickLimitX = 6;

        if (isBar) {
            if (unit === 'month') {
                tickLimitX = 12;
                timeUnit = 'month';
            } else {
                tickLimitX = 14;
                timeUnit = 'day';
            }
        } else {
            if (!timeUnit) {
                if (hrs <= 1) { timeUnit = 'minute'; tickLimitX = 7; }
                else if (hrs <= 12) { timeUnit = 'hour'; tickLimitX = 7; }
                else if (hrs <= 24) { timeUnit = 'hour'; tickLimitX = 6; }
                else { timeUnit = 'day'; tickLimitX = 8; }
            } else {
                tickLimitX = 12;
            }
        }
        return { timeUnit, tickLimitX };
    }

    _getLimits(id, yMin, yMax) {
        let finalMin = yMin;
        let finalMax = yMax;

        if (id === 'c-curve') {
            finalMin = -10;
            finalMax = 15;
        } else if (id === 'c-cwu-mode') {
            finalMin = 0;
            finalMax = 2;
        } else if (id === 'c-gm') {
            finalMax = 100;
        }

        return { finalMin, finalMax };
    }
}