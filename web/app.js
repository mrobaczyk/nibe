import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';
import { TemplateManager } from './TemplateManager.js';
import { Utils } from './utils.js';

class App {
    constructor() {
        this.state = {
            view: CONFIG.DEFAULTS.VIEW,
            liveRange: CONFIG.DEFAULTS.LIVE_RANGE,
            liveOffset: 0,
            statsType: CONFIG.DEFAULTS.STATS_TYPE,
            currentDate: new Date(),
            rawData: [],
            hourlyData: []
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
                fetch(`${CONFIG.DATA.RAW}?t=${Date.now()}`),
                fetch(`${CONFIG.DATA.HOURLY}?t=${Date.now()}`)
            ]);

            this.state.rawData = await rData.json();
            this.state.hourlyData = await rHourly.json();

            this.state.last = this.state.rawData[this.state.rawData.length - 1];

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

        // 1. Przygotuj dane z wirtualnym licznikiem
        const processedData = this.processRawData(rawData);

        // 2. Wyznacz punkty czasowe i przefiltruj zakres
        const absoluteLast = processedData[processedData.length - 1];
        const absoluteLastTs = new Date(absoluteLast.timestamp + " UTC").getTime();

        const referenceTime = Date.now() + liveOffset;
        const rangeMs = liveRange * 3600000;
        const startTime = referenceTime - rangeMs;

        const dRange = processedData.filter(d => {
            const ts = new Date(d.timestamp + " UTC").getTime();
            return ts >= startTime && ts <= referenceTime;
        });

        // 3. Wyznacz punkty odniesienia
        const lastInView = dRange[dRange.length - 1] || absoluteLast;
        const prevInView = dRange.length > 1 ? dRange[dRange.length - 2] : lastInView;
        const firstInView = dRange[0] || lastInView;

        // 4. Oblicz statystyki (delegacja do osobnej metody dla czytelności)
        return this.assembleFinalStats(processedData, dRange, lastInView, prevInView, firstInView, absoluteLastTs);
    }

    assembleFinalStats(processedData, dRange, lastInView, prevInView, firstInView, absoluteLastTs) {
        const absoluteLast = processedData[processedData.length - 1];
        const isOnline = (Date.now() - absoluteLastTs) < CONFIG.DATA.ONLINE_THRESHOLD_MS;

        const daysSinceStart = Math.max(1, Math.floor((absoluteLastTs - CONFIG.startDate.getTime()) / CONFIG.DATA.MS_PER_DAY));
        const daysSinceSync = Math.max(1, (absoluteLastTs - CONFIG.OFFSETS.date.getTime()) / (1000 * 60 * 60 * 24));

        // Produkcja 
        const totalProdCwu = Math.max(0, (Number(absoluteLast.kwh_produced_cwu) || 0) - CONFIG.OFFSETS.cwu);
        const totalProdHeating = Math.max(0, (Number(absoluteLast.kwh_produced_heating) || 0) - CONFIG.OFFSETS.heating);
        const totalProdCorrected = totalProdCwu + totalProdHeating;

        const diffProdCwu = (Number(lastInView.kwh_produced_cwu) || 0) - (Number(firstInView.kwh_produced_cwu) || 0);
        const diffProdHeating = (Number(lastInView.kwh_produced_heating) || 0) - (Number(firstInView.kwh_produced_heating) || 0);

        // Zużycie (z wirtualnych liczników)
        const totalConsAbs = absoluteLast.v_cum_total;
        const diffConsKwh = lastInView.v_cum_total - firstInView.v_cum_total;

        // Skorygowane wartości pracy (od momentu synchronizacji)
        const correctedStarts = Math.max(0, (absoluteLast.starts || 0) - CONFIG.OFFSETS.starts);
        const correctedOpTotal = Math.max(0, (absoluteLast.op_time_total || 0) - CONFIG.OFFSETS.op_time_total);
        const correctedOpCwu = Math.max(0, (absoluteLast.op_time_cwu || 0) - CONFIG.OFFSETS.op_time_cwu);

        return {
            last: lastInView,
            prev: prevInView,
            absoluteLast: absoluteLast,
            isOnline: isOnline,
            dRange: dRange,
            dataCountRange: dRange.length,
            totalCount: processedData.length,
            calculated: {
                rangeLabel: this.state.liveRange > 24 ? `${this.state.liveRange / 24}d` : `${this.state.liveRange}h`,
                dbDaysFromStart: daysSinceStart,
                dbDaysFromSync: Math.floor(daysSinceSync),

                // Produkcja
                totalKwh: totalProdCorrected.toFixed(1),
                avgKwh: (totalProdCorrected / daysSinceSync).toFixed(1),
                diffKwh: (diffProdCwu + diffProdHeating).toFixed(1),
                diffKwhCwu: diffProdCwu.toFixed(1),
                cwuKwh: totalProdCwu.toFixed(1),
                cwuPercentKwh: totalProdCorrected > 0 ? ((totalProdCwu / totalProdCorrected) * 100).toFixed(1) : 0,

                // Zużycie
                totalConsKwh: totalConsAbs.toFixed(1),
                avgConsKwh: (totalConsAbs / daysSinceSync).toFixed(1),
                diffConsKwh: diffConsKwh.toFixed(2),
                cwuConsKwh: absoluteLast.v_cum_cwu.toFixed(1),
                cwuConsPercent: totalConsAbs > 0 ? ((absoluteLast.v_cum_cwu / totalConsAbs) * 100).toFixed(1) : 0,
                currentPowerKw: lastInView.v_inst_power.toFixed(2),

                // Praca 
                totalStarts: correctedStarts,
                totalWorkHours: correctedOpTotal,
                totalCwuHours: correctedOpCwu,
                cwuPercentTime: correctedOpTotal > 0 ? ((correctedOpCwu / correctedOpTotal) * 100).toFixed(1) : 0,
                diffStarts: lastInView.starts - firstInView.starts,
                diffWork: (lastInView.op_time_total - firstInView.op_time_total).toFixed(0),

                // Ratio i średnie liczone od momentu synchronizacji
                ratio: correctedStarts > 0 ? (correctedOpTotal / correctedStarts).toFixed(2) : 0,
                avgStarts: (correctedStarts / daysSinceSync).toFixed(1),
                avgWork: (correctedOpTotal / daysSinceSync).toFixed(1),

                // COP
                totalCop: totalConsAbs > 0 ? (totalProdCorrected / totalConsAbs).toFixed(2) : 0,
                rangeCop: diffConsKwh > 0 ? ((diffProdCwu + diffProdHeating) / diffConsKwh).toFixed(2) : 0,
                daysTotal: Math.floor(daysSinceSync)
            }
        };
    }

    processRawData(rawData) {
        let runningTotalCons = 0;
        let runningTotalCwu = 0;

        return rawData.map((d, index) => {
            const prev = index > 0 ? rawData[index - 1] : d;

            const hz = Number(d.compressor_hz) || 0;
            const pump = Number(d.pump_speed) || 0;
            const out = Number(d.outdoor) || 10;

            const estKw = this.estimatePower(hz, pump, out);
            const stepKwh = estKw / 12;

            const state = this.getWorkState(d, prev);

            let stepCwu = 0;
            if (state.isRunning && state.isCWU) {
                stepCwu = stepKwh;
            }

            runningTotalCons += stepKwh;
            runningTotalCwu += stepCwu;

            d.v_inst_power = estKw;
            d.v_cum_total = runningTotalCons;
            d.v_cum_cwu = runningTotalCwu;

            return {
                ...d,
                v_cum_total: runningTotalCons,
                v_cum_cwu: runningTotalCwu,
                v_inst_power: estKw,
                workState: state
            };
        });
    }

    estimatePower(hz, pumpSpeed, tempExt) {
        if (hz < 1) return 0.02; // Standby

        const baseHzCoeff = 0.028;
        let tempCorrection = 1.0;
        if (tempExt < 10) {
            tempCorrection = 1.0 + (10 - tempExt) * 0.008;
        }

        let compressorKw = hz * baseHzCoeff * tempCorrection;
        if (tempExt < 2.0) {
            compressorKw += 0.07; // Grzanie tacki
        }

        const circPumpKw = 0.06 * (pumpSpeed / 100);
        return compressorKw + circPumpKw;
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
        // 1. Sprawdź czy dane są
        if (!this.state.rawData || this.state.rawData.length === 0) return;

        // 2. Statystyki do kafelków (to co już masz i co działa)
        const stats = this.getProcessedStats();
        if (!stats) return;

        this.updateUIComponents(stats);

        // 3. Renderuj widoki STARYM sposobem (bez przekazywania dodatkowych danych)
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
        const { rawData, liveRange, liveOffset } = this.state;

        const endTime = Date.now() + liveOffset;
        const startTime = endTime - (liveRange * 3600000);

        const filtered = rawData.filter(d => {
            const val = d.timestamp || d.date;
            if (!val) return false;
            const ts = new Date(val.replace(/-/g, "/") + " UTC").getTime();
            return ts >= startTime && ts <= endTime;
        });

        const zones = this.prepareWorkZones(filtered);

        const kpiData = this.prepareKPIs(stats);
        TemplateManager.render('kpi-expert', kpiData, TemplateManager.kpiCard);

        if (stats.last && stats.prev) {
            const trendsData = this.prepareTrends(stats.last, stats.prev);
            TemplateManager.render('kpi-trends', trendsData, TemplateManager.trendRow);
        }

        CONFIG.CHART_CONFIG.forEach(cfg => {
            const title = typeof cfg.title === 'function' ? cfg.title(stats.last) : cfg.title;

            this.chartMgr.draw(cfg.id, title, cfg.datasets, {
                rawData: filtered,
                zones: zones,
                hrs: liveRange,
                min: startTime,
                max: endTime,
                ...cfg,         // Przekazuje wszystko: id, title, datasets, p, itd.
                ...cfg.options  // Przekazuje showZero, yMin, yMax z obiektu options
            });
        });
    }

    renderStatsView() {
        const { hourlyData, statsType, currentDate } = this.state;

        // Agregacja godzin do dni
        const dailyAggregated = Utils.aggregateHourlyToDaily(hourlyData);
        let dataToRender = [];

        if (statsType === 'daily') {
            // Widok dzienny (wykres miesiąca)
            const monthKey = currentDate.toISOString().substring(0, 7);
            dataToRender = dailyAggregated.filter(s => s.date.startsWith(monthKey));
        } else {
            // WIDOK MIESIĘCZNY (wykres roku)
            const yearKey = currentDate.getFullYear().toString();
            const months = {};

            dailyAggregated.forEach(d => {
                if (!d.date.startsWith(yearKey)) return;

                const m = d.date.substring(0, 7) + "-01";
                if (!months[m]) {
                    months[m] = {
                        date: m,
                        prodH: 0, consH: 0,
                        prodC: 0, consC: 0,
                        starts: 0, whH: 0, whC: 0, // Nowe pola do sumowania
                        tempSum: 0, count: 0
                    };
                }

                const cHeating = Number(d.kwh_consumed_heating || 0);
                const cCWU = Number(d.kwh_consumed_cwu || 0);

                months[m].starts += Number(d.starts || 0);
                months[m].whH += Number(d.work_hours_heating || 0);
                months[m].whC += Number(d.work_hours_cwu || 0);

                if (cHeating > 0) {
                    months[m].prodH += Number(d.kwh_produced_heating || 0);
                    months[m].consH += cHeating;
                }

                if (cCWU > 0) {
                    months[m].prodC += Number(d.kwh_produced_cwu || 0);
                    months[m].consC += cCWU;
                }

                months[m].tempSum += Number(d.outdoor_avg || 0);
                months[m].count++;
            });

            dataToRender = Object.values(months).map(m => {
                const copH = m.consH > 0 ? (m.prodH / m.consH) : 0;
                const copC = m.consC > 0 ? (m.prodC / m.consC) : 0;

                return {
                    date: m.date,
                    kwh_produced_heating: Number(m.prodH.toFixed(1)),
                    kwh_consumed_heating: Number(m.consH.toFixed(1)),
                    kwh_produced_cwu: Number(m.prodC.toFixed(1)),
                    kwh_consumed_cwu: Number(m.consC.toFixed(1)),

                    // TE POLA SĄ POTRZEBNE DLA WYKRESU STARTÓW I CZASU PRACY:
                    starts: m.starts,
                    work_hours_heating: Number(m.whH.toFixed(1)),
                    work_hours_cwu: Number(m.whC.toFixed(1)),

                    cop_heating: Number(copH.toFixed(2)),
                    cop_cwu: Number(copC.toFixed(2)),
                    outdoor_avg: m.count > 0 ? Number((m.tempSum / m.count).toFixed(1)) : 0
                };
            }).sort((a, b) => a.date.localeCompare(b.date));
        }

        // Wywołanie rysowania wykresów
        CONFIG.DAILY_CONFIG.forEach(cfg => {
            const title = typeof cfg.title === 'function' ? cfg.title(this.state.last) : cfg.title;
            this.chartMgr.draw(cfg.id, title, cfg.datasets, {
                rawData: dataToRender,
                type: 'bar',
                unit: statsType === 'daily' ? 'day' : 'month',
                stacked: !!cfg.stacked,
                showZero: true,
            });
        });
    }

    prepareWorkZones(rawData) {
        const zones = rawData.map((d, index, arr) => {
            const prev = index > 0 ? arr[index - 1] : d;
            const state = this.getWorkState(d, prev);

            return {
                x: new Date(d.timestamp + " UTC"),
                yCO: state.isCO ? 1 : 0,
                yCWU: state.isCWU ? 1 : 0,
                yDefrost: state.isDefrost ? 1 : 0,
                isRunning: state.isRunning
            };
        });

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

    getWorkState(d, prev) {
        const isRunning = d.compressor_hz > 0;
        if (!isRunning) return { isRunning: false, isCO: false, isCWU: false, isDefrost: false };

        prev = prev || d;
        let isDefrost = d.supply_line_eb101 < 15 || d.defrosting == 1;
        let isCWU = false;
        let isCO = false;

        if (!isDefrost) {
            // Logika liczników (Priorytet)
            const prodHeatingDelta = Number(d.kwh_produced_heating || 0) - Number(prev.kwh_produced_heating || 0);
            const prodCWUDelta = Number(d.kwh_produced_cwu || 0) - Number(prev.kwh_produced_cwu || 0);

            if (prodCWUDelta > 0 && prodHeatingDelta <= 0) {
                isCWU = true;
            } else if (prodHeatingDelta > 0 && prodCWUDelta <= 0) {
                isCO = true;
            } else {
                // Rezerwa (Temperatury)
                const deltaBT = d.supply_line_eb101 - (d.bt25_temp || 0);
                const bt6Rising = d.cwu_load > ((prev.cwu_load || 0) + 0.1);
                isCWU = (deltaBT > 5 || bt6Rising);
                isCO = !isCWU;
            }
        }

        return { isRunning, isCO, isCWU, isDefrost };
    }

    prepareKPIs(stats) {
        return CONFIG.KPIS.map(kpi => ({
            ...kpi,
            v: kpi.v(stats),
            u: kpi.u(stats),
            c: kpi.dynamicClass ? kpi.dynamicClass(stats) : kpi.c
        }));
    }

    prepareTrends(last, prev) {
        return CONFIG.TRENDS.map(trend => {
            const val = last[trend.k];
            const icon = this.getTrendIcon(val, prev[trend.k]);
            return {
                ...trend,
                v: trend.display(val, icon)
            };
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