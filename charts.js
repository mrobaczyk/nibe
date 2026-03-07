import { CONFIG } from './config.js';

export class ChartManager {
    constructor() {
        this.instances = {};
    }

    // This was missing! It maps raw JSON data to Chart.js format
    mapData(data, cfg) {
        return cfg.datasets.map((ds, index) => ({
            label: ds.l,
            data: data.map(d => ({
                x: new Date(d.timestamp).getTime(),
                y: ds.d ? ds.d(key => d[key]) : d[ds.k]
            })).filter(p => p.y !== null && p.y !== undefined),
            borderColor: ds.c,
            backgroundColor: ds.c + '20',
            fill: ds.f || false,
            stepped: ds.s || false,
            hidden: ds.h || false,
            pointStyle: 'circle'
        }));
    }

    getCommonOptions(cfg) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#94a3b8',
                        font: { size: 10, weight: '600' },
                        boxWidth: 8,
                        usePointStyle: true,
                        padding: 10
                    }
                },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    borderColor: '#334155',
                    borderWidth: 1,
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { family: 'monospace', size: 11 },
                    padding: 10,
                    displayColors: true,
                    filter: (item) => !item.chart.data.datasets[item.datasetIndex].hidden,
                    callbacks: {
                        label: (context) => {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(1);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        displayFormats: { minute: 'HH:mm' },
                        tooltipFormat: 'yyyy-MM-dd HH:mm'
                    },
                    grid: { color: 'rgba(51, 65, 85, 0.1)', drawBorder: false },
                    ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 0 }
                },
                y: {
                    grid: { color: 'rgba(51, 65, 85, 0.2)', drawBorder: false },
                    ticks: { color: '#64748b', font: { size: 10 } },
                    ...cfg.options?.y
                }
            },
            elements: {
                line: { tension: 0.3, borderWidth: 2 },
                point: { radius: 0, hoverRadius: 5, hitRadius: 20 }
            }
        };
    }

    init(data) {
        if (!data || data.length === 0) return;

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
                        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            });
        }

        CONFIG.CHART_CONFIG.forEach(cfg => {
            const canvas = document.getElementById(cfg.id);
            if (!canvas) return;

            const currentChart = this.instances[cfg.id];
            const hiddenStates = currentChart 
                ? currentChart.data.datasets.map(d => d.hidden) 
                : [];

            if (currentChart) {
                currentChart.destroy();
            }

            const datasets = this.mapData(data, cfg);
            
            // Re-apply hidden states after mapping
            datasets.forEach((ds, i) => {
                if (hiddenStates[i] !== undefined) ds.hidden = hiddenStates[i];
            });

            this.instances[cfg.id] = new Chart(canvas, {
                type: 'line',
                data: { datasets },
                options: this.getCommonOptions(cfg)
            });
        });
    }
}