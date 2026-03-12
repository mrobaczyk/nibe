import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';
import { TemplateManager } from './TemplateManager.js';
import { Utils } from './utils.js';

class App {
    constructor() {
        this.state = {
            currentRange: '24h', // Klucz z CONFIG.TIME_FRAMES
            rawData: [],
            hourlyData: [],
            last: null
        };

        this.chartMgr = new ChartManager();
        this.init();
    }

    async init() {
        await this.loadData();
        this.createChartsContainers();
        this.setupEventListeners();
        this.render();

        // Odświeżanie co 5 minut
        setInterval(() => this.refreshData(), CONFIG.refreshInterval);
    }

    async loadData() {
        try {
            const [rData, rHourly] = await Promise.all([
                fetch(`data.json?t=${Date.now()}`),
                fetch(`hourly_stats.json?t=${Date.now()}`)
            ]);

            this.state.rawData = await rData.json();
            this.state.hourlyData = await rHourly.json();

            if (this.state.rawData.length > 0) {
                this.state.last = this.state.rawData[this.state.rawData.length - 1];
            }
        } catch (e) {
            console.error("Błąd ładowania danych:", e);
        }
    }

    async refreshData() {
        // Odświeżamy tylko jeśli jesteśmy na "bieżącym" czasie (brak offsetu wstecznego)
        await this.loadData();
        this.render();
    }

    // --- LOGIKA FILTROWANIA ---
    filterDataByRange(data, rangeKey, isHourly = false) {
        const config = CONFIG.TIME_FRAMES[rangeKey];
        if (!config) return data;

        const now = new Date();
        const startTime = new Date(now.getTime() - (config.hrs * 60 * 60 * 1000));

        return data.filter(item => {
            const dateStr = isHourly ? item.date : item.timestamp;
            if (!dateStr) return false;
            // Obsługa formatu daty dla JS
            const itemDate = new Date(dateStr.replace(/-/g, "/"));
            return itemDate >= startTime;
        });
    }

    createChartsContainers() {
        // Renderujemy kontenery dla obu typów wykresów na jednym ekranie
        TemplateManager.render('live-view', CONFIG.CHART_CONFIG, TemplateManager.chartCard);
        TemplateManager.render('stats-view', CONFIG.DAILY_CONFIG, TemplateManager.chartCard);
    }

    setupEventListeners() {
        // Obsługa wspólnego Toolbaru filtrów
        document.getElementById('filter-group').onclick = (e) => {
            const btn = e.target.closest('button');
            if (btn && btn.dataset.range) {
                this.state.currentRange = btn.dataset.range;
                this.render();
            }
        };

        // Fullscreen i inne eventy...
        window.toggleFullscreen = (id) => this.toggleFullscreen(id);
    }

    render() {
        if (!this.state.rawData.length) return;

        const rangeKey = this.state.currentRange;
        const config = CONFIG.TIME_FRAMES[rangeKey];

        // 1. Filtrowanie danych
        const filteredRaw = this.filterDataByRange(this.state.rawData, rangeKey, false);
        const filteredHourly = this.filterDataByRange(this.state.hourlyData, rangeKey, true);

        // 2. Obliczanie statystyk do kafelków (KPI) na podstawie wyfiltrowanych danych RAW
        const stats = this.calculateKPIs(filteredRaw);
        this.updateUI(stats, rangeKey);

        // 3. Rysowanie wykresów LINIOWYCH (Precyzyjne - data.json)
        const zones = this.prepareWorkZones(filteredRaw);
        const now = Date.now();
        const startTime = now - (config.hrs * 60 * 60 * 1000);

        CONFIG.CHART_CONFIG.forEach(cfg => {
            this.chartMgr.draw(cfg.id, cfg.title, cfg.datasets, {
                rawData: filteredRaw,
                zones: zones,
                hrs: config.hrs,
                min: startTime,
                max: now
            });
        });

        // 4. Rysowanie wykresów SŁUPKOWYCH (Statystyczne - hourly_stats.json)
        CONFIG.DAILY_CONFIG.forEach(cfg => {
            this.chartMgr.draw(cfg.id, cfg.title, cfg.datasets, {
                rawData: filteredHourly,
                type: 'bar',
                unit: config.hrs <= 24 ? 'hour' : 'day', // Inteligentna skala czasu
                stacked: !!cfg.stacked,
                showZero: true
            });
        });
    }

    calculateKPIs(filteredData) {
        if (!filteredData.length) return null;

        const first = filteredData[0];
        const last = filteredData[filteredData.length - 1];

        return {
            last: last,
            calculated: {
                diffStarts: last.starts - first.starts,
                diffWork: (last.op_time_total - first.op_time_total).toFixed(1),
                diffKwh: (
                    (last.kwh_heating - first.kwh_heating) +
                    (last.kwh_cwu - first.kwh_cwu)
                ).toFixed(1),
                avgOutdoor: (filteredData.reduce((sum, d) => sum + (d.outdoor || 0), 0) / filteredData.length).toFixed(1)
            }
        };
    }

    updateUI(stats, rangeKey) {
        // Aktualizacja nagłówka i statusu online
        const labelEl = document.getElementById('current-period-label');
        if (labelEl) labelEl.innerText = `ZAKRES: ${rangeKey.toUpperCase()}`;

        // KPI Expert Card
        const kpis = CONFIG.getKPIs(stats.last, stats.calculated);
        TemplateManager.render('kpi-expert', kpis, TemplateManager.kpiCard);

        // Podświetlanie aktywnych przycisków
        document.querySelectorAll('#filter-group button').forEach(btn => {
            btn.classList.toggle('active-btn', btn.dataset.range === rangeKey);
        });
    }

    // --- Twoje metody pomocnicze (bez zmian) ---
    prepareWorkZones(rawData) { /* Twój kod prepareWorkZones */ }
    toggleFullscreen(chartId) { /* Twój kod toggleFullscreen */ }
}

const app = new App();
window.app = app;