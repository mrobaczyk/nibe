import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';
import { Utils } from './utils.js';

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
        const updateInfo = document.getElementById('update-info');

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

        // Kolor tekstu (Zielony/Niebieski)
        labelEl.className = `text-[11px] font-black min-w-[110px] text-center uppercase tracking-tight ${isCurrent ? 'text-emerald-500' : 'text-blue-400'}`;

        // Aplikowanie wyszarzenia i blokady na ID: next-period
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

        const statusIconColor = stats.isOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500';
        updateInfo.innerHTML = `
            <div class="flex flex-col">
                <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full ${statusIconColor} shadow-sm"></div>
                    <span class="font-mono text-sm font-bold ${stats.isOnline ? 'text-white' : 'text-red-400'} tracking-tight">
                        ${Utils.formatDate(stats.absoluteLast.timestamp)}
                    </span>
                </div>
                <div class="flex gap-4 text-xs font-bold text-slate-500 uppercase mt-1.5 tracking-wide">
                    <span>Baza: <span class="text-slate-300 font-black">${stats.totalCount}</span></span>
                    <span class="flex items-center gap-1">
                        ${stats.calculated.rangeLabel}: 
                        <span class="text-emerald-500 font-black">+${stats.dataCountRange}</span>
                    </span>
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
            <div class="kpi-card border border-slate-800 bg-slate-900/50 p-3 rounded-xl flex flex-col gap-1 shadow-sm transition-all hover:border-slate-700">
                <div class="text-[11px] uppercase font-black text-slate-500 tracking-wider leading-none">
                    ${k.t}
                </div>

                <div class="text-lg font-mono font-black ${k.c} tracking-tighter leading-tight">
                    ${k.v}
                </div>

                <div class="text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                    ${k.u}
                </div>
            </div>
        `).join('');

        const trendsContainer = document.getElementById('kpi-trends');
        if (trendsContainer && stats.last && stats.prev) {

            // Używamy bind(this), aby funkcja getTrendIcon widziała "this" klasy App
            const trendData = CONFIG.getTrendKPIs(
                stats.last,
                stats.prev,
                this.getTrendIcon.bind(this)
            );

            trendsContainer.innerHTML = trendData.map(k => `
                <div class="flex justify-between items-center bg-slate-900/30 border border-slate-800/50 p-3 rounded-xl">
                    <div class="text-[11px] uppercase text-slate-500 font-black tracking-widest leading-none">
                        ${k.t}
                    </div>
                    <div class="text-lg font-mono font-black ${k.c} tracking-tighter flex items-center">
                        ${k.v}
                    </div>
                </div>
            `).join('');
        }

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
        if (!dailyStats || !dailyStats.length) return;

        let dataToRender = [];
        const now = new Date();

        // Filtrowanie danych (bez zmian)
        if (statsType === 'daily') {
            const monthKey = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
            dataToRender = dailyStats.filter(s => s.date.startsWith(monthKey));
        } else {
            const yearKey = currentDate.getFullYear().toString();
            const months = {};
            dailyStats.filter(s => s.date.startsWith(yearKey)).forEach(d => {
                const m = d.date.substring(0, 7) + "-01";
                if (!months[m]) months[m] = { date: m, starts: 0, work_hours: 0, kwh_total: 0, kwh_cwu: 0 };
                months[m].starts += Number(d.starts || 0);
                months[m].work_hours += Number(d.work_hours || 0);
                months[m].kwh_total += Number(d.kwh_total || 0);
                months[m].kwh_cwu += Number(d.kwh_cwu || 0);
            });
            dataToRender = Object.values(months).sort((a, b) => a.date.localeCompare(b.date));
        }

        CONFIG.DAILY_CONFIG.forEach(cfg => {
            const datasets = cfg.datasets.map(ds => ({
                l: ds.l,
                c: ds.c,
                d: dataToRender.map(d => ({
                    x: d.date,
                    y: typeof ds.k === 'function' ? ds.k(d) : Number(d[ds.k] || 0)
                }))
            }));

            const isEnergy = cfg.id === 'c-daily-energy';

            this.chartMgr.draw(cfg.id, cfg.title, datasets, {
                type: 'bar',
                unit: statsType === 'daily' ? 'day' : 'month',
                stacked: isEnergy,
                showZero: true,
                showLabels: true
            });
        });
    }
}

new App();