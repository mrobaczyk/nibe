export class ChartManager {
    constructor() {
        this.charts = {};
        Chart.register(ChartDataLabels);
    }

    mapData(filtered, key, onlyChanges = true) { // Zmienione na true domyślnie
    const mapped = filtered.map(d => ({ 
        x: new Date(d.timestamp + " UTC"), 
        y: d[key] 
    }));
    
    if (!onlyChanges) return mapped;
    
    return mapped.filter((pt, i) => {
        // Zawsze zostawiamy pierwszy i ostatni punkt dla ciągłości linii czasu
        if (i === 0 || i === mapped.length - 1) return true;
        // Zostawiamy punkt tylko jeśli wartość jest inna niż w poprzednim
        return pt.y !== mapped[i - 1].y;
    });
}

    draw(id, title, datasets, options = {}) {
        const { showZero = false, yMin = null, yMax = null, isStepped = false, hrs = 6 } = options;
        
        if (this.charts[id]) this.charts[id].destroy();
        
        const ctx = document.getElementById(id);
        this.charts[id] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets.map(s => ({
                    label: s.l,
                    data: s.d,
                    borderColor: s.c,
                    backgroundColor: s.c + (s.fill ? '22' : '00'),
                    pointRadius: hrs > 48 ? 0 : 3, // Kropki zostają dla krótkich okresów
                    tension: isStepped ? 0 : 0.3,
                    stepped: isStepped,
                    borderWidth: 2,
                    spanGaps: true,
                    fill: s.fill || false
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
                        align: 'center', // Wyśrodkowanie
                        font: { size: 13, weight: 'bold' },
                        padding: 15
                    },
                    legend: {
                        position: 'bottom',
                        labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } }
                    },
                    datalabels: {
                        align: 'right',
                        anchor: 'end',
                        offset: 8,
                        color: (ctx) => ctx.dataset.borderColor,
                        font: { size: 12, weight: 'bold' },
                        clip: false,
                        formatter: (v, ctx) => ctx.dataIndex === ctx.dataset.data.length - 1 ? v.y : null
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { 
                            unit: hrs <= 1 ? 'minute' : (hrs <= 24 ? 'hour' : 'day'),
                            displayFormats: { minute: 'HH:mm', hour: 'HH:mm', day: 'dd.MM' }
                        },
                        ticks: { color: '#64748b', maxTicksLimit: 10 },
                        grid: { display: false }
                    },
                    y: { 
                        grid: { color: '#1e293b' },
                        ticks: { color: '#64748b', padding: 8 },
                        min: yMin !== null ? yMin : undefined,
                        max: yMax !== null ? yMax : undefined,
                        suggestedMin: showZero ? -150 : undefined
                    }
                }
            }
        });
    }
}