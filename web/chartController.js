// chartController.js
// Owns chart visibility preferences, render jobs and the IntersectionObserver
// used to lazily render charts. Kept separate from App so chart lifecycle
// logic can be tested and reasoned about independently.
import { CONFIG } from './config.js';
import { TemplateManager } from './TemplateManager.js';

const CHART_PREFERENCES_KEY = 'nibe-chart-kpi-preferences';

export class ChartController {
    constructor(chartMgr, { getActiveFrame, onPreferenceChange } = {}) {
        this.chartMgr = chartMgr;
        this.getActiveFrame = getActiveFrame || (() => CONFIG.DEFAULTS.ACTIVE_FRAME);
        this.onPreferenceChange = onPreferenceChange || (() => { });

        this.chartPreferences = this.loadChartPreferences();
        this.chartRenderJobs = new Map();
        this.chartVisibility = new Map();
        this.appliedChartVisibility = new Map();
        this.chartObserver = null;
    }

    loadChartPreferences() {
        const chartedKpiIds = [...new Set(CONFIG.CHART_CONFIG.map(chart => chart.kpiId).filter(Boolean))];
        const defaults = Object.fromEntries(
            chartedKpiIds.map(kpiId => [kpiId, true])
        );

        try {
            const saved = JSON.parse(localStorage.getItem(CHART_PREFERENCES_KEY) || '{}');
            return Object.fromEntries(Object.keys(defaults).map(id => [
                id,
                typeof saved[id] === 'boolean' ? saved[id] : defaults[id]
            ]));
        } catch {
            return defaults;
        }
    }

    isChartEnabled(chartId) {
        const chart = CONFIG.CHART_CONFIG.find(item => item.id === chartId);
        return Boolean(chart && this.chartPreferences[chart.kpiId] && this.isChartAvailable(chartId));
    }

    isChartAvailable(chartId) {
        const isHistorical = chartId.startsWith('c-daily-');
        const longRange = /^([0-9]+)m$/.exec(this.getActiveFrame());
        return !longRange || Number(longRange[1]) <= 1 || isHistorical;
    }

    createChartsContainers() {
        TemplateManager.render('live-view', CONFIG.CHART_CONFIG, TemplateManager.chartCard);
    }

    setupChartObserver() {
        if (!('IntersectionObserver' in window)) {
            this.syncChartVisibility();
            return;
        }

        this.chartObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const chartId = entry.target.id.slice(2);
                this.chartVisibility.set(chartId, entry.isIntersecting);

                if (entry.isIntersecting) {
                    this.renderChart(chartId);
                }
            });
        }, { rootMargin: '100px 0px' });

        this.syncChartVisibility();
    }

    setRenderJob(chartId, job) {
        this.chartRenderJobs.set(chartId, job);
    }

    renderChart(chartId) {
        const job = this.chartRenderJobs.get(chartId);
        if (!job) return;

        const rawData = typeof job.rawData === 'function' ? job.rawData() : job.rawData;
        this.chartMgr.draw(chartId, job.title, job.datasets, {
            ...job.options,
            rawData
        });
    }

    renderEnabledVisibleCharts() {
        CONFIG.CHART_CONFIG.forEach(cfg => {
            if (this.isChartEnabled(cfg.id) && (!this.chartObserver || this.chartVisibility.get(cfg.id))) {
                this.renderChart(cfg.id);
            }
        });
    }

    syncChartVisibility() {
        CONFIG.CHART_CONFIG.forEach(cfg => {
            const enabled = this.isChartEnabled(cfg.id);
            if (this.appliedChartVisibility.get(cfg.id) === enabled) return;

            this.appliedChartVisibility.set(cfg.id, enabled);
            const card = document.getElementById(`p-${cfg.id}`);
            if (!card) return;

            card.style.display = enabled ? '' : 'none';
            if (enabled) {
                if (this.chartObserver) {
                    this.chartVisibility.set(cfg.id, false);
                    this.chartObserver.observe(card);
                } else {
                    this.renderChart(cfg.id);
                }
                return;
            }

            this.chartObserver?.unobserve(card);
            this.chartVisibility.set(cfg.id, false);
            if (this.chartMgr.charts[cfg.id]) {
                this.chartMgr.charts[cfg.id].destroy();
                delete this.chartMgr.charts[cfg.id];
            }
        });
    }

    toggleKpiCharts(kpiId) {
        if (!(kpiId in this.chartPreferences)) return;
        const hasAvailableCharts = CONFIG.CHART_CONFIG.some(chart => chart.kpiId === kpiId && this.isChartAvailable(chart.id));
        if (!hasAvailableCharts) return;

        this.chartPreferences[kpiId] = !this.chartPreferences[kpiId];
        try {
            localStorage.setItem(CHART_PREFERENCES_KEY, JSON.stringify(this.chartPreferences));
        } catch (error) {
            console.warn('Nie udało się zapisać ustawień wykresów:', error);
        }

        this.onPreferenceChange();
        this.syncChartVisibility();
        if (!this.chartObserver) {
            CONFIG.CHART_CONFIG
                .filter(chart => chart.kpiId === kpiId && this.isChartEnabled(chart.id))
                .forEach(chart => this.renderChart(chart.id));
        }
    }

    toggleFullscreen(chartId) {
        const canvas = document.getElementById(chartId);
        if (!canvas) return;

        const card = canvas.closest('.card');
        const chartInstance = this.chartMgr.charts[chartId];

        const isFullscreen = card.classList.toggle('is-fullscreen');
        document.body.classList.toggle('chart-fullscreen-active', isFullscreen);

        if (isFullscreen) {
            window.scrollTo({ top: 0, behavior: 'instant' });
        }

        if (chartInstance) {
            chartInstance.resize();
            chartInstance.update('none');
        }
    }
}
