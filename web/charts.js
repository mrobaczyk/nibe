import { CONFIG } from './config.js';
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

    _mapDatasetData(ds, rawData, extraParams = {}) {
        // 1. Jeśli to strefa (np. Praca CO), używamy specjalnie przygotowanych stref
        if (ds.isZone && extraParams.zones) {
            return extraParams.zones.map(z => ({ x: z.x, y: z[ds.isZone] }));
        }

        // 2. Jeśli dane są podane "z ręki"
        if (ds.manualData) {
            return ds.manualData;
        }

        // 3. Nowa logika z forEach - pozwala na wstrzykiwanie punktów NULL
        const finalData = [];
        const MAX_GAP_MS = 8 * 60 * 1000;

        rawData.forEach((item, index) => {
            const dateStr = item.date || item.timestamp;
            if (!dateStr) return;

            const x = item.timestamp
                ? new Date(item.timestamp + " UTC").getTime()
                : new Date(item.date).getTime();

            if (index > 0 && ds.t !== 'bar') {
                const prevItem = rawData[index - 1];
                const prevX = prevItem.timestamp
                    ? new Date(prevItem.timestamp + " UTC").getTime()
                    : new Date(prevItem.date).getTime();

                if (x - prevX > MAX_GAP_MS) {
                    finalData.push({ x: prevX + 1, y: null });
                }
            }

            let y = 0;
            if (typeof ds.d === 'function') {
                y = ds.d(key => Number(item[key] || 0));
            } else if (typeof ds.k === 'function') {
                y = ds.k(item);
            } else {
                y = Number(item[ds.k] || 0);
            }

            finalData.push({ x, y });
        });

        return finalData;
    }

    draw(id, title, datasets, extraOptions = {}) {
        // 1. Destrukturyzacja opcji - tutaj rozwiązujemy błąd "could not find name min/max"
        const {
            showZero = false,
            yMin = null,
            yMax = null,
            hrs = 6,
            unit = null,
            stacked = false,
            rawData = [],
            zones = [],
            min = null, // Sztywny start osi X
            max = null  // Sztywny koniec osi X
        } = extraOptions;

        const ctxEl = document.getElementById(id);
        if (!ctxEl) return;
        if (this.charts[id]) this.charts[id].destroy();

        const isBar = extraOptions.type === 'bar';
        const { timeUnit, tickLimitX } = this._getTimeConfig(isBar, unit, hrs);
        const { finalMin, finalMax } = this._getLimits(id, yMin, yMax, showZero);

        // 2. Przetwarzamy dataset-y (mapowanie danych i stylów)
        const processedDatasets = this._prepareDatasets(datasets, rawData, extraOptions, isBar, hrs, unit);

        // 3. Inicjalizacja instancji Chart.js
        this.charts[id] = new Chart(ctxEl, {
            type: extraOptions.type || 'line',
            data: { datasets: processedDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 5, top: 5, left: -5, bottom: -5 } },
                interaction: { mode: 'index', axis: 'x', intersect: false },
                intersect: false,
                events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'touchend'],
                onHover: (event, elements, chart) => this._handleHover(event, elements, chart),
                plugins: this._getPluginsConfig(title, isBar),
                scales: {
                    // Przekazujemy min/max do skali czasu
                    x: this._getXScale(isBar, timeUnit, tickLimitX, stacked, min, max),
                    y: this._getYScale(id, stacked, finalMin, finalMax, showZero, isBar),
                    // Ukryta skala dla stref (0-1)
                    'y-work': {
                        display: false,
                        min: 0,
                        max: 1,
                        position: 'right',
                        grid: { display: false }
                    },
                    'y-temp': this._getYTempScale(datasets)
                }
            }
        });
    }

    _getXScale(isBar, timeUnit, tickLimitX, stacked, min, max) {
        return {
            type: 'time',
            min: min,
            max: max,
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
            grace: (id === 'c-cwu-mode' || id === 'c-stats' ? '0%' : '5%'),
            grid: {
                color: (context) => {
                    if (id === 'c-gm' && context.tick?.value === 0) return 'rgba(248, 113, 113, 0.9)';
                    return 'rgba(30, 41, 59, 0.4)';
                },
                lineWidth: 1,
                drawOnChartArea: true
            },
            suggestedMin: isBar ? 0 : undefined,
            min: finalMin,
            max: finalMax,
            ticks: {
                color: (context) => (id === 'c-gm' && context.tick?.value === 0) ? '#f87171' : '#64748b',
                font: { size: 10 },
                padding: 8,
                stepSize: (id === 'c-cwu-mode' || id === 'c-stats') ? 1 : undefined,
                autoSkip: false,
                maxTicksLimit: 8,
                callback: function (value) {
                    if (id === 'c-cwu-mode') {
                        const modes = { 0: 'Oszcz.', 1: 'Norm.', 2: 'Luks.' };
                        return modes[value] || null;
                    }
                    if (value % 1 === 0) return value;
                    return value.toFixed(1);
                }
            }
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

    _getPluginsConfig(title, isBar) {
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
            tooltip: this._getTooltipConfig(),
            datalabels: this._getDatalabelsConfig(isBar),
        };
    }

    _getDatalabelsConfig(isBar) {
        return {
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
    }

    _getTooltipConfig() {
        return {
            enabled: true,
            position: 'nearest',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#94a3b8',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,

            // Stylowanie ikony koloru
            usePointStyle: true,      // Zmienia kwadrat na PointStyle (domyślnie kółko)
            boxWidth: 8,              // Rozmiar kółka
            boxHeight: 8,             // Rozmiar kółka
            boxPadding: 4,            // Odstęp między kółkiem a tekstem etykiety

            filter: function (tooltipItem) {
                return tooltipItem.raw.y !== null;
            },
            callbacks: {
                title: (items) => Utils.formatDate(items[0].parsed.x),
                label: (context) => {
                    if (context.dataset.yAxisID === 'y-work') return null;

                    const label = context.dataset.label || '';
                    const value = context.parsed.y;

                    // Pobieramy tylko precyzję (domyślnie 1)
                    const precision = (context.dataset.p !== undefined) ? context.dataset.p : 1;
                    const formattedValue = value !== null ? value.toFixed(precision) : '0';

                    return `${label}: ${formattedValue}`;
                }
            }
        };
    }

    _prepareDatasets(datasets, rawData, extraOptions, isBar, hrs, unit) {
        return datasets.map(s => {
            const data = this._mapDatasetData(s, rawData, extraOptions);

            const isBarType = s.t === 'bar' || isBar;
            const isZone = !!s.isZone;
            const isWorkAxis = s.yAxisID === 'y-work';
            const hidePoints = isWorkAxis || hrs >= 6 || !!unit;

            return {
                label: s.l,
                data: data,
                p: s.p,
                type: s.t || undefined,
                yAxisID: s.yAxisID || 'y',
                hidden: !!s.h,

                borderColor: s.c,
                backgroundColor: this._resolveBgColor(s, isBar),
                borderWidth: (isZone || isWorkAxis) ? 0 : CONFIG.UI.BORDER_WIDTH,

                tension: (isZone || s.s === false) ? 0 : CONFIG.UI.LINE_TENSION,

                pointRadius: hidePoints ? 0 : CONFIG.UI.POINT_RADIUS,
                pointHoverRadius: isWorkAxis ? 0 : 5,
                pointBackgroundColor: s.c,

                spanGaps: isBarType,
                stepped: isZone ? 'after' : (isBarType ? false : (s.s !== false)),
                fill: isZone ? 'origin' : false,
                clip: false,
                barPercentage: isWorkAxis ? 1 : undefined,
                categoryPercentage: isWorkAxis ? 1 : undefined,
                fill: s.isZone ? 'origin' : false
            };
        });
    }

    _resolveBgColor(s, isBarGlobal) {
        // Jeśli to strefa (tło pod wykresem)
        if (s.isZone) {
            // Jeśli kolor w configu jest już w rgba, zostawiamy. 
            // Jeśli jest w hex (np. #ff0000), dodajemy przezroczystość z UI.
            return s.c.startsWith('#') ? s.c + CONFIG.UI.ALPHA_ZONE : s.c;
        }

        // Jeśli to słupek (np. COP, Starty)
        if (s.t === 'bar' || isBarGlobal) {
            return s.c.startsWith('#') ? s.c + CONFIG.UI.ALPHA_BAR : s.c;
        }

        return 'transparent';
    }

    syncCharts(timestamp) {
        Object.values(this.charts).forEach(chart => {
            const prevTimestamp = chart.activeTimestamp;

            if (!timestamp) {
                chart.activeTimestamp = null;
                chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            } else {
                chart.activeTimestamp = timestamp;
                // Szukamy indeksu w danych - używamy x, który jest u nas timestampem (ms)
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

            if (prevTimestamp !== chart.activeTimestamp) {
                chart.render();
            }
        });
    }

    _handleHover(event, elements, chart) {
        // Blokada scrolla na dotyku podczas interakcji z wykresem
        if (event.native && event.type.startsWith('touch')) {
            event.native.preventDefault();
        }

        // Obsługa wyjścia kursora/palca
        if (event.type === 'mouseout' || event.type === 'touchend') {
            this.syncCharts(null);
            return;
        }

        // Synchronizacja po znalezieniu punktu
        if (elements && elements.length > 0) {
            const dataIndex = elements[0].index;
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

    _getLimits(id, yMin, yMax, showZero) {
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

        if (finalMin === null && showZero) {
            finalMin = 0;
        }

        return { finalMin, finalMax };
    }
}