export const KpiComponent = {
    render(k) {
        const hasCharts = k.chartIds?.length > 0;
        const chartAvailable = k.chartAvailable !== false;
        const chartEnabled = Boolean(k.chartEnabled);
        const chartIcon = chartEnabled
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-4 4.8M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 3-.4"/></svg>';
        const toggleAttrs = hasCharts
            ? `role="button" tabindex="${chartAvailable ? '0' : '-1'}" data-kpi-toggle="${k.id}" aria-disabled="${!chartAvailable}" aria-pressed="${chartEnabled}" aria-label="${chartAvailable ? `${chartEnabled ? 'Ukryj' : 'Pokaż'} wykresy` : 'Wykresy liniowe ukryte dla zakresu powyżej miesiąca'}: ${k.t}" title="${chartAvailable ? `${chartEnabled ? 'Ukryj' : 'Pokaż'} powiązane wykresy` : 'Wykresy liniowe są ukrywane dla zakresów powyżej miesiąca'}"`
            : '';

        return `
            <div class="kpi-card border border-slate-800 bg-slate-900/50 p-3 rounded-xl shadow-sm transition-all ${hasCharts && chartAvailable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400' : ''} ${hasCharts && (!chartAvailable || !chartEnabled) ? 'opacity-50 grayscale' : 'hover:border-slate-700'}" ${toggleAttrs}>
                <div class="flex justify-between items-center">
                    <div class="text-[11px] uppercase font-black text-slate-500 tracking-wider">${k.t}</div>
                    <span class="flex items-center gap-2">
                        ${k.trend ? `<span class="text-sm font-bold">${k.trend}</span>` : ''}
                        ${hasCharts ? `<span class="text-slate-400" aria-hidden="true">${chartIcon}</span>` : ''}
                    </span>
                </div>
                <div class="text-lg font-mono font-black ${k.c} tracking-tighter">${k.v}</div>
                <div class="text-[11px] text-slate-400 font-bold tracking-tight">${k.u}</div>
            </div>`;
    }
};