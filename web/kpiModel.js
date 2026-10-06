import { CONFIG } from './config.js';
import { Utils } from './utils.js';

export function buildKpis(stats, chartCtrl) {
    return CONFIG.KPIS.map(kpi => {
        const chartIds = CONFIG.CHART_CONFIG.filter(chart => chart.kpiId === kpi.id).map(chart => chart.id);
        const chartAvailable = chartIds.some(chartId => chartCtrl.isChartAvailable(chartId));
        let trendHtml = '';

        if (kpi.trendKey && stats.last && stats.dRange) {
            const curr = stats.last[kpi.trendKey];
            const trendDelta = Utils.getTrendDelta(
                stats.dRange,
                stats.last,
                kpi.trendKey,
                CONFIG.trendWindowMinutes * 60_000,
                CONFIG.refreshIntervalMs * 2
            );
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
