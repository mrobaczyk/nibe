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
        const result = [];
        result.push(mapped[0]);

        for (let i = 1; i < mapped.length; i++) {
            const current = mapped[i];
            const previous = mapped[i - 1];
            if (current.y !== previous.y) {
                if (isStepped) result.push({ x: current.x, y: previous.y });
                result.push(current);
            }
        }
        const lastPoint = mapped[mapped.length - 1];
        result.push({ x: lastPoint.x, y: lastPoint.y });
        return result;
    }

    draw(id, title, datasets, options = {}) {
        const { showZero = false, yMin = null, yMax = null, hrs = 6, isStepped = true } = options;
        
        if (this.charts[id]) this.charts[id].destroy();

        let timeUnit = 'minute';
        let displayFormat = 'HH:mm';
        let tickLimitX = 6;

        if (hrs <= 1) {
            timeUnit = 'minute'; tickLimitX = 7; 
        } else if (hrs <= 12) {
            timeUnit = 'hour'; tickLimitX = 7;
        } else if (hrs <= 24) {
            timeUnit = 'hour'; tickLimitX = 6;
        } else {
            timeUnit = 'day'; displayFormat = 'dd.MM'; tickLimitX = 8;
        }

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
                    pointRadius: hrs > 48 ? 0 : 2, 
                    tension: isStepped ? 0 : 0.3,
                    stepped: isStepped,
                    borderWidth: 2,
                    spanGaps: true,
                    fill: false 
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 40, top: 10, left: 5, bottom: -10 } }, // Zwiększony top, by label nie uciekał
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
                    datalabels: {
                        align: 'right', anchor: 'end', offset: 5,
                        color: (ctx) => ctx.dataset.borderColor,
                        font: { size: 12, weight: 'bold' },
                        formatter: (v, ctx) => ctx.dataIndex === ctx.dataset.data.length - 1 ? v.y : null
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
                        ticks: { 
                            color: '#64748b', 
                            font: { size: 11 },
                            padding: 4,
                            precision: 0,
                            // Dynamiczny krok: dla dużych zakresów (GM) automat, dla małych (Krzywa) co 5
                            stepSize: (yMax - yMin <= 30 && yMax !== null) ? 5 : undefined
                        },
                        // KLUCZOWA ZMIANA: sugerowane limity zamiast sztywnych
                        min: yMin,
                        max: yMax,
                        suggestedMin: showZero ? -150 : undefined,
                        suggestedMax: showZero ? 100 : undefined
                    }
                }
            }
        });
    }
}