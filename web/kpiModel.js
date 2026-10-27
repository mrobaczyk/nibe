import { CONFIG } from './config.js';
import { Utils } from './utils.js';

// Indeks kpiId -> { chartIds, chartAvailable } budowany jednym przebiegiem
// po CONFIG.CHART_CONFIG zamiast filter/some dla każdego KPI osobno.
export function buildKpiChartIndex(chartCtrl) {
    const index = new Map();
    for (const chart of CONFIG.CHART_CONFIG) {
        if (!chart.kpiId) continue;
        let entry = index.get(chart.kpiId);
        if (!entry) {
            entry = { chartIds: [], chartAvailable: false };
            index.set(chart.kpiId, entry);
        }
        entry.chartIds.push(chart.id);
        if (chartCtrl.isChartAvailable(chart.id)) {
            entry.chartAvailable = true;
        }
    }
    return index;
}

export function buildKpis(stats, chartCtrl) {
    const chartIndex = buildKpiChartIndex(chartCtrl);

    // Wszystkie delty trendu w jednym przebiegu po danych (zamiast skanu na KPI).
    const trendKeys = CONFIG.KPIS.filter(kpi => kpi.trendKey).map(kpi => kpi.trendKey);
    const trendDeltas = stats.last && stats.dRange
        ? Utils.getTrendDeltas(
            stats.dRange,
            stats.last,
            trendKeys,
            CONFIG.trendWindowMinutes * 60_000,
            CONFIG.refreshIntervalMs * 2
        )
        : {};

    return CONFIG.KPIS.map(kpi => {
        const charts = chartIndex.get(kpi.id);
        const chartIds = charts ? charts.chartIds : [];
        const chartAvailable = charts ? charts.chartAvailable : false;
        let trendHtml = '';

        if (kpi.trendKey && stats.last && stats.dRange) {
            const curr = stats.last[kpi.trendKey];
            const trendDelta = trendDeltas[kpi.trendKey];
            const prev = Number.isFinite(trendDelta) ? curr - trendDelta : undefined;
            trendHtml = Utils.getTrendIcon(curr, prev);
        }

        return {
            ...kpi,
            chartIds,
            chartAvailable,
            editableParameters: (kpi.editableParameters || []).map(parameter => ({
                ...parameter,
                currentValue: stats.absoluteLast?.[parameter.field]
            })),
            v: kpi.v(stats),
            u: kpi.u(stats),
            c: kpi.dynamicClass ? kpi.dynamicClass(stats) : kpi.c,
            chartEnabled: chartAvailable && chartCtrl.chartPreferences[kpi.id],
            trendWindowMinutes: kpi.trendKey ? CONFIG.trendWindowMinutes : undefined,
            trend: trendHtml
        };
    });
}
