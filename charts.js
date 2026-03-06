// Tablica przechowująca instancje wszystkich wykresów dla synchronizacji
const chartInstances = [];

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
        const { showZero = false, yMin = null, yMax = null, hrs = 6, isStepped = true } = options;
        
        if (this.charts[id]) {
            const idx = chartInstances.indexOf(this.charts[id]);
            if (idx > -1) chartInstances.splice(idx, 1);
            this.charts[id].destroy();
        }

        let timeUnit = 'minute';
        let displayFormat = 'HH:mm';
        let tickLimitX = 6;
        if (hrs <= 1) { timeUnit = 'minute'; tickLimitX = 7; }
        else if (hrs <= 12) { timeUnit = 'hour'; tickLimitX = 7; }
        else if (hrs <= 24) { timeUnit = 'hour'; tickLimitX = 6; }
        else { timeUnit = 'day'; displayFormat = 'dd.MM'; tickLimitX = 8; }

        const ctx = document.getElementById(id);
        const newChart = new Chart(ctx, {
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
                    clip: false 
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 40, top: 15, left: 5, bottom: -5 } },
                interaction: { mode: 'index', intersect: false },
                onHover: (event, activeElements, chart) => {
                    // SYNCHRONIZACJA TOOLTIPÓW
                    if (!activeElements.length) return;
                    const x = activeElements[0].element.x;
                    chartInstances.forEach(otherChart => {
                        if (otherChart !== chart) {
                            const xAxis = otherChart.scales.x;
                            const yAxis = otherChart.scales.y;
                            const mouseEvent = {
                                type: 'mousemove',
                                target: otherChart.canvas,
                                clientX: otherChart.canvas.getBoundingClientRect().left + x,
                                clientY: otherChart.canvas.getBoundingClientRect().top + (yAxis.bottom / 2),
                                native: true
                            };
                            otherChart.active = true;
                            otherChart.handleEvent(mouseEvent);
                        }
                    });
                },
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
                        labels: { color: '#94a3b8', usePointStyle: true, pointStyle: 'line', boxWidth: 15, font: { size: 11 }, padding: 15 }
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#94a3b8',
                        bodyFont: { size: 13, weight: 'bold' },
                        borderColor: '#1e293b',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: true,
                        callbacks: {
                            title: (items) => new Date(items[0].parsed.x).toLocaleTimeString('pl-PL', {hour: '2-digit', minute:'2-digit'})
                        }
                    },
                    datalabels: {
                        align: 'right', anchor: 'end', offset: 5,
                        color: (ctx) => ctx.dataset.borderColor,
                        font: { size: 12, weight: 'bold' },
                        formatter: (v, ctx) => ctx.dataIndex === ctx.dataset.data.length - 1 ? v.y : null,
                        clip: false 
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: timeUnit, displayFormats: { minute: displayFormat, hour: displayFormat, day: displayFormat } },
                        ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: tickLimitX, autoSkip: true, maxRotation: 0 }, 
                        grid: { display: true, color: '#1e293b' } 
                    },
                    y: { 
                        grid: { color: '#1e293b' },
                        grace: (yMax !== null && (yMax - yMin) <= 5) ? 0 : '5%', 
                        ticks: { 
                            color: '#64748b', font: { size: 11 }, padding: 8, precision: 0,
                            stepSize: (yMax !== null && (yMax - yMin) <= 5) ? 1 : undefined,
                            autoSkip: false, 
                            callback: (v) => Math.floor(v) === v ? v : null
                        },
                        min: yMin, max: yMax,
                        suggestedMin: (yMin === null && showZero) ? -150 : undefined,
                        suggestedMax: (yMax === null && showZero) ? 100 : undefined
                    }
                }
            }
        });
        chartInstances.push(newChart);
        this.charts[id] = newChart;
    }
}