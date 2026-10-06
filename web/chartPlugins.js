import { Utils } from './utils.js';

export const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw: (chart) => {
        if (!chart.activeTimestamp) return;
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
};

export function getPluginsConfig(title, isBar, unit, type, onLegendToggle) {
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
            display: false,
            position: 'bottom',
            onClick: (e, legendItem, legend) => {
                if (legendItem.text.includes('(tło)')) return;

                Chart.defaults.plugins.legend.onClick.call(legend, e, legendItem, legend);

                const chartId = legend.chart.canvas.id;
                const label = legendItem.text;
                const isVisible = legend.chart.isDatasetVisible(legendItem.datasetIndex);

                onLegendToggle?.(chartId, label, isVisible);
            },
            labels: {
                color: '#94a3b8',
                usePointStyle: true,
                pointStyle: isBar ? 'rect' : 'line',
                boxWidth: 12,
                font: { size: 10 },
                padding: 15,
                filter: (item, chart) => {
                    // 1. Wyciągamy tekst etykiety
                    const label = item.text;

                    // 2. Jeśli etykieta zawiera słowo "(tło)" - POKAZUJEMY 
                    // (To są nasze wirtualne wpisy z App.js)
                    if (label && label.includes('(tło)')) {
                        item.pointStyle = 'rect';
                        return true;
                    }

                    // 3. Blokujemy "techniczne" nazwy, które dublują tło
                    const technicalNames = ['Praca CO', 'Ciepła Woda', 'Defrost', 'Restart technologiczny', 'null', 'undefined'];
                    if (technicalNames.includes(label)) {
                        return false;
                    }

                    // 4. Obsługa linii temperatur i pozostałych
                    if (label && label.includes('Temp')) {
                        item.pointStyle = 'line';
                        return true;
                    }

                    // 5. Puste etykiety odrzucamy
                    if (!label || label === '') return false;

                    // 6. Cała reszta (Starty, Czas pracy itp.) - POKAZUJEMY
                    return true;
                }
            }
        },
        tooltip: getTooltipConfig(unit, type),
        datalabels: getDatalabelsConfig(isBar),
    };
}

export function getDatalabelsConfig(isBar) {
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

export function getTooltipConfig(unit, type) {
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
            title: (items) => {
                const ts = items[0].parsed.x;

                if (type === 'line') {
                    return Utils.formatDate(ts, 'tech');
                }

                return Utils.formatDate(ts, 'chart', unit);
            },
            label: (context) => {
                if (context.dataset.yAxisID === 'y-work') return null;

                const label = context.dataset.label || '';
                const value = context.parsed.y;

                let precision = (context.dataset.precision !== undefined) ? context.dataset.precision : 1;
                if (value < 0.1 && value > 0) {
                    precision = 2;
                }
                const formattedValue = value !== null ? value.toFixed(precision) : '0';

                return `${label}: ${formattedValue}`;
            }
        }
    };
}
