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
        
        // Zawsze dodajemy pierwszy punkt
        result.push(mapped[0]);

        for (let i = 1; i < mapped.length; i++) {
            const current = mapped[i];
            const previous = mapped[i - 1];
            
            if (current.y !== previous.y) {
                if (isStepped) {
                    // Dla schodkowych: punkt "pomiędzy" buduje pionową ściankę
                    result.push({ x: current.x, y: previous.y });
                }
                result.push(current);
            }
        }
        
        // KLUCZOWE: Zawsze dodajemy ostatni punkt z aktualną wartością, 
        // żeby linia dociągnęła do prawej krawędzi wykresu
        const lastPoint = mapped[mapped.length - 1];
        result.push({ x: lastPoint.x, y: lastPoint.y });

        return result;
    }

    draw(id, title, datasets, options = {}) {
        const { showZero = false, yMin = null, yMax = null, hrs = 6, isStepped = true } = options;
        
        if (this.charts[id]) this.charts[id].destroy();

        let timeUnit = 'minute';
        let displayFormat = 'HH:mm';
        let tickLimit = 6;

        if (hrs <= 1) {
            timeUnit = 'minute';
            tickLimit = 6; 
        } else if (hrs <= 12) {
            timeUnit = 'hour';
            tickLimit = 7;
        } else if (hrs <= 24) {
            timeUnit = 'hour';
            tickLimit = 6;
        } else {
            timeUnit = 'day';
            displayFormat = 'dd.MM';
            tickLimit = 7;
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
                layout: { padding: { right: 55, top: 10, left: 10 } },
                plugins: {
                    title: {
                        display: true,
                        text: title.toUpperCase(),
                        color: '#fff',
                        align: 'center',
                        font: { size: 13, weight: 'bold' },
                        padding: 15
                    },
                    legend: {
                        position: 'bottom',
                        labels: { 
                            color: '#94a3b8', 
                            usePointStyle: true, 
                            pointStyle: 'line', 
                            boxWidth: 20,
                            font: { size: 11 } 
                        }
                    },
                    datalabels: {
                        align: 'right',
                        anchor: 'end',
                        offset: 8,
                        color: (ctx) => ctx.dataset.borderColor,
                        font: { size: 11, weight: 'bold' },
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
                        ticks: { 
                            color: '#64748b', 
                            font: { size: 10 },
                            maxTicksLimit: tickLimit,
                            autoSkip: true,
                            maxRotation: 0
                        }, 
                        grid: { display: true, color: '#1e293b' } 
                    },
                    y: { 
                        grid: { color: '#1e293b' },
                        ticks: { color: '#64748b', font: { size: 11 }, padding: 8 },
                        min: yMin !== null ? yMin : undefined,
                        max: yMax !== null ? yMax : undefined,
                        // sugerowane minimum dla GM, żeby -140 było widać
                        suggestedMin: showZero ? -150 : undefined 
                    }
                }
            }
        });
    }
}