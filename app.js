import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';

class App {
    constructor() {
        this.chartMgr = new ChartManager();
        this.rawData = [];
        this.dailyStats = [];

        // Stan aplikacji
        this.view = 'live';
        this.currentHrs = 6;
        this.statsType = 'daily';

        // Offset dla trybu LIVE (w milisekundach). 0 = teraz.
        this.liveOffset = 0;

        // Kontekst daty dla Analityki
        this.currentDate = new Date();

        this.init();
    }

    async init() {
        await this.loadAllData();
        this.setupEventListeners();
        this.render();

        // Auto-odświeżanie danych co 5 minut (zgodnie z Twoim interwałem)
        setInterval(() => {
            if (this.view === 'live' && this.liveOffset === 0) {
                this.loadAllData().then(() => this.render());
            }
        }, 300000);
    }

    async loadAllData() {
        try {
            const [rData, rStats] = await Promise.all([
                fetch('data.json?nocache=' + Date.now()),
                fetch('daily_stats.json?nocache=' + Date.now())
            ]);
            this.rawData = await rData.json();
            this.dailyStats = await rStats.json();
        } catch (e) {
            console.error("Błąd krytyczny ładowania danych:", e);
        }
    }

    getTrendIcon(current, previous) {
        const diff = current - previous;
        if (diff > 0.1) return '<span class="text-red-500 ml-1">↑</span>';
        if (diff < -0.1) return '<span class="text-blue-500 ml-1">↓</span>';
        return '<span class="text-slate-600 ml-1">→</span>';
    }

    setupEventListeners() {
        // Widok główny
        document.getElementById('view-selector').onclick = (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            this.view = btn.dataset.view;
            this.liveOffset = 0; // Resetuj pozycję przy zmianie widoku
            this.updateButtonUI('#view-selector', btn);
            this.render();
        };

        // Filtry LIVE (1h, 6h, itd.)
        document.getElementById('filter-group').onclick = (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            this.currentHrs = parseInt(btn.dataset.hrs);
            this.liveOffset = 0; // Resetuj do "teraz" przy zmianie zakresu
            this.updateButtonUI('#filter-group', btn);
            this.render();
        };

        // Agregacja Analityki
        document.getElementById('aggregation-selector').onclick = (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            this.statsType = btn.dataset.type;
            this.updateButtonUI('#aggregation-selector', btn);
            this.render();
        };

        // Nawigacja strzałkami SVG
        document.getElementById('prev-period').onclick = () => this.handleNavigation(-1);
        document.getElementById('next-period').onclick = () => this.handleNavigation(1);
    }

    handleNavigation(direction) {
        if (this.view === 'live') {
            // Przesuwamy okno o tyle godzin, ile wynosi obecny filtr
            const stepMs = this.currentHrs * 60 * 60 * 1000;
            this.liveOffset += (direction * stepMs);
            if (this.liveOffset > 0) this.liveOffset = 0; // Nie wykraczaj w przyszłość
        } else {
            if (this.statsType === 'daily') {
                this.currentDate.setMonth(this.currentDate.getMonth() + direction);
            } else {
                this.currentDate.setFullYear(this.currentDate.getFullYear() + direction);
            }
        }
        this.render();
    }

    updateButtonUI(containerId, activeBtn) {
        document.querySelectorAll(`${containerId} button`).forEach(b => {
            b.classList.remove('active-btn', 'text-white');
            b.classList.add('text-slate-500');
        });
        activeBtn.classList.add('active-btn', 'text-white');
        activeBtn.classList.remove('text-slate-500');
    }

    updateHeaderUI() {
        const labelEl = document.getElementById('current-period-label');
        const updateInfo = document.getElementById('update-info');

        if (this.view === 'live') {
            if (this.liveOffset === 0) {
                labelEl.innerText = "NA ŻYWO";
                labelEl.className = "text-[11px] font-black min-w-[110px] text-center uppercase tracking-tight text-emerald-500 animate-pulse";
            } else {
                const dateAtOffset = new Date(Date.now() + this.liveOffset);
                labelEl.innerText = dateAtOffset.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                labelEl.className = "text-[11px] font-black min-w-[110px] text-center uppercase tracking-tight text-blue-400";
            }
        } else {
            labelEl.className = "text-[11px] font-black min-w-[110px] text-center uppercase tracking-tight text-blue-400";
            labelEl.innerText = this.statsType === 'daily'
                ? this.currentDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
                : this.currentDate.getFullYear();
        }

        // Status ostatniego odczytu
        if (this.rawData.length) {
            const last = this.rawData[this.rawData.length - 1];
            const lastTs = new Date(last.timestamp + " UTC");
            const isOnline = (new Date() - lastTs) < 15 * 60 * 1000;
            updateInfo.innerHTML = `
                <div class="w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500'}"></div>
                <span class="${isOnline ? 'text-blue-500' : 'text-red-500'}">${last.timestamp}</span>
            `;
        }
    }

    render() {
        const isLive = this.view === 'live';
        document.getElementById('live-view').classList.toggle('hidden', !isLive);
        document.getElementById('stats-view').classList.toggle('hidden', isLive);
        document.getElementById('filter-group').classList.toggle('hidden', !isLive);
        document.getElementById('aggregation-selector').classList.toggle('hidden', isLive);

        this.updateHeaderUI();

        if (isLive) this.renderLive();
        else this.renderStats();
    }

    renderLive() {
        if (!this.rawData.length) return;

        // Oblicz ramy czasowe okna
        const endTime = Date.now() + this.liveOffset;
        const startTime = endTime - (this.currentHrs * 60 * 60 * 1000);

        const filtered = this.rawData.filter(d => {
            const ts = new Date(d.timestamp + " UTC").getTime();
            return ts >= startTime && ts <= endTime;
        });

        // Dane do KPI zawsze bierzemy z OSTATNIEGO dostępnego odczytu (nawet jeśli przesuwamy wykres)
        const last = this.rawData[this.rawData.length - 1];
        const prev = this.rawData[Math.max(0, this.rawData.length - 2)];

        // Oblicz statystyki 24h (Twój kod)
        const dayAgo = new Date(last.timestamp + " UTC").getTime() - (24 * 60 * 60 * 1000);
        const d24 = this.rawData.filter(d => new Date(d.timestamp + " UTC").getTime() >= dayAgo);
        const first24 = d24[0] || last;
        const startDate = new Date("2025-12-28T00:00:00Z");
        const daysSinceStart = Math.max(1, Math.floor((new Date(last.timestamp + " UTC") - startDate) / 86400000));

        const stats = {
            starts24: last.starts - first24.starts,
            ratio: last.starts > 0 ? (last.op_time_total / last.starts).toFixed(2) : 0,
            work24: (last.op_time_total - first24.op_time_total).toFixed(0),
            cwuPercent: last.op_time_total > 0 ? ((last.op_time_hotwater / last.op_time_total) * 100).toFixed(1) : 0,
            avgStarts: (last.starts / daysSinceStart).toFixed(1),
            avgWork: (last.op_time_total / daysSinceStart).toFixed(1),
            avgKwh: (last.kwh_heating / daysSinceStart).toFixed(1),
            kwh_heating24: last.kwh_heating - first24.kwh_heating,
            kwh_cwu24: last.kwh_cwu - first24.kwh_cwu,
            dataCount24: d24.length,
            totalCount: rawData.length,
            daysTotal: daysSinceStart
        };

        // Render KPI i Trendów
        document.getElementById('kpi-expert').innerHTML = CONFIG.getKPIs(last, stats).map(k => `
            <div class="kpi-card border border-slate-800 bg-slate-900/50 p-2 rounded">
                <div class="text-[9px] uppercase font-black text-slate-500 mb-0.5">${k.t}</div>
                <div class="text-lg font-mono font-black ${k.c}">${k.v}</div>
                <div class="text-[9px] text-slate-400 font-bold">${k.u}</div>
            </div>
        `).join('');

        document.getElementById('kpi-trends').innerHTML = CONFIG.getTrendKPIs(last, prev, this.getTrendIcon).map(k => `
            <div class="kpi-card border border-slate-800 bg-slate-900/30 p-2 rounded flex justify-between items-center">
                <div class="text-[9px] uppercase text-slate-500 font-bold">${k.t}</div>
                <div class="text-sm font-mono font-black ${k.c}">${k.v}</div>
            </div>
        `).join('');

        // Render Wykresów LIVE
        CONFIG.CHART_CONFIG.forEach(cfg => {
            const datasets = cfg.datasets.map(ds => {
                const data = typeof ds.d === 'function'
                    ? this.chartMgr.mapData(filtered, (item) => ds.d(key => item[key]), ds.s !== false)
                    : this.chartMgr.mapData(filtered, ds.k, ds.s !== false);
                return { l: ds.l, d: data, c: ds.c, h: ds.h, s: ds.s };
            });
            this.chartMgr.draw(cfg.id, cfg.title(last), datasets, {
                hrs: this.currentHrs,
                min: new Date(startTime),
                max: new Date(endTime)
            });
        });
    }

    renderStats() {
        let dataToRender = [];
        if (this.statsType === 'daily') {
            const monthKey = this.currentDate.toISOString().slice(0, 7);
            dataToRender = this.dailyStats.filter(s => s.date.startsWith(monthKey));
        } else {
            const yearKey = this.currentDate.getFullYear().toString();
            const months = {};
            this.dailyStats.filter(s => s.date.startsWith(yearKey)).forEach(d => {
                const m = d.date.substring(0, 7) + "-01";
                if (!months[m]) months[m] = { date: m, starts: 0, work_hours: 0, kwh_total: 0, kwh_cwu: 0 };
                months[m].starts += d.starts;
                months[m].work_hours += d.work_hours;
                months[m].kwh_total += d.kwh_total;
                months[m].kwh_cwu += d.kwh_cwu;
            });
            dataToRender = Object.values(months);
        }

        CONFIG.DAILY_CONFIG.forEach(cfg => {
            const datasets = cfg.datasets.map(ds => ({
                l: ds.l, c: ds.c,
                d: dataToRender.map(d => ({
                    x: d.date,
                    y: typeof ds.k === 'function' ? ds.k(d) : d[ds.k]
                }))
            }));
            this.chartMgr.draw(cfg.id, cfg.title, datasets, {
                type: 'bar',
                unit: this.statsType === 'daily' ? 'day' : 'month'
            });
        });
    }
}

new App();