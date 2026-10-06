import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';
import { TemplateManager } from './TemplateManager.js';
import { Utils } from './utils.js';
import { ChartController } from './chartController.js';
import { fetchDashboardData } from './dataLoader.js';
import { computeNextOffset } from './rangeNavigation.js';
import { prepareHistoryData } from './historyData.js';
import { buildKpis } from './kpiModel.js';
import { setupFilterScroll } from './filterScroll.js';
import { openParameterEditorDialog, submitParameterUpdate } from './parameterEditor.js';
import {
    fillMissingData,
    processRawData,
    calculateRange,
    assembleFinalStats,
    setPowerModel,
} from './dataProcessing.js';

class App {
    constructor() {
        this.state = {
            isLoading: true,
            activeFrame: CONFIG.DEFAULTS.ACTIVE_FRAME || '24h',
            liveOffset: 0,
            rawData: [],
            processedData: [],
            hourlyData: []
        };

        this.chartMgr = new ChartManager();
        this.chartCtrl = new ChartController(this.chartMgr, {
            getActiveFrame: () => this.state.activeFrame,
            onPreferenceChange: () => { if (this.lastStats) this.renderKpis(this.lastStats); }
        });
        this.lastStats = null;
        this.init();
    }

    async init() {
        if (await this.loadData()) {
            this.startApp();
            this.render();
        } else {
            this.setLoading(false);
        }

        // Odświeżanie co 5 minut, tylko gdy karta jest widoczna
        this.lastRefreshAt = Date.now();
        const refreshIfVisible = () => {
            if (document.visibilityState !== 'visible' || !this.chartsReady) return;
            this.lastRefreshAt = Date.now();
            this.refreshData();
        };
        setInterval(refreshIfVisible, CONFIG.refreshIntervalMs);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && Date.now() - this.lastRefreshAt >= CONFIG.refreshIntervalMs) {
                refreshIfVisible();
            }
        });
    }

    // Jednorazowa inicjalizacja UI, możliwa dopiero po pierwszym udanym załadowaniu danych
    startApp() {
        this.chartCtrl.createChartsContainers();
        this.chartCtrl.setupChartObserver();
        this._setupTimeFilters();
        this.setupEventListeners();
        setupFilterScroll(document.getElementById('filter-group'));
        this.chartsReady = true;
    }

    async loadData() {
        try {
            const { powerModel, rawJson, hourlyData } = await fetchDashboardData();
            setPowerModel(powerModel);
            this.state.hourlyData = hourlyData;
            this.state.rawData = fillMissingData(rawJson);
            this.state.processedData = processRawData(this.state.rawData);
            TemplateManager.hideLoadError();
            return true;
        } catch (e) {
            console.error("Krytyczny błąd ładowania danych:", e);
            const hasData = this.state.processedData.length > 0;
            TemplateManager.showLoadError(
                hasData ? 'Nie udało się odświeżyć danych. Wyświetlane są dane sprzed chwili.' : 'Nie udało się załadować danych.',
                () => this.retryLoad()
            );
            return false;
        }
    }

    async retryLoad() {
        TemplateManager.hideLoadError();
        this.setLoading(true);
        const firstLoad = !this.chartsReady;
        if (await this.loadData() && firstLoad) {
            this.startApp();
        }
        if (this.chartsReady) this.render();
        this.setLoading(false);
    }

    async refreshData() {
        if (this.state.liveOffset === 0) {
            if (await this.loadData()) this.render();
        }
    }

    moveRange(type, direction) {
        this.state.liveOffset = computeNextOffset(this.state.activeFrame, this.state.liveOffset, type, direction);
        this.render();
    }

    resetRange() {
        this.state.liveOffset = 0;
        this.render();
    }

    updateDateNavigator(stats) {
        const navContainer = document.getElementById('date-navigator');
        if (!navContainer || !stats || !stats.displayStart || !stats.displayEnd) return;

        const { activeFrame } = this.state;
        const isLatest = this.state.liveOffset === 0;

        const frameConfig = CONFIG.TIME_FRAMES[activeFrame || '24h'];
        const showTime = frameConfig && frameConfig.hrs !== undefined;

        let startLabel, endLabel;

        if (showTime) {
            startLabel = Utils.formatDate(stats.displayStart);

            const roundedEnd = Math.ceil(stats.displayEnd.getTime() / CONFIG.DATA.MS_PER_HOUR) * CONFIG.DATA.MS_PER_HOUR;
            endLabel = Utils.formatDate(new Date(roundedEnd));
        } else {
            const toIsoDate = (date) => {
                const d = new Date(date);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            startLabel = toIsoDate(stats.displayStart);
            endLabel = toIsoDate(stats.displayEnd);
        }

        navContainer.innerHTML = TemplateManager.dateNavigator(startLabel, endLabel, isLatest);
    }

    getProcessedStats() {
        const { processedData, activeFrame, liveOffset } = this.state;
        if (!processedData.length) return null;

        const referenceDate = new Date(Date.now() + liveOffset);
        const range = calculateRange(activeFrame, referenceDate);
        const rangeStart = range.startDate.getTime();
        const rangeEnd = range.endDate.getTime();

        const dRange = processedData.filter(d => d.tsMs >= rangeStart && d.tsMs <= rangeEnd);

        const absoluteLast = processedData[processedData.length - 1];
        const absoluteLastTs = absoluteLast.tsMs;
        const lastInView = dRange[dRange.length - 1] || absoluteLast;
        const prevInView = dRange.length > 1 ? dRange[dRange.length - 2] : lastInView;
        const firstInView = dRange[0] || lastInView;

        return assembleFinalStats(
            processedData,
            dRange,
            lastInView,
            prevInView,
            firstInView,
            absoluteLastTs,
            range.startDate,
            range.endDate,
            activeFrame
        );
    }

    toggleKpiCharts(kpiId) {
        this.chartCtrl.toggleKpiCharts(kpiId);
    }

    renderKpis(stats) {
        TemplateManager.render('kpi-expert', this.prepareKPIs(stats), TemplateManager.kpiCard);
    }

    openParameterEditor(kpiId) {
        const kpi = CONFIG.KPIS.find(item => item.id === kpiId && item.editableParameters?.length);
        if (!kpi || !this.lastStats?.absoluteLast) return;

        openParameterEditorDialog(kpi, this.lastStats, (values, status) => submitParameterUpdate(values, status));
    }

    _setupTimeFilters() {
        const frames = Object.keys(CONFIG.TIME_FRAMES);
        TemplateManager.render('filter-group', frames, (key) => {
            return TemplateManager.filterBtn(key, key === this.state.activeFrame);
        });
    }

    setupEventListeners() {
        const kpiContainer = document.getElementById('kpi-expert');
        kpiContainer.addEventListener('click', event => {
            const editButton = event.target.closest('[data-kpi-edit]');
            if (editButton) {
                this.openParameterEditor(editButton.dataset.kpiEdit);
                return;
            }

            const toggleButton = event.target.closest('[data-kpi-toggle]');
            if (toggleButton) this.toggleKpiCharts(toggleButton.dataset.kpiToggle);
        });

        document.getElementById('filter-group').onclick = (e) => {
            const btn = e.target.closest('button');
            if (btn && btn.dataset.frame && !this.state.isLoading) {
                const frameKey = btn.dataset.frame;

                this.setLoading(true);

                setTimeout(() => {
                    this.state.activeFrame = frameKey;
                    this.state.liveOffset = 0;
                    this._setupTimeFilters();
                    this.render();
                    this.setLoading(false);
                }, CONFIG.NAVIGATION.FRAME_SWITCH_DELAY_MS);
            }
        };
    }

    render() {
        if (!this.state.processedData.length) return;

        const stats = this.getProcessedStats();
        if (!stats) {
            this.setLoading(false);
            return;
        }

        this.updateDateNavigator(stats);
        this.drawHeader(stats);
        this.renderUnifiedView(stats);

        if (this.state.isLoading) {
            this.setLoading(false);
        }
    }

    setLoading(isLoading) {
        this.state.isLoading = isLoading;
        TemplateManager.toggleLoader(isLoading);
    }

    drawHeader(stats) {
        const updateInfo = document.getElementById('update-info');
        if (updateInfo) {
            updateInfo.innerHTML = TemplateManager.statusInfo(stats);
        }
    }

    renderUnifiedView(stats) {
        const { activeFrame } = this.state;

        this.lastStats = stats;
        this.renderKpis(stats);

        const roundedMax = Math.ceil(stats.displayEnd.getTime() / CONFIG.DATA.MS_PER_HOUR) * CONFIG.DATA.MS_PER_HOUR;
        const startTime = stats.displayStart.getTime();

        let historyData;
        const getHistoryData = () => {
            if (!historyData) {
                historyData = prepareHistoryData(this.state.hourlyData, activeFrame, stats.displayStart, stats.displayEnd);
            }
            return historyData;
        };

        CONFIG.CHART_CONFIG.forEach(cfg => {
            const isHistorical = cfg.id.startsWith('c-daily-');

            const frameConfig = CONFIG.TIME_FRAMES[activeFrame || '24h'];

            this.chartCtrl.setRenderJob(cfg.id, {
                title: cfg.title(stats.last),
                datasets: cfg.datasets,
                rawData: isHistorical ? getHistoryData : stats.dRange,
                options: {
                    type: isHistorical ? 'bar' : 'line',
                    unit: frameConfig.unit,
                    agg: frameConfig.agg,
                    min: startTime,
                    max: isHistorical ? null : roundedMax,
                    zones: isHistorical ? [] : stats.workZones,
                    ...cfg
                }
            });

        });

        this.chartCtrl.syncChartVisibility();
        this.chartCtrl.renderEnabledVisibleCharts();
    }

    prepareKPIs(stats) {
        return buildKpis(stats, this.chartCtrl);
    }

    toggleFullscreen(chartId) {
        this.chartCtrl.toggleFullscreen(chartId);
    }

}

const app = new App();
window.app = app;