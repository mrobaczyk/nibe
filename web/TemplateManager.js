import { Utils } from './utils.js';

export const TemplateManager = {
    /**
     * Generuje pojedynczą kartę KPI
     */
    kpiCard(k) {
        return `
            <div class="kpi-card border border-slate-800 bg-slate-900/50 p-3 rounded-xl flex flex-col gap-1 shadow-sm transition-all hover:border-slate-700">
                <div class="flex justify-between items-center">
                    <div class="text-[11px] uppercase font-black text-slate-500 tracking-wider leading-none">${k.t}</div>
                    ${k.trend ? `<div class="text-sm font-bold leading-none">${k.trend}</div>` : ''}
                </div>
                <div class="text-lg font-mono font-black ${k.c} tracking-tighter leading-tight">${k.v}</div>
                <div class="text-[11px] text-slate-400 font-bold tracking-tight">${k.u}</div>
            </div>
        `;
    },

    /**
     * Generuje strukturę karty wykresu (Canvas + Zoom)
     */
    chartCard(chart) {
        return `
            <div class="card relative min-h-[400px] h-full flex flex-col p-4" id="p-${chart.id}">
                <div class="absolute top-2 right-2 z-20 flex gap-2">
                    <button 
                        class="p-2 bg-slate-900/60 hover:bg-emerald-600 rounded-lg text-slate-300 hover:text-white shadow-lg backdrop-blur-md border border-slate-700/50 transition-all active:scale-95"
                        onclick="app.chartMgr.toggleLegend('${chart.id}')"
                        title="Przełącz legendę">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <circle cx="3" cy="6" r="1"></circle>
                            <circle cx="3" cy="12" r="1"></circle>
                            <circle cx="3" cy="18" r="1"></circle>
                        </svg>
                    </button>

                    <button 
                        class="p-2 bg-slate-900/60 hover:bg-blue-600 rounded-lg text-slate-300 hover:text-white shadow-lg backdrop-blur-md border border-slate-700/50 transition-all active:scale-95"
                        onclick="app.toggleFullscreen('${chart.id}')"
                        title="Powiększ">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                        </svg>
                    </button>
                </div>

                <div class="flex-grow w-full relative">
                    <canvas id="${chart.id}"></canvas>
                </div>
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
            class="filter-btn h-full px-4 text-xs font-bold transition-all rounded-lg flex-shrink-0 snap-center ${activeClass}" 
            data-frame="${key}">
            ${key}
        </button>
    `;
    },

    dateNavigator(startLabel, endLabel, isLatest) {
        return `
            <div class="flex items-center bg-slate-900 rounded-xl border border-slate-800 h-14 overflow-hidden shadow-lg w-full">
                <div class="flex h-full border-r border-slate-800/50">
                    <button onclick="app.moveRange('big', -1)" class="px-3 h-full hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all border-r border-slate-800/30">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
                    </button>
                    <button onclick="app.moveRange('small', -1)" class="px-3 h-full hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                </div>

                <div class="flex-1 min-w-[140px] px-2 font-mono whitespace-nowrap h-full flex flex-col justify-center items-center">
                    <div class="flex items-center gap-2 leading-tight">
                        <span class="${isLatest ? 'text-emerald-500' : 'text-blue-400'} text-[14px] md:text-[16px] font-black tracking-tighter uppercase w-5 text-right">Od</span>
                        <span class="${isLatest ? 'text-emerald-500' : 'text-blue-400'} text-[14px] md:text-[16px] font-black tracking-tighter uppercase">
                            ${startLabel}
                        </span>
                    </div>
                    <div class="flex items-center gap-2 leading-tight">
                        <span class="${isLatest ? 'text-emerald-500' : 'text-blue-400'} text-[14px] md:text-[16px] font-black tracking-tighter uppercase w-5 text-right">Do</span>
                        <span class="${isLatest ? 'text-emerald-500' : 'text-blue-400'} text-[14px] md:text-[16px] font-black tracking-tighter uppercase">
                            ${endLabel}
                        </span>
                    </div>
                </div>

                <div class="flex h-full border-l border-slate-800/50">
                    <button onclick="app.moveRange('small', 1)" ${isLatest ? 'disabled' : ''} 
                        class="px-3 h-full hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all 
                               disabled:text-slate-600 disabled:bg-slate-900/50 border-r border-slate-800/30">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                    <button onclick="app.moveRange('big', 1)" ${isLatest ? 'disabled' : ''} 
                        class="px-3 h-full hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all 
                               disabled:text-slate-600 disabled:bg-slate-900/50">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 5 18 10 13 15"></polyline><polyline points="6 5 11 10 6 15"></polyline></svg>
                    </button>
                </div>

                <button onclick="app.resetRange()" class="px-4 h-full hover:bg-blue-600/10 text-slate-400 hover:text-blue-400 transition-all border-l border-slate-800 group">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"></path><path d="M3 13a9 9 0 1 0 3-7.7L3 8"></path></svg>
                </button>
            </div>
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