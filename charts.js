export class ChartManager {
    constructor() {
        this.charts = {};
        Chart.register(ChartDataLabels);
    }

    mapData(filtered, key, isStepped = true) {
        const mapped = filtered.map(d => ({ 
            x: new Date(d.timestamp + " UTC"), 
            y: d[key] 
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

    draw(id, title, datasets, options = {}) {
        const { showZero = false, yMin = null, yMax = null, hrs = 6 } = options;
        
        if (this.charts[id]) this.charts[id].destroy();

        let timeUnit = 'minute';
        let displayFormat = 'HH:mm';
        let tickLimitX = 6;
        if (hrs <= 1) { timeUnit = 'minute'; tickLimitX = 7; }
        else if (hrs <= 12) { timeUnit = 'hour'; tickLimitX = 7; }
        else if (hrs <= 24) { timeUnit = 'hour'; tickLimitX = 6; }
        else { timeUnit = 'day'; displayFormat = 'dd.MM'; tickLimitX = 8; }

        const ctx = document.getElementById(id);
        this.charts[id] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets.map(s => ({
                    label: s.l,
                    data: s.d,
                    borderColor: s.c,
                    backgroundColor: s.c,
                    pointBackgroundColor: s.c,
                    // Dynamiczne kropki: ukryte dla >= 12h
                    pointRadius: hrs >= 12 ? 0 : 3, 
                    pointHoverRadius: 5,
                    // Parametr 's' z configu decyduje czy linia jest schodkowa
                    tension: s.s === false ? 0.3 : 0,
                    stepped: s.s !== false,
                    borderWidth: 2,
                    spanGaps: true,
                    clip: false,
                    hidden: s.h || false
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 40, top: 15, left: 5, bottom: -5 } },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    title: {
                        display: true,
                        text: title.toUpperCase(),
                        color: '#fff',
                        align: 'center',
                        font: { size: 14, weight: 'bold' },
                        padding: { top: 5, bottom: 8 }
                    },
                    legend: {
                        position: 'bottom',
                        labels: { 
                            color: '#94a3b8', 
                            usePointStyle: true, 
                            pointStyle: 'line', 
                            boxWidth: 15, 
                            font: { size: 11 }, 
                            padding: 15 
                        }
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#94a3b8',
                        titleFont: { size: 12 },
                        bodyFont: { size: 14, weight: 'bold' },
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: true,
                        callbacks: {
                            title: (items) => {
                                const date = new Date(items[0].parsed.x);
                                return date.toLocaleTimeString('pl-PL', { 
                                    hour: '2-digit', 
                                    minute: '2-digit', 
                                    hour12: false 
                                });
                            }
                        }
                    },
                    datalabels: {
                        align: 'right', anchor: 'end', offset: 5,
                        color: (ctx) => ctx.dataset.borderColor,
                        font: { size: 12, weight: 'bold' },
                        // Etykieta widoczna tylko jeśli linia nie jest ukryta
                        display: (ctx) => ctx.chart.isDatasetVisible(ctx.datasetIndex),
                        formatter: (v, ctx) => ctx.dataIndex === ctx.dataset.data.length - 1 ? v.y : null,
                        clip: false 
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { 
                            unit: timeUnit, 
                            displayFormats: { minute: displayFormat, hour: displayFormat, day: displayFormat } 
                        },
                        ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: tickLimitX, autoSkip: true, maxRotation: 0 }, 
                        grid: { display: true, color: '#1e293b' } 
                    },
                    y: { 
                        grid: { color: '#1e293b' },
                        grace: (yMax !== null && (yMax - yMin) <= 5) ? 0 : '5%', 
                        ticks: { 
                            color: '#64748b', 
                            font: { size: 11 }, 
                            padding: 8, 
                            precision: 0,
                            autoSkip: false, 
                            callback: (v) => Math.floor(v) === v ? v : null
                        },
                        min: yMin, 
                        max: yMax,
                        suggestedMin: (yMin === null && showZero) ? -150 : undefined,
                        suggestedMax: (yMax === null && showZero) ? 100 : undefined
                    }
                }
            }
        });
    }
}