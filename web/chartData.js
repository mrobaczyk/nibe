import { CONFIG } from './config.js';

export function getLocalTimestamp(ts) {
    if (!ts) return null;
    if (ts instanceof Date) return ts.getTime();

    let dateStr = String(ts);

    // 1. Jeśli to tylko DATA (YYYY-MM-DD) - np. ze słupków
    if (dateStr.length === 10 && !dateStr.includes(':')) {
        // Zamiana "2026-04-01" na "2026/04/01" wymusza 00:00:00 Local Time
        const localDate = new Date(dateStr.replace(/-/g, '/'));
        return localDate.getTime();
    }

    // 2. Jeśli to pełny TIMESTAMP (YYYY-MM-DD HH:mm) - np. z linii
    // Tutaj nadal musimy dodać Z, bo wiemy że surowe dane są w UTC
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        // Jeśli string ma spację zamiast T, poprawiamy format pod Date()
        dateStr = dateStr.replace(' ', 'T') + 'Z';
    }

    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.getTime();
}

export function mapDatasetData(ds, rawData, extraParams = {}) {
    if (ds.isZone && extraParams.zones) {
        return extraParams.zones.map(z => ({ x: z.x, y: z[ds.isZone] }));
    }

    if (ds.manualData) {
        return ds.manualData;
    }

    const finalData = [];
    const MAX_GAP_MS = 8 * 60 * 1000;

    rawData.forEach((item, index) => {
        if (!item.ts) return;
        const x = item.tsMs ?? getLocalTimestamp(item.ts);


        if (index > 0 && ds.t !== 'bar') {
            const prev = rawData[index - 1];
            const prevX = prev.tsMs ?? getLocalTimestamp(prev.ts);

            if (prevX && (x - prevX > MAX_GAP_MS)) {
                finalData.push({ x: prevX + 1, y: null });
            }
        }

        let y = null;
        if (typeof ds.d === 'function') {
            let isInvalid = false;

            y = ds.d(key => {
                const val = item[key];
                if (val === undefined || val === null) {
                    isInvalid = true;
                    return 0;
                }
                return Number(val);
            });

            if (isInvalid || y === 0 || isNaN(y)) {
                y = null;
            }
        } else if (typeof ds.k === 'function') {
            y = ds.k(item);
        } else {
            const rawVal = item[ds.k];
            y = (rawVal !== undefined && rawVal !== null) ? Number(rawVal) : null;
        }

        if (y !== null) {
            finalData.push({ x, y });
        }
    });

    return finalData;
}

export function resolveBgColor(s, isBarGlobal) {
    // Jeśli to strefa (tło pod wykresem)
    if (s.isZone) {
        // Jeśli kolor w configu jest już w rgba, zostawiamy. 
        // Jeśli jest w hex (np. #ff0000), dodajemy przezroczystość z UI.
        return s.c.startsWith('#') ? s.c + CONFIG.UI.ALPHA_ZONE : s.c;
    }

    // Jeśli to słupek (np. COP, Starty)
    if (s.t === 'bar' || isBarGlobal) {
        return s.c.startsWith('#') ? s.c + CONFIG.UI.ALPHA_BAR : s.c;
    }

    return 'transparent';
}

export function prepareDatasets(datasets, rawData, extraOptions, isBar, unit, chartId, chartStates = {}) {
    // 1. Mapujemy standardowe datasety
    const processed = datasets.map(s => {
        const data = mapDatasetData(s, rawData, extraOptions);
        const label = s.l;
        let isHidden = !!s.h;
        if (chartStates[chartId] && chartStates[chartId][label] !== undefined) {
            isHidden = !chartStates[chartId][label];
        }
        const isCopChart = s.id === 'c-daily-cop';
        const isBarType = s.t === 'bar' || isBar;
        const isZone = !!s.isZone;
        const isWorkAxis = s.yAxisID === 'y-work';
        const hidePoints = isWorkAxis || !!unit;

        return {
            // Jeśli to strefa tła, ustawiamy label na null, żeby nie zaśmiecała legendy
            label: s.l,
            data: data,
            isZone: isZone,
            precision: s.p,
            type: s.t || undefined,
            yAxisID: s.yAxisID || 'y',
            hidden: isHidden,
            borderColor: s.c,
            backgroundColor: (isZone || isBarType) ? resolveBgColor(s, isBarType) : 'rgba(0,0,0,0)',
            borderWidth: (isZone || isWorkAxis) ? 0 : CONFIG.UI.BORDER_WIDTH,
            tension: (isZone || s.s === false) ? 0 : CONFIG.UI.LINE_TENSION,
            pointRadius: hidePoints ? 0 : CONFIG.UI.POINT_RADIUS,
            pointHoverRadius: isWorkAxis ? 0 : 5,
            pointBackgroundColor: s.c,
            spanGaps: isBarType,
            stepped: isZone ? 'before' : (isBarType ? false : (s.s !== false)),
            fill: isZone ? 'origin' : false,
            clip: false,
            barPercentage: isWorkAxis ? 1 : undefined,
            categoryPercentage: isWorkAxis ? 1 : undefined,
            grouped: isZone ? false : (isCopChart ? true : undefined),
        };
    });

    // 2. Dodajemy "Wirtualną Legendę" dla stref tła (tylko raz na wykres)
    const zonesInChart = datasets.filter(s => s.isZone);

    if (zonesInChart.length > 0) {
        zonesInChart.forEach(z => {
            processed.push({
                label: z.l + ' (tło)', // Upewnij się, że 'z.l' to np. 'Praca CO'
                data: [],
                backgroundColor: z.c,
                borderColor: z.c,
                borderWidth: 1, // Dajmy 1, żeby kwadracik był wyraźny
                pointStyle: 'rect',
                usePointStyle: true,
                showLine: false, // To nie jest linia
                isLegendOnly: true, // Nasz znacznik pomocniczy
                hidden: false
            });
        });
    }

    return processed;
}
