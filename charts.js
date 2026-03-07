import { CONFIG } from './config.js';

export const Charts = {
    instances: {},

    getCommonOptions: (customOptions = {}) => ({
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 10, bottom: 0 } },
        
        // Interakcja: aktywuj wszystkie punkty na danej osi X
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
                    color: '#64748b',
                    font: { size: 10, weight: '600' },
                    boxWidth: 8,
                    usePointStyle: true,
                    padding: 15
                }
            },
            tooltip: {
                enabled: true,
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#94a3b8',
                titleFont: { size: 11, weight: 'bold' },
                bodyFont: { family: 'monospace', size: 11 },
                bodySpacing: 4,
                padding: 12,
                borderColor: 'rgba(51, 65, 85, 0.5)',
                borderWidth: 1,
                displayColors: true,
                boxPadding: 6,
                // Filtr: Tooltip pokazuje TYLKO widoczne linie
                filter: (tooltipItem) => {
                    return tooltipItem.chart.data.datasets[tooltipItem.datasetIndex].hidden !== true;
                },
                callbacks: {
                    label: (context) => {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
                        if (context.parsed.y !== null) {
                            label += context.parsed.y.toFixed(1) + (context.dataset.unit || '');
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
                grid: { display: false },
                ticks: { color: '#475569', font: { size: 10 }, maxRotation: 0 }
            },
            y: {
                grid: { color: 'rgba(51, 65, 85, 0.2)', drawBorder: false },
                ticks: { color: '#475569', font: { size: 10 }, padding: 8 }
            }
        },

        elements: {
            line: { tension: 0.35, borderWidth: 2 },
            point: { 
                radius: 0, 
                hoverRadius: 5, 
                hitRadius: 20,
                hoverBorderWidth: 2,
                hoverBackgroundColor: '#fff' 
            }
        },

        // Plugin do rysowania pionowej linii (Crosshair)
        plugins: [{
            id: 'verticalLine',
            beforeDraw: (chart) => {
                if (chart.tooltip?._active?.length) {
                    const x = chart.tooltip._active[0].element.x;
                    const yAxis = chart.scales.y;
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(x, yAxis.top);
                    ctx.lineTo(x, yAxis.bottom);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'; // Kolor linii slate-400 z niskim alpha
                    ctx.setLineDash([5, 5]); // Linia przerywana
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }]
    }),

    init: function(data) {
        if (!data || data.length === 0) return;

        CONFIG.CHART_CONFIG.forEach(cfg => {
            const canvas = document.getElementById(cfg.id);
            if (!canvas) return;

            // Zapamiętujemy stan widoczności legendy przed przeładowaniem
            const oldChart = this.instances[cfg.id];
            const hiddenStates = oldChart ? oldChart.data.datasets.map(d => d.hidden) : [];

            if (oldChart) oldChart.destroy();

            const datasets = cfg.datasets.map((ds, index) => ({
                label: ds.l,
                data: data.map(d => ({
                    x: new Date(d.timestamp).getTime(),
                    y: ds.d ? ds.d(k => d[k]) : d[ds.k]
                })).filter(p => p.y !== null && p.y !== undefined),
                borderColor: ds.c,
                backgroundColor: ds.c + '15',
                fill: ds.f || false,
                stepped: ds.s || false,
                hidden: ds.h || hiddenStates[index] || false, // ds.h to domyślnie ukryte z configu
                pointStyle: 'circle'
            }));

            this.instances[cfg.id] = new Chart(canvas, {
                type: 'line',
                data: { datasets },
                options: this.getCommonOptions(cfg.options || {})
            });
        });
    }
};