import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';

class App {
    constructor() {
        // --- 1. STAN APLIKACJI (Jedno źródło prawdy) ---
        this.state = {
            view: 'live',         // 'live' lub 'stats'
            liveRange: 24,         // godziny (1, 6, 24, 168)
            liveOffset: 0,        // przesunięcie czasu w ms
            statsType: 'daily',   // 'daily' lub 'monthly'
            currentDate: new Date(),
            rawData: [],
            dailyStats: [],
            hiddenSeries: new Set() // tu przechowamy wyłączone linie wykresów
        };

        this.chartMgr = new ChartManager();
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.render();

        // Odświeżanie co 5 minut
        setInterval(() => this.refreshData(), 300000);
    }

    // --- 2. LOGIKA DANYCH (Tylko pobieranie i mielenie) ---

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
        const firstInView = dRange[0] || lastInView;

        const startDate = new Date("2025-12-29T00:00:00Z");
        const daysSinceStart = Math.max(1, Math.floor((absoluteLastTs - startDate.getTime()) / 86400000));

        const rangeLabel = liveRange > 24 ? `${liveRange / 24}d` : `${liveRange}h`;

        return {
            last: lastInView,
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

    // --- 3. OBSŁUGA ZDARZEŃ ---

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

        // Nawigacja strzałkami
        document.getElementById('prev-period').onclick = () => this.handleNav(-1);
        document.getElementById('next-period').onclick = () => this.handleNav(1);
    }

    handleNav(dir) {
        if (this.state.view === 'live') {
            this.state.liveOffset += (dir * this.state.liveRange * 3600000);
            if (this.state.liveOffset > 0) this.state.liveOffset = 0;
        } else {
            const move = this.state.statsType === 'daily' ? 'Month' : 'FullYear';
            this.state[`currentDate`][`set${move}`](this.state.currentDate[`get${move}`]() + dir);
        }
        this.render();
    }

    // --- 4. RENDEROWANIE (Tylko wyświetlanie) ---

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
        // Przełączanie widoczności sekcji
        const isLive = this.state.view === 'live';
        document.getElementById('live-view').classList.toggle('hidden', !isLive);
        document.getElementById('stats-view').classList.toggle('hidden', isLive);
        document.getElementById('filter-group').classList.toggle('hidden', !isLive);

        // Aktualizacja nagłówka (Header)
        this.drawHeader(stats);

        // Aktywne klasy przycisków
        document.querySelectorAll('button').forEach(btn => {
            const active = (btn.dataset.view === this.state.view || btn.dataset.hrs == this.state.liveRange);
            btn.classList.toggle('active-btn', active);
        });
    }

    drawHeader(stats) {
        const labelEl = document.getElementById('current-period-label');
        const updateInfo = document.getElementById('update-info');

        const isCurrent = this.state.liveOffset === 0;
        const viewDate = new Date(Date.now() + this.state.liveOffset);

        const dateString = viewDate.toLocaleDateString('pl-PL', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });

        labelEl.innerText = dateString.toUpperCase();

        if (isCurrent) {
            labelEl.className = "text-[11px] font-black min-w-[120px] text-center uppercase tracking-tight text-emerald-500";
        } else {
            labelEl.className = "text-[11px] font-black min-w-[120px] text-center uppercase tracking-tight text-blue-400";
        }

        const statusIconColor = stats.isOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500';

        updateInfo.innerHTML = `
        <div class="flex flex-col border-r border-slate-800 pr-3">
            <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full ${statusIconColor}"></div>
                <span class="font-mono text-[11px] ${stats.isOnline ? 'text-white' : 'text-red-400'}">${stats.absoluteLast.timestamp}</span>
            </div>
            <div class="flex gap-2 text-[9px] font-bold text-slate-500 uppercase mt-1">
                <span>Baza: <span class="text-slate-300">${stats.totalCount}</span></span>
                <span>${stats.calculated.rangeLabel}: <span class="text-emerald-500">+${stats.dataCountRange}</span></span>
            </div>
        </div>
    `;
    }

    renderLiveView(stats) {
        // Filtrowanie danych do wykresów
        const endTime = Date.now() + this.state.liveOffset;
        const startTime = endTime - (this.state.liveRange * 3600000);
        const filtered = this.state.rawData.filter(d => {
            const ts = new Date(d.timestamp + " UTC").getTime();
            return ts >= startTime && ts <= endTime;
        });

        // KPI
        document.getElementById('kpi-expert').innerHTML = CONFIG.getKPIs(stats.last, stats.calculated).map(k => `
            <div class="kpi-card border border-slate-800 bg-slate-900/50 p-2 rounded">
                <div class="text-[9px] uppercase font-black text-slate-500">${k.t}</div>
                <div class="text-lg font-mono font-black ${k.c}">${k.v}</div>
                <div class="text-[9px] text-slate-400 font-bold">${k.u}</div>
            </div>
        `).join('');

        // Wykresy
        CONFIG.CHART_CONFIG.forEach(cfg => {
            const datasets = cfg.datasets.map(ds => ({
                l: ds.l,
                c: ds.c,
                h: ds.h,
                s: ds.s,
                d: this.chartMgr.mapData(filtered, typeof ds.d === 'function' ? (i) => ds.d(k => i[k]) : ds.k, ds.s !== false)
            }));

            this.chartMgr.draw(cfg.id, cfg.title(stats.last), datasets, {
                min: new Date(startTime),
                max: new Date(endTime),
                hrs: this.state.liveRange
            });
        });
    }

    renderStatsView() {
        const { dailyStats, statsType, currentDate } = this.state;
        if (!dailyStats.length) return;

        let dataToRender = [];

        // 1. Grupowanie danych (Dni w miesiącu vs Miesiące w roku)
        if (statsType === 'daily') {
            // Filtrujemy tylko dni z wybranego miesiąca (np. "2026-03")
            const monthKey = currentDate.toISOString().slice(0, 7);
            dataToRender = dailyStats.filter(s => s.date.startsWith(monthKey));
        } else {
            // Agregacja dni do pełnych miesięcy dla wybranego roku
            const yearKey = currentDate.getFullYear().toString();
            const months = {};

            dailyStats.filter(s => s.date.startsWith(yearKey)).forEach(d => {
                const m = d.date.substring(0, 7) + "-01"; // Klucz pierwszego dnia miesiąca
                if (!months[m]) months[m] = { date: m, starts: 0, work_hours: 0, kwh_total: 0, kwh_cwu: 0 };

                months[m].starts += d.starts;
                months[m].work_hours += d.work_hours;
                months[m].kwh_total += d.kwh_total;
                months[m].kwh_cwu += d.kwh_cwu;
            });
            dataToRender = Object.values(months).sort((a, b) => a.date.localeCompare(b.date));
        }

        // 2. Renderowanie wykresów słupkowych (Bar Charts) z CONFIG.DAILY_CONFIG
        CONFIG.DAILY_CONFIG.forEach(cfg => {
            const datasets = cfg.datasets.map(ds => ({
                l: ds.l,
                c: ds.c,
                // Mapujemy dane: x to data, y to wartość z klucza (lub funkcji)
                d: dataToRender.map(d => ({
                    x: d.date,
                    y: typeof ds.k === 'function' ? ds.k(d) : d[ds.k]
                }))
            }));

            this.chartMgr.draw(cfg.id, cfg.title, datasets, {
                type: 'bar', // Wymuszamy typ słupkowy dla analityki
                unit: statsType === 'daily' ? 'day' : 'month'
            });
        });
    }
}

new App();