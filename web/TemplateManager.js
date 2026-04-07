// web/TemplateManager.js

import { Utils } from './utils.js';
import { KpiComponent } from './components/KpiComponent.js';
import { ChartComponent } from './components/ChartComponent.js';
import { NavigationComponent } from './components/NavigationComponent.js';

export const TemplateManager = {
    kpiCard(k) {
        return KpiComponent.render(k);
    },

    chartCard(chart) {
        return ChartComponent.render(chart);
    },

    filterBtn(key, isActive = false) {
        return NavigationComponent.filterBtn(key, isActive);
    },

    dateNavigator(startLabel, endLabel, isLatest) {
        return NavigationComponent.dateNavigator(startLabel, endLabel, isLatest);
    },

    toggleLoader(isLoading) {
        NavigationComponent.toggleLoader(isLoading);
    },

    statusInfo(stats) {
        const statusIconColor = stats.isOnline
            ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
            : 'bg-red-500';

        const dateStr = Utils.formatDate(stats.absoluteLast.ts);

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

    render(containerId, items, templateFn) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!Array.isArray(items)) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = items.map(item => templateFn(item)).join('');
    }
};