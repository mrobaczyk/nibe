export class ChartManager {
    constructor() {
        this.charts = {};
        Chart.register(ChartDataLabels);
    }

    mapData(filtered, key) {
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
                result.push({ x: current.x, y: previous.y });
                result.push(current);
            } else if (i === mapped.length - 1) {
                result.push(current);
            }
        }

        return result.filter((pt, i, arr) => {
            if (i === 0 || i === arr.length - 1) return true;
            return !(pt.y === arr[i-1].y && pt.y === arr[i+1].y);
        });
    }

    draw(id, title, datasets, options = {}) {
        const { showZero = false, yMin = null, yMax = null, hrs = 6, isStepped = true } = options;
        
        if (this.charts[id]) this.charts[id].destroy();

        let timeUnit = 'hour';
        let stepSize = 1;
        if (hrs <= 1) {
            timeUnit = 'minute';
            stepSize = 10;
        } else if (hrs <= 6) {
            timeUnit = 'hour';
            stepSize = 1;
        } else if (hrs > 24) {
            timeUnit = 'day';
            stepSize = 1;
        }

        const ctx = document.getElementById(id);
        this.charts[id] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets.map(s => ({
                    label: s.l,
                    data: s.d,
                    borderColor: s.c,
                    backgroundColor: s.c,        // Wypełnienie kropek tym samym kolorem co linia
                    pointBackgroundColor: s.c,   // Pełne kropki
                    pointRadius: hrs > 48 ? 0 : 2, // Mniejsze kropki (z 3 na 2)
                    pointHoverRadius: 4,
                    tension: isStepped ? 0 : 0.3,
                    stepped: isStepped,
                    borderWidth: 2,
                    spanGaps: true,
                    fill: s.fill ? { target: 'origin', above: s.c + '22' } : false
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
                            usePointStyle: true, // Aktywuje użycie stylu punktu/linii
                            pointStyle: 'line',  // Zamienia kwadraty na odcinki
                            boxWidth: 20,        // Długość odcinka w legendzie
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
                            stepSize: stepSize,
                            displayFormats: { minute: 'HH:mm', hour: 'HH:mm', day: 'dd.MM' }
                        },
                        ticks: { color: '#64748b', font: { size: 10 }, autoSkip: true }, 
                        grid: { display: true, color: '#1e293b' } 
                    },
                    y: { 
                        grid: { color: '#1e293b' },
                        ticks: { color: '#64748b', font: { size: 11 }, padding: 8 },
                        min: yMin !== null ? yMin : undefined,
                        max: yMax !== null ? yMax : undefined,
                        suggestedMin: showZero ? -150 : undefined
                    }
                }
            }
        });
    }
}