export const ChartComponent = {
    render(chart) {
        return `
            <div class="card relative min-h-[400px] h-full" id="p-${chart.id}">
                <div class="absolute top-2 right-2 z-20 flex gap-2">
                    ${this._btn(`app.chartMgr.toggleLegend('${chart.id}')`, 'emerald', 'list-icon')}
                    ${this._btn(`app.toggleFullscreen('${chart.id}')`, 'blue', 'expand-icon')}
                </div>
                <canvas id="${chart.id}"></canvas>
            </div>`;
    },
    _btn(action, color, icon) {
        return `<button onclick="${action}" class="p-2 bg-slate-900/60 hover:bg-${color}-600 rounded-lg text-slate-300 shadow-lg border border-slate-700/50">...</button>`;
    }
};