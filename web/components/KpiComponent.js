export const KpiComponent = {
    render(k) {
        return `
            <div class="kpi-card border border-slate-800 bg-slate-900/50 p-3 rounded-xl shadow-sm hover:border-slate-700 transition-all">
                <div class="flex justify-between items-center">
                    <div class="text-[11px] uppercase font-black text-slate-500 tracking-wider">${k.t}</div>
                    ${k.trend ? `<div class="text-sm font-bold">${k.trend}</div>` : ''}
                </div>
                <div class="text-lg font-mono font-black ${k.c} tracking-tighter">${k.v}</div>
                <div class="text-[11px] text-slate-400 font-bold tracking-tight">${k.u}</div>
            </div>`;
    }
};