export const KpiComponent = {
    render(k) {
        const hasCharts = k.chartIds?.length > 0;
        const chartAvailable = k.chartAvailable !== false;
        const chartEnabled = Boolean(k.chartEnabled);
        const chartIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
        const editIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m16 4 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/><path d="M13.5 6.5 17.5 10.5"/></svg>';
        const editable = k.editableParameters?.length > 0;
        const toggleButton = hasCharts
            ? `<button type="button" data-kpi-toggle="${k.id}" aria-pressed="${chartEnabled}" aria-label="${chartAvailable ? `${chartEnabled ? 'Ukryj' : 'Pokaż'} wykresy: ${k.t}` : `Wykresy liniowe ukryte dla zakresu powyżej miesiąca: ${k.t}`}" title="${chartAvailable ? `${chartEnabled ? 'Ukryj' : 'Pokaż'} powiązane wykresy` : 'Wykresy liniowe są ukrywane dla zakresów powyżej miesiąca'}" class="absolute inset-0 z-0 h-full w-full rounded-xl bg-transparent text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${chartAvailable ? 'cursor-pointer' : 'cursor-not-allowed'}" ${chartAvailable ? '' : 'disabled'}></button>`
            : '';
        const editButton = editable
            ? `<button type="button" data-kpi-edit="${k.id}" aria-label="Edytuj ${k.t}" title="Edytuj parametr" class="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:border-blue-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">${editIcon}</button>`
            : '';

        return `
            <div class="kpi-card relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-0 shadow-sm transition-all ${hasCharts && !chartEnabled ? 'opacity-50 grayscale' : 'hover:border-slate-700'}">
                ${toggleButton}
                <div class="relative z-10 p-3 ${hasCharts ? 'pointer-events-none' : ''}">
                    <div class="flex items-center justify-between gap-2 ${editable ? 'pr-8' : ''}">
                    <div class="flex min-w-0 items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                        ${hasCharts ? chartIcon : ''}<span>${k.t}</span>
                    </div>
                    <span class="flex items-center gap-2">
                        ${k.trend ? `<span class="text-sm font-bold">${k.trend}</span>` : ''}
                    </span>
                </div>
                    <div class="text-lg font-mono font-black ${k.c} tracking-tighter">${k.v}</div>
                    <div class="text-[11px] font-bold tracking-tight text-slate-400">${k.u}</div>
                </div>
                ${editButton}
            </div>`;
    }
};