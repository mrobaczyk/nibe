import { CONFIG } from './config.js';

export function getTimeConfig(isBar, unit) {
    let timeUnit = unit || 'hour';
    let tickLimitX = 6;

    switch (unit) {
        case 'month':
            tickLimitX = 12;
            break;
        case 'day':
            tickLimitX = 7;
            break;
        case 'hour':
        default:
            timeUnit = 'hour';
            tickLimitX = 8;
            break;
    }

    return { timeUnit, tickLimitX };
}

export function getXScale(isBar, timeUnit, tickLimitX, stacked, min, max, aggType) {
    return {
        type: 'time',
        min: min,
        max: max,
        stacked: stacked,
        time: {
            unit: timeUnit,
            displayFormats: {
                minute: 'HH:mm',
                hour: 'HH:mm',
                day: 'dd.MM',
                month: 'MMM'
            }
        },
        ticks: {
            color: '#94a3b8', // Jaśniejszy tekst (slate-400)
            font: { size: 10, weight: '500' },
            source: 'auto',
            autoSkip: timeUnit !== 'month',
            maxTicksLimit: tickLimitX,
            maxRotation: 0,
            padding: 8
        },
        grid: {
            display: true,
            color: 'rgba(51, 65, 85, 0.5)',
            drawBorder: true,
            borderColor: 'rgba(71, 85, 105, 0.5)', // Wyraźna linia dolna osi
            offset: false
        },
        offset: isBar
    };
}

// Min/max of the visible datasets on the 'y' axis that are not flagged ignoreScale; null if none apply.
export function getScaleExtent(datasets, isVisible = () => true) {
    let min = Infinity;
    let max = -Infinity;
    let hasIgnored = false;
    datasets.forEach((ds, i) => {
        if ((ds.yAxisID || 'y') !== 'y' || ds.isLegendOnly || !isVisible(i)) return;
        if (ds.ignoreScale) {
            hasIgnored = true;
            return;
        }
        (ds.data || []).forEach(p => {
            const y = p && typeof p === 'object' ? p.y : p;
            if (Number.isFinite(y)) {
                if (y < min) min = y;
                if (y > max) max = y;
            }
        });
    });
    return hasIgnored && min <= max ? { min, max } : null;
}

export function getYScale(id, stacked, finalMin, finalMax, isBar) {
    return {
        stacked: stacked,
        afterDataLimits(scale) {
            const chart = scale.chart;
            const extent = chart && getScaleExtent(chart.data.datasets, i => chart.isDatasetVisible(i));
            if (!extent) return;
            const pad = ((extent.max - extent.min) || Math.abs(extent.max) || 1) * 0.05;
            if (finalMin == null) scale.min = extent.min - pad;
            if (finalMax == null) scale.max = extent.max + pad;
        },
        grace: (id === 'c-stats' ? '0%' : '5%'),
        grid: {
            color: (context) => {
                // Specjalne wyróżnienie dla GM (Czerwona linia zero)
                if (id === 'c-gm' && context.tick?.value === 0) return 'rgba(248, 113, 113, 0.8)';

                // Wyróżnienie linii z etykietami (jaśniejsze)
                if (context.tick) return 'rgba(71, 85, 105, 0.4)';

                // Linie pomocnicze (ciemniejsze)
                return 'rgba(30, 41, 59, 0.3)';
            },
            lineWidth: (context) => (context.tick ? 1.5 : 1), // Grubsze linie przy etykietach
            drawBorder: false,
            drawOnChartArea: true
        },
        suggestedMin: isBar ? 0 : undefined,
        min: finalMin !== null ? finalMin : undefined,
        max: finalMax !== null ? finalMax : undefined,
        ticks: {
            color: (context) => (id === 'c-gm' && context.tick?.value === 0) ? '#f87171' : '#94a3b8',
            font: { size: 10, weight: '500' },
            padding: 8,
            stepSize: id === 'c-stats' ? 1 : undefined,
            autoSkip: false,
            maxTicksLimit: 8,
            callback: function (value) {
                if (value % 1 === 0) return value;
                return value.toFixed(1);
            }
        }
    };
}

export function getYTempScale(datasets) {
    return {
        type: 'linear',
        display: datasets.some(s => s.yAxisID === 'y-temp'),
        position: 'right',
        title: {
            display: true,
            text: 'Temp. (°C)',
            color: '#94a3b8',
            font: { size: 10 }
        },
        ticks: {
            color: '#94a3b8',
            font: { size: 10 }
        },
        grid: {
            drawOnChartArea: false,
            display: false
        }
    };
}
