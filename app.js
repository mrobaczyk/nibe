import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';
import { TemplateManager } from './TemplateManager.js';
import { Utils } from './utils.js';

class App {
    constructor() {
        this.state = {
            view: 'live',
            liveRange: 24,
            liveOffset: 0,
            statsType: 'daily',
            currentDate: new Date(),
            rawData: [],
            dailyStats: []
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
        setInterval(() => this.refreshData(), 300000);
    }

    async loadData() {
        try {
            const [rData, rStats] = await Promise.all([
                fetch(`data.json?t=${Date.now()}`),
                fetch(`daily_stats.json?t=${Date.now()}`)
            ]);
            this.state.rawData = await rData.json();
            this.state.dailyStats = await rStats.json();
        } catch (e) {
            console.error("Błąd ładowania danych:", e);
        }
    }

    async refreshData() {
        if (this.state.view === 'live' && this.state.liveOffset === 0) {
            await this.loadData();
            this.render();
        }
    }

    getProcessedStats() {
        const { rawData, liveRange, liveOffset } = this.state;
        if (!rawData.length) return null;

        const absoluteLast = rawData[rawData.length - 1];
        const absoluteLastTs = new Date(absoluteLast.timestamp + " UTC").getTime();
        const isOnline = (Date.now() - absoluteLastTs) < 15 * 60 * 1000;

        const referenceTime = Date.now() + liveOffset;
        const rangeMs = liveRange * 3600000;
        const startTime = referenceTime - rangeMs;

        const dRange = rawData.filter(d => {
            const ts = new Date(d.timestamp + " UTC").getTime();
            return ts >= startTime && ts <= referenceTime;
        });

        const lastInView = dRange[dRange.length - 1] || absoluteLast;
        const prevInView = dRange.length > 1 ? dRange[dRange.length - 2] : lastInView;
        const firstInView = dRange[0] || lastInView;

        const startDate = new Date("2025-12-29T00:00:00Z");
        const daysSinceStart = Math.max(1, Math.floor((absoluteLastTs - startDate.getTime()) / 86400000));

        const rangeLabel = liveRange > 24 ? `${liveRange / 24}d` : `${liveRange}h`;

        return {
            last: lastInView,
            prev: prevInView,
            absoluteLast: absoluteLast,
            isOnline: isOnline,
            dataCountRange: dRange.length,
            totalCount: rawData.length,
            calculated: {
                rangeLabel,
                diffStarts: lastInView.starts - firstInView.starts,
                diffWork: (lastInView.op_time_total - firstInView.op_time_total).toFixed(0),
                diffKwh: (
                    (lastInView.kwh_heating - firstInView.kwh_heating) +
                    (lastInView.kwh_cwu - firstInView.kwh_cwu)
                ).toFixed(1),
                ratio: lastInView.starts > 0 ? (lastInView.op_time_total / lastInView.starts).toFixed(2) : 0,
                cwuPercent: lastInView.op_time_total > 0 ? ((lastInView.op_time_hotwater / lastInView.op_time_total) * 100).toFixed(1) : 0,
                avgStarts: (absoluteLast.starts / daysSinceStart).toFixed(1),
                avgWork: (absoluteLast.op_time_total / daysSinceStart).toFixed(1),
                avgKwh: (absoluteLast.kwh_heating / daysSinceStart).toFixed(1),
                daysTotal: daysSinceStart
            }
        };
    }

    getTrendIcon(current, previous) {
        const diff = current - previous;
        if (diff > 0.1) return '<span class="text-red-500 ml-1">↑</span>';
        if (diff < -0.1) return '<span class="text-blue-500 ml-1">↓</span>';
        return '<span class="text-slate-600 ml-1">→</span>';
    }

    createChartsContainers() {
        const views = [
            { id: 'live-view', config: CONFIG.CHART_CONFIG },
            { id: 'stats-view', config: CONFIG.DAILY_CONFIG }
        ];

        views.forEach(view => {
            if (view.config) {
                TemplateManager.render(view.id, view.config, TemplateManager.chartCard);
            }
        });
    }

    setupEventListeners() {
        // Widok (Live/Analityka)
        document.getElementById('view-selector').onclick = (e) => {
            const btn = e.target.closest('button');
            if (btn) {
                this.state.view = btn.dataset.view;
                this.state.liveOffset = 0;
                this.render();
            }
        };

        // Filtry (1h, 6h...)
        document.getElementById('filter-group').onclick = (e) => {
            const btn = e.target.closest('button');
            if (btn) {
                this.state.liveRange = parseInt(btn.dataset.hrs);
                this.state.liveOffset = 0;
                this.render();
            }
        };

        document.getElementById('stats-filter-group').onclick = (e) => {
            const btn = e.target.closest('button');
            if (btn) {
                this.state.statsType = btn.dataset.type;
                this.render();
            }
        };

        // Nawigacja strzałkami
        document.getElementById('prev-period').onclick = () => this.handleNav(-1);
        document.getElementById('next-period').onclick = () => this.handleNav(1);
    }

    handleNav(dir) {
        if (this.state.view === 'live') {
            this.state.liveOffset += (dir * this.state.liveRange * 3600000);
            if (this.state.liveOffset > 0) this.state.liveOffset = 0;
        } else {
            const now = new Date();
            const nextDate = new Date(this.state.currentDate);

            if (this.state.statsType === 'daily') {
                nextDate.setMonth(nextDate.getMonth() + dir);
                if (dir > 0 && (nextDate.getFullYear() > now.getFullYear() ||
                    (nextDate.getFullYear() === now.getFullYear() && nextDate.getMonth() > now.getMonth()))) {
                    return;
                }
            } else {
                nextDate.setFullYear(nextDate.getFullYear() + dir);
                if (dir > 0 && nextDate.getFullYear() > now.getFullYear()) {
                    return;
                }
            }
            this.state.currentDate = nextDate;
        }
        this.render();
    }

    render() {
        const stats = this.getProcessedStats();
        if (!stats) return;

        this.updateUIComponents(stats);

        if (this.state.view === 'live') {
            this.renderLiveView(stats);
        } else {
            this.renderStatsView();
        }
    }

    updateUIComponents(stats) {
        const isLive = this.state.view === 'live';

        document.getElementById('live-view').classList.toggle('hidden', !isLive);
        document.getElementById('stats-view').classList.toggle('hidden', isLive);
        document.getElementById('filter-group').classList.toggle('hidden', !isLive);
        document.getElementById('stats-filter-group').classList.toggle('hidden', isLive);

        this.drawHeader(stats);

        document.querySelectorAll('button').forEach(btn => {
            const active = (
                btn.dataset.view === this.state.view ||
                btn.dataset.hrs == this.state.liveRange ||
                btn.dataset.type === this.state.statsType
            );
            btn.classList.toggle('active-btn', active);
        });
    }

    drawHeader(stats) {
        const labelEl = document.getElementById('current-period-label');

        // Zmieniamy selektor na Twoje ID z index.html
        const navNextBtn = document.getElementById('next-period');
        const now = new Date();

        let isCurrent = false;

        if (this.state.view === 'live') {
            labelEl.innerText = Utils.formatDate(stats?.last?.timestamp, "friendly");
            isCurrent = this.state.liveOffset === 0;
        } else {
            let labelText = "";
            if (this.state.statsType === 'daily') {
                labelText = this.state.currentDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
                isCurrent = this.state.currentDate.getMonth() === now.getMonth() &&
                    this.state.currentDate.getFullYear() === now.getFullYear();
            } else {
                labelText = this.state.currentDate.getFullYear().toString();
                isCurrent = this.state.currentDate.getFullYear() === now.getFullYear();
            }
            labelEl.innerText = labelText.toUpperCase();
        }

        labelEl.className = `text-[11px] font-black min-w-[110px] text-center uppercase tracking-tight ${isCurrent ? 'text-emerald-500' : 'text-blue-400'}`;

        if (navNextBtn) {
            if (isCurrent) {
                navNextBtn.style.opacity = "0.2";
                navNextBtn.style.pointerEvents = "none";
                navNextBtn.style.cursor = "default";
            } else {
                navNextBtn.style.opacity = "1";
                navNextBtn.style.pointerEvents = "auto";
                navNextBtn.style.cursor = "pointer";
            }
        }

        const updateInfo = document.getElementById('update-info');
        if (updateInfo) {
            updateInfo.innerHTML = TemplateManager.statusInfo(stats);
        }
    }

    renderLiveView(stats) {
        // 1. Wyciągamy potrzebne zmienne ze stanu (DODANO liveRange i liveOffset)
        const { rawData, liveRange, liveOffset } = this.state;

        // Obliczenia okna czasowego
        const endTime = Date.now() + liveOffset;
        const startTime = endTime - (liveRange * 3600000);

        // Filtrowanie danych
        const filtered = rawData.filter(d => {
            const ts = new Date(d.timestamp + " UTC").getTime();
            return ts >= startTime && ts <= endTime;
        });

        // 2. Przygotowanie stref pracy (tła dla wykresów)
        const zones = this.prepareWorkZones(filtered);

        // 3. Renderowanie KPI (Górne karty)
        const kpis = CONFIG.getKPIs(stats.last, stats.calculated);
        TemplateManager.render('kpi-expert', kpis, TemplateManager.kpiCard);

        // 4. Renderowanie Trendów
        if (stats.last && stats.prev) {
            const trends = CONFIG.getTrendKPIs(stats.last, stats.prev, this.getTrendIcon.bind(this));
            TemplateManager.render('kpi-trends', trends, TemplateManager.trendRow);
        }

        // 5. Renderowanie Wykresów (Zaktualizowane o poprawne zmienne)
        CONFIG.CHART_CONFIG.forEach(cfg => {
            const title = typeof cfg.title === 'function' ? cfg.title(stats.last) : cfg.title;

            this.chartMgr.draw(cfg.id, title, cfg.datasets, {
                rawData: filtered,
                zones: zones,
                hrs: liveRange,      // Ta zmienna jest już teraz zdefiniowana wyżej
                yMin: cfg.yMin,
                yMax: cfg.yMax,
                // Przekazujemy sztywne granice czasu, by wykresy nie "pływały" względem siebie
                min: startTime,
                max: endTime
            });
        });
    }

    renderStatsView() {
        const { dailyStats, statsType, currentDate } = this.state;
        if (!dailyStats || !dailyStats.length) return;

        let dataToRender = [];

        if (statsType === 'daily') {
            // Widok miesięczny (dzień po dniu)
            const monthKey = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
            dataToRender = dailyStats.filter(s => s.date.startsWith(monthKey));
        } else {
            // Widok roczny (agregacja do miesięcy)
            const yearKey = currentDate.getFullYear().toString();
            const months = {};

            dailyStats.filter(s => s.date.startsWith(yearKey)).forEach(d => {
                const m = d.date.substring(0, 7) + "-01";
                if (!months[m]) {
                    months[m] = { date: m, _temp_sum: 0, _days_count: 0 };
                }

                // Automatyczne sumowanie wszystkich pól liczbowych (starts, kwh, work_hours itp.)
                Object.keys(d).forEach(key => {
                    if (key === 'date' || key === 'outdoor_avg') return;
                    const val = Number(d[key]);
                    if (!isNaN(val)) {
                        months[m][key] = (months[m][key] || 0) + val;
                    }
                });

                if (d.outdoor_avg !== undefined) {
                    months[m]._temp_sum += Number(d.outdoor_avg);
                    months[m]._days_count++;
                }
            });

            dataToRender = Object.values(months).map(m => {
                if (m._days_count > 0) {
                    m.outdoor_avg = Number((m._temp_sum / m._days_count).toFixed(1));
                }
                // COP wyliczamy raz dla całego miesiąca z zagregowanych sum
                const calc = (p, c) => c > 0 ? Number((p / c).toFixed(2)) : 0;
                m.cop_heating = calc(m.kwh_produced_heating, m.kwh_consumed_heating);
                m.cop_cwu = calc(m.kwh_produced_cwu, m.kwh_consumed_cwu);

                return m;
            }).sort((a, b) => a.date.localeCompare(b.date));
        }

        // --- KLUCZOWA ZMIANA: CZYSTA PĘTLA RYSOWANIA ---
        CONFIG.DAILY_CONFIG.forEach(cfg => {
            const title = typeof cfg.title === 'function' ? cfg.title() : cfg.title;

            // Nie mapujemy już datasetów! Przekazujemy je wprost z CONFIG.js
            // ChartManager sam je "przemieli" używając rawData
            this.chartMgr.draw(cfg.id, title, cfg.datasets, {
                rawData: dataToRender,
                type: 'bar',
                unit: statsType === 'daily' ? 'day' : 'month',
                stacked: !!cfg.stacked,
                showZero: true
            });
        });
    }

    prepareWorkZones(rawData) {
        // 1. Wyliczenie bazowych stanów (surowe dane)
        const zones = rawData.map((d, index, arr) => {
            const isRunning = d.compressor_hz > 0;
            const prev = index > 0 ? arr[index - 1] : d;

            let isDefrost = false;
            let isCWU = false;
            let isCO = false;

            if (isRunning) {
                isDefrost = d.supply_line_eb101 < 20;
                if (!isDefrost) {
                    const deltaBT = d.supply_line_eb101 - d.bt25_temp;
                    const bt6Rising = d.cwu_load > (prev.cwu_load + 0.1);
                    isCWU = (deltaBT > 5 || bt6Rising);
                    isCO = !isCWU;
                }
            }

            return {
                x: new Date(d.timestamp + " UTC"),
                yCO: isCO ? 1 : 0,
                yCWU: isCWU ? 1 : 0,
                yDefrost: isDefrost ? 1 : 0,
                isRunning: isRunning
            };
        });

        // 2. TUTAJ DODAJEMY DEBOUNCE (WYGŁADZANIE)
        // Przechodzimy przez wyliczone strefy i łatamy pojedyncze "dziury"
        return zones.map((z, i, arr) => {
            // Pomijamy pierwszy i ostatni element, żeby móc sprawdzić sąsiadów
            if (i > 0 && i < arr.length - 1) {
                const prev = arr[i - 1];
                const next = arr[i + 1];

                // Łatanie CWU: Jeśli przed i po było grzanie wody, to ten punkt też nim jest
                // (Zapobiega "migotaniu" koloru gdy Delta spadnie na chwilę do 4.9)
                if (prev.yCWU === 1 && next.yCWU === 1 && z.isRunning) {
                    return { ...z, yCWU: 1, yCO: 0, yDefrost: 0 };
                }

                // Łatanie CO: Jeśli przed i po było grzanie domu
                if (prev.yCO === 1 && next.yCO === 1 && z.isRunning) {
                    return { ...z, yCO: 1, yCWU: 0, yDefrost: 0 };
                }
            }
            return z;
        });
    }

    toggleFullscreen(chartId) {
        // 1. Znajdź kartę (rodzica canvasa) i siatkę
        const canvas = document.getElementById(chartId);
        const card = canvas.closest('.card');
        const grid = card.closest('.chart-grid');

        // 2. Przełącz klasy
        const isFullscreen = card.classList.toggle('is-fullscreen');
        grid.classList.toggle('has-fullscreen', isFullscreen);

        // 3. Poinformuj Chart.js o zmianie rozmiaru
        // Używamy setTimeout, aby CSS zdążył przeliczyć layout przed resize()
        const chartInstance = this.chartMgr.charts[chartId];
        if (chartInstance) {
            setTimeout(() => {
                chartInstance.resize();
            }, 50);
        }

        // Opcjonalnie: Przewiń widok do powiększonego wykresu
        if (isFullscreen) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

const app = new App();
window.app = app;