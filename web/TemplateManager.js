import { Utils } from './utils.js';

export const TemplateManager = {
    /**
     * Generuje pojedynczą kartę KPI
     */
    kpiCard(k) {
        return `
            <div class="kpi-card border border-slate-800 bg-slate-900/50 p-3 rounded-xl flex flex-col gap-1 shadow-sm transition-all hover:border-slate-700">
                <div class="text-[11px] uppercase font-black text-slate-500 tracking-wider leading-none">${k.t}</div>
                <div class="text-lg font-mono font-black ${k.c} tracking-tighter leading-tight">${k.v}</div>
                <div class="text-[11px] text-slate-400 font-bold tracking-tight">${k.u}</div>
            </div>
        `;
    },

    /**
     * Generuje pasek trendu
     */
    trendRow(k) {
        return `
            <div class="flex justify-between items-center bg-slate-900/30 border border-slate-800/50 p-3 rounded-xl">
                <div class="text-[11px] uppercase text-slate-500 font-black tracking-widest leading-none">${k.t}</div>
                <div class="text-lg font-mono font-black ${k.c} tracking-tighter flex items-center">${k.v}</div>
            </div>
        `;
    },

    /**
     * Generuje strukturę karty wykresu (Canvas + Zoom)
     */
    chartCard(chart) {
        return `
            <div class="card relative group min-h-[400px] h-full" id="p-${chart.id}">
                <button 
                    class="btn-zoom absolute top-2 right-2 z-10 p-2 bg-slate-800/50 hover:bg-blue-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-white"
                    onclick="app.toggleFullscreen('${chart.id}')"
                    title="Powiększ">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
                         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                    </svg>
                </button>
                <canvas id="${chart.id}"></canvas>
            </div>
        `;
    },

    /**
     * Generuje sekcję statusu połączenia i info o bazie
     */
    statusInfo(stats) {
        const statusIconColor = stats.isOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500';
        const dateStr = Utils.formatDate(stats.absoluteLast.timestamp);

        return `
            <div class="flex flex-col">
                <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full ${statusIconColor} shadow-sm"></div>
                    <span class="font-mono text-sm font-bold ${stats.isOnline ? 'text-white' : 'text-red-400'} tracking-tight">
                        ${dateStr}
                    </span>
                </div>
            </div>
        `;
    },

    /**
     * Generuje przycisk filtra czasowego
     * @param {string} key - Klucz z CONFIG.TIME_FRAMES (np. '1h')
     * @param {boolean} isActive - Czy ten filtr jest obecnie wybrany
     */
    filterBtn(key, isActive = false) {
        const activeClass = isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:text-slate-200';
        return `
            <button 
                class="filter-btn h-full px-4 text-xs font-bold transition-all rounded-lg ${activeClass}" 
                data-frame="${key}">
                ${key}
            </button>
        `;
    },

    /**
     * Metoda pomocnicza do masowego renderowania
     */
    render(containerId, items, templateFn) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = items.map(item => templateFn(item)).join('');
    }
};