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

        // Dynamiczne jednostki czasu
        let timeUnit = unit;
        let displayFormat = 'HH:mm';
        let tickLimitX = 6;

        if (!timeUnit) {
            if (hrs <= 1) { timeUnit = 'minute'; tickLimitX = 7; }
            else if (hrs <= 12) { timeUnit = 'hour'; tickLimitX = 7; }
            else if (hrs <= 24) { timeUnit = 'hour'; tickLimitX = 6; }
            else { timeUnit = 'day'; displayFormat = 'dd.MM'; tickLimitX = 8; }
        } else {
            displayFormat = timeUnit === 'day' ? 'dd.MM' : 'MMM';
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
                interaction: {
                    mode: 'index',
                    axis: 'x',
                    intersect: false
                },
                plugins: {
                    verticalLine: {},
                    title: {
                        display: true,
                        text: title.toUpperCase(),
                        color: '#fff',
                        font: { size: 13, weight: '900' },
                        padding: { top: 5, bottom: 20 }
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
                                const d = new Date(items[0].parsed.x);
                                if (unit === 'month') return d.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
                                if (unit === 'day') return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
                                return d.toLocaleString('pl-PL');
                            }
                        }
                    },
                    datalabels: {
                        display: (ctx) => {
                            if (isBar) {
                                const val = ctx.dataset.data[ctx.dataIndex]?.y;
                                // Pokazujemy tylko jeśli wartość jest istotna wizualnie
                                return val !== undefined && val > 0.2;
                            }
                            // Dla trybu LIVE (linie) zostawiamy etykietę na końcu
                            return ctx.chart.isDatasetVisible(ctx.datasetIndex) && ctx.dataIndex === ctx.dataset.data.length - 1;
                        },
                        // Centrowanie wewnątrz słupka dla wszystkich barów
                        align: isBar ? 'center' : 'right',
                        anchor: isBar ? 'center' : 'end',

                        // Stylistyka tekstu
                        color: '#ffffff', // Biały tekst dla kontrastu wewnątrz słupka
                        font: {
                            size: 10,
                            weight: 'bold'
                        },
                        // Dodajemy lekkie tło/cień pod tekst, żeby był czytelny na jasnych kolorach
                        backgroundColor: (ctx) => isBar ? 'rgba(0,0,0,0.1)' : null,
                        borderRadius: 3,

                        formatter: (v) => {
                            let val = (v && typeof v === 'object') ? v.y : v;
                            if (val === null || val === undefined || val === 0) return '';

                            const num = Number(val);
                            if (isNaN(num)) return '';

                            // Zaokrąglanie: kWh do 1 miejsca, starty do całości
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
                        grace: isBar ? '20%' : '5%',
                        ticks: {
                            color: '#64748b',
                            font: { size: 10 },
                            padding: 8,
                            precision: isBar ? 0 : 1
                        },
                        min: yMin,
                        max: yMax,
                        suggestedMin: (showZero || isBar) ? 0 : undefined
                    }
                }
            }
        });
    }
}