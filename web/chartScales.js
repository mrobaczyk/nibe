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

export function getYScale(id, stacked, finalMin, finalMax, isBar) {
    return {
        stacked: stacked,
        grace: (id === 'c-cwu-mode' || id === 'c-stats' ? '0%' : '5%'),
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
            stepSize: (id === 'c-cwu-mode' || id === 'c-stats') ? 1 : undefined,
            autoSkip: false,
            maxTicksLimit: 8,
            callback: function (value) {
                if (id === 'c-cwu-mode') {
                    return CONFIG.cwuNames[value] || null;
                }
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
