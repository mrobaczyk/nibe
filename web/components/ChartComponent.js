export const ChartComponent = {
    render(chart) {
        const iconLegend = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><circle cx="3" cy="6" r="1"></circle><circle cx="3" cy="12" r="1"></circle><circle cx="3" cy="18" r="1"></circle></svg>`;
        const iconExpand = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>`;

        return `
            <div class="card relative min-h-[400px] h-full" id="p-${chart.id}">
                <div class="absolute top-2 right-2 z-20 flex gap-2">
                    ${this._btn(`app.chartMgr.toggleLegend('${chart.id}')`, 'emerald', iconLegend, 'Przełącz legendę')}
                    ${this._btn(`app.toggleFullscreen('${chart.id}')`, 'blue', iconExpand, 'Powiększ')}
                </div>
                <canvas id="${chart.id}"></canvas>
            </div>`;
    },

    _btn(action, color, svgIcon, title) {
        return `
            <button 
                onclick="${action}" 
                title="${title}"
                class="flex items-center justify-center p-2 bg-slate-900/60 hover:bg-${color}-600 rounded-lg text-slate-300 hover:text-white shadow-lg backdrop-blur-md border border-slate-700/50 transition-all active:scale-95">
                ${svgIcon}
            </button>
        `;
    }
};