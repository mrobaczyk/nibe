import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';
import { TemplateManager } from './TemplateManager.js';
import { Utils } from './utils.js';
import { ChartController } from './chartController.js';
import { openParameterEditorDialog, submitParameterUpdate } from './parameterEditor.js';
import {
    fillMissingData,
    processRawData,
    calculateRange,
    assembleFinalStats,
} from './dataProcessing.js';

class App {
    constructor() {
        this.state = {
            isLoading: true,
            activeFrame: CONFIG.DEFAULTS.ACTIVE_FRAME || '24h',
            liveOffset: 0,
            currentDate: new Date(),
            rawData: [],
            hourlyData: []
        };

        this.chartMgr = new ChartManager();
        this.chartStates = {};
        this.chartCtrl = new ChartController(this.chartMgr, {
            getActiveFrame: () => this.state.activeFrame,
            onPreferenceChange: () => { if (this.lastStats) this.renderKpis(this.lastStats); }
        });
        this.lastStats = null;
        this.init();
    }

    async init() {
        await this.loadData();
        this.chartCtrl.createChartsContainers();
        this.chartCtrl.setupChartObserver();
        this._setupTimeFilters();
        this.setupEventListeners();
        this.setupFilterScroll();
        this.render();

        // Odświeżanie co 5 minut
        setInterval(() => this.refreshData(), CONFIG.refreshIntervalMs);
    }

    async loadData() {
        try {
            const [rData, rHourly] = await Promise.all([
                fetch(`${CONFIG.DATA.STREAM}?t=${Date.now()}`),
                fetch(`${CONFIG.DATA.HOURLY}?t=${Date.now()}`)
            ]);

            const rawJson = await this.parseFlexibleJSON(rData);
            this.state.hourlyData = await this.parseFlexibleJSON(rHourly);

            this.state.rawData = fillMissingData(rawJson);

            if (this.state.rawData.length > 0) {
                this.state.last = this.state.rawData[this.state.rawData.length - 1];
            }

        } catch (e) {
            console.error("Krytyczny błąd ładowania danych:", e);
        }
    }

    async parseFlexibleJSON(response) {
        const text = await response.text();
        const trimmed = text.trim();

        if (!trimmed) return [];

        if (trimmed.startsWith('[')) {
            try {
                return JSON.parse(trimmed);
            } catch (e) {
                console.error("Błąd parsowania standardowego JSON:", e);
                return [];
            }
        }

        return trimmed.split('\n')
            .filter(line => line.trim().length > 0)
            .map((line, index) => {
                try {
                    return JSON.parse(line);
                } catch (err) {
                    console.warn(`Błąd w linii ${index + 1}:`, err);
                    return null;
                }
            })
            .filter(item => item !== null);
    }

    async refreshData() {
        if (this.state.liveOffset === 0) {
            await this.loadData();
            this.render();
        }
    }

    moveRange(type, direction) {
        const config = CONFIG.TIME_FRAMES[this.state.activeFrame];
        const currentHrs = config.hrs;

        // 1. Obliczamy krok w milisekundach
        let stepMs;
        if (currentHrs <= 24) {
            // Mały krok: 1h, Duży krok: 24h (1 dzień)
            stepMs = (type === 'small' ? 1 : 24) * 3600000;
        } else {
            // Zakresy długie: Mały 1d, Duży 7d
            stepMs = (type === 'small' ? 24 : 168) * 3600000;
        }

        // 2. Obliczamy nowy offset
        // Po prostu dodajemy/odejmujemy krok do obecnego przesunięcia
        let newOffset = this.state.liveOffset + (stepMs * direction);

        // 3. Wyrównywanie (opcjonalne, ale tylko do pełnych godzin, żeby nie było minutowych ułamków)
        // Pobieramy absolutny czas końcowy, jaki by wyszedł
        let absoluteEnd = Date.now() + newOffset;
        let date = new Date(absoluteEnd);

        // Równamy tylko minuty i sekundy do zera, żeby okno 8h było "czyste" (np. od 14:00 do 22:00)
        date.setMinutes(0, 0, 0);

        // Ponownie obliczamy offset po wyrównaniu minuty
        newOffset = date.getTime() - Date.now();

        // 4. Blokada przyszłości
        if (newOffset > -60000) newOffset = 0;

        // 5. Zapis i render
        this.state.liveOffset = newOffset;

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

            const roundedEnd = Math.ceil(stats.displayEnd.getTime() / 3600000) * 3600000;
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
        const { rawData, activeFrame, liveOffset } = this.state;
        if (!rawData.length) return null;

        const referenceDate = new Date(Date.now() + liveOffset);
        const range = calculateRange(activeFrame, referenceDate);

        const processedData = processRawData(rawData);

        const dRange = processedData.filter(d => {
            const ts = new Date(d.ts + " UTC").getTime();
            return ts >= range.startDate.getTime() && ts <= range.endDate.getTime();
        });

        const absoluteLast = processedData[processedData.length - 1];
        const absoluteLastTs = new Date(absoluteLast.ts + " UTC").getTime();
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

    renderChart(chartId) {
        this.chartCtrl.renderChart(chartId);
    }

    isChartEnabled(chartId) {
        return this.chartCtrl.isChartEnabled(chartId);
    }

    isChartAvailable(chartId) {
        return this.chartCtrl.isChartAvailable(chartId);
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
                    const range = this.calculateRange(frameKey);
                    this.state.activeFrame = frameKey;
                    this.state.startDate = range.startDate;
                    this.state.endDate = range.endDate;
                    this.state.liveOffset = 0;
                    this._setupTimeFilters();
                    this.render();
                    this.setLoading(false);
                }, 20);
            }
        };
    }

    calculateRange(frameKey, referenceDate = new Date()) {
        return calculateRange(frameKey, referenceDate);
    }

    render() {
        if (!this.state.rawData || this.state.rawData.length === 0) return;

        const stats = this.getProcessedStats();
        if (!stats) {
            this.setLoading(false);
            return;
        }

        this.updateDateNavigator(stats);
        this.updateUIComponents(stats);
        this.renderUnifiedView(stats);

        if (this.state.isLoading) {
            this.setLoading(false);
        }
    }

    setLoading(isLoading) {
        this.state.isLoading = isLoading;
        TemplateManager.toggleLoader(isLoading);
    }

    updateUIComponents(stats) {
        this.drawHeader(stats);
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

        const roundedMax = Math.ceil(stats.displayEnd.getTime() / 3600000) * 3600000;
        const startTime = stats.displayStart.getTime();

        let historyData;
        const getHistoryData = () => {
            if (!historyData) {
                historyData = this.prepareHistoryData(stats.displayStart, stats.displayEnd);
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

    prepareHistoryData(minDate, maxDate) {
        const { hourlyData, activeFrame } = this.state;
        const config = CONFIG.TIME_FRAMES[activeFrame || '24h'];

        const startTime = minDate.getTime();
        const endTime = maxDate.getTime();

        const filtered = hourlyData.filter(d => {
            const dateStr = d.ts.includes("UTC") ? d.ts : d.ts.replace(/-/g, "/") + " UTC";
            const itemTs = new Date(dateStr).getTime();
            return itemTs >= startTime && itemTs <= endTime;
        });

        let result = filtered.map(d => ({
            ...d,
            ts: new Date(d.ts.replace(/-/g, "/") + " UTC")
        }));

        if (config.agg === 'daily') {
            result = Utils.aggregateHourlyToDaily(result);
        } else if (config.agg === 'monthly') {
            result = Utils.aggregateHourlyToMonthly(result);
        }

        return result.sort((a, b) => a.ts - b.ts);
    }

    prepareKPIs(stats) {
        return CONFIG.KPIS.map(kpi => {
            const chartIds = CONFIG.CHART_CONFIG.filter(chart => chart.kpiId === kpi.id).map(chart => chart.id);
            const chartAvailable = chartIds.some(chartId => this.isChartAvailable(chartId));
            let trendHtml = '';

            if (kpi.trendKey && stats.last && stats.dRange) {
                const curr = stats.last[kpi.trendKey];
                const trendDelta = Utils.getTrendDelta(
                    stats.dRange,
                    stats.last,
                    kpi.trendKey,
                    CONFIG.trendWindowMinutes * 60_000,
                    CONFIG.refreshIntervalMs * 2
                );
                const prev = Number.isFinite(trendDelta) ? curr - trendDelta : undefined;
                trendHtml = Utils.getTrendIcon(curr, prev);
            }

            return {
                ...kpi,
                chartIds,
                chartAvailable,
                editableParameters: (kpi.editableParameters || []).map(parameter => ({
                    ...parameter,
                    currentValue: stats.absoluteLast?.[parameter.field]
                })),
                v: kpi.v(stats),
                u: kpi.u(stats),
                c: kpi.dynamicClass ? kpi.dynamicClass(stats) : kpi.c,
                chartEnabled: chartAvailable && this.chartCtrl.chartPreferences[kpi.id],
                trendWindowMinutes: kpi.trendKey ? CONFIG.trendWindowMinutes : undefined,
                trend: trendHtml // Dodajemy wygenerowany HTML ikony
            };
        });
    }

    toggleFullscreen(chartId) {
        this.chartCtrl.toggleFullscreen(chartId);
    }

    setupFilterScroll() {
        const slider = document.getElementById('filter-group');
        if (!slider) return;

        let isDown = false;
        let startX;
        let scrollLeft;

        // 1. Przewijanie kółkiem myszy
        slider.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                slider.scrollLeft += e.deltaY;
            }
        });

        // 2. Przeciąganie myszką (Drag to scroll)
        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
            slider.style.cursor = 'grabbing';
        });

        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.style.cursor = 'grab';
        });

        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.style.cursor = 'grab';
        });

        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 2; // Prędkość przewijania
            slider.scrollLeft = scrollLeft - walk;
        });
    };
}

const app = new App();
window.app = app;