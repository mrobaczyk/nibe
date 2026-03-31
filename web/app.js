import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';
import { TemplateManager } from './TemplateManager.js';
import { Utils } from './utils.js';

class App {
    constructor() {
        this.state = {
            activeFrame: CONFIG.DEFAULTS.ACTIVE_FRAME || '24h',
            liveOffset: 0,
            currentDate: new Date(),
            rawData: [],
            hourlyData: []
        };

        this.chartMgr = new ChartManager();
        this.chartStates = {};
        this.init();
    }

    async init() {
        await this.loadData();
        this.createChartsContainers();
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

            this.state.rawData = this.fillMissingData(rawJson);

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

        console.log(`Przesunięcie o: ${stepMs / 3600000}h | Nowy Offset: ${this.state.liveOffset}`);

        this.render();
    }

    resetRange() {
        this.state.liveOffset = 0;
        this.render();
    }

    updateDateNavigator(stats) {
        const navContainer = document.getElementById('date-navigator');
        if (!navContainer || !stats || !stats.displayStart || !stats.displayEnd) return;

        const isLatest = this.state.liveOffset === 0;

        const startLabel = Utils.formatDate(stats.displayStart);
        const endLabel = Utils.formatDate(stats.displayEnd);

        navContainer.innerHTML = TemplateManager.dateNavigator(startLabel, endLabel, isLatest);
    }

    fillMissingData(sparseData) {
        if (!sparseData || sparseData.length === 0) return [];

        const fullData = [];
        // Pamięć ostatniego stanu (pełny obiekt)
        let lastKnownState = { ...sparseData[0] };

        // Margines błędu (np. 30 sekund), żeby drobne opóźnienia w Actions 
        // nie były traktowane jako wielka dziura w danych
        const JITTER_MS = 30000;
        const MAX_ALLOWED_GAP = CONFIG.refreshIntervalMs + JITTER_MS;

        sparseData.forEach((entry, index) => {
            const currentTime = new Date(entry.timestamp).getTime();

            if (index > 0) {
                const prevTime = new Date(fullData[fullData.length - 1].timestamp).getTime();
                const timeDiff = currentTime - prevTime;

                // 1. Jeśli różnica mieści się w interwale (+ margines)
                if (timeDiff <= MAX_ALLOWED_GAP) {
                    // Łączymy: weź wszystko z poprzedniego stanu i nadpisz nowościami z entry
                    const hydrated = { ...lastKnownState, ...entry };
                    fullData.push(hydrated);
                    lastKnownState = { ...hydrated };
                }
                // 2. Jeśli jest dziura (> 5 min + margines)
                else {
                    // Traktujemy to jako nowy "Snapshot" - nie uzupełniamy starymi danymi,
                    // bo parametry mogły się drastycznie zmienić podczas awarii.
                    fullData.push({ ...entry });
                    lastKnownState = { ...entry };
                }
            } else {
                // Pierwszy element (punkt odniesienia)
                fullData.push(entry);
            }
        });

        return fullData;
    }

    getProcessedStats() {
        const { rawData, activeFrame, liveOffset } = this.state;
        if (!rawData.length) return null;

        const referenceDate = new Date(Date.now() + liveOffset);
        const range = this.calculateRange(activeFrame, referenceDate);

        const processedData = this.processRawData(rawData);

        const dRange = processedData.filter(d => {
            const ts = new Date(d.timestamp + " UTC").getTime();
            return ts >= range.startDate.getTime() && ts <= range.endDate.getTime();
        });

        const absoluteLast = processedData[processedData.length - 1];
        const absoluteLastTs = new Date(absoluteLast.timestamp + " UTC").getTime();
        const lastInView = dRange[dRange.length - 1] || absoluteLast;
        const prevInView = dRange.length > 1 ? dRange[dRange.length - 2] : lastInView;
        const firstInView = dRange[0] || lastInView;

        console.log("Range start date:", range.startDate.toLocaleString());
        console.log("Range end date:", range.endDate.toLocaleString());

        return this.assembleFinalStats(
            processedData,
            dRange,
            lastInView,
            prevInView,
            firstInView,
            absoluteLastTs,
            range.durationHrs,
            range.startDate,
            range.endDate
        );
    }

    assembleFinalStats(processedData, dRange, lastInView, prevInView, firstInView, absoluteLastTs, currentHrs, rangeStart, rangeEnd) {
        const absoluteLast = processedData[processedData.length - 1];
        const isOnline = (Date.now() - absoluteLastTs) < CONFIG.DATA.ONLINE_THRESHOLD_MS;

        const msPerDay = 24 * 60 * 60 * 1000;
        const daysSinceStart = Math.max(1, Math.floor((absoluteLastTs - CONFIG.startDate.getTime()) / CONFIG.DATA.MS_PER_DAY));
        const daysSinceSync = Math.max(1, (absoluteLastTs - CONFIG.OFFSETS.date.getTime()) / msPerDay);

        // --- PRODUKCJA I ZUŻYCIE ---
        const totalProdCwu = Math.max(0, (Number(absoluteLast.kwh_produced_cwu) || 0) - CONFIG.OFFSETS.cwu);
        const totalProdHeating = Math.max(0, (Number(absoluteLast.kwh_produced_heating) || 0) - CONFIG.OFFSETS.heating);
        const totalProdCorrected = totalProdCwu + totalProdHeating;

        const diffProdCwu = (Number(lastInView.kwh_produced_cwu) || 0) - (Number(firstInView.kwh_produced_cwu) || 0);
        const diffProdHeating = (Number(lastInView.kwh_produced_heating) || 0) - (Number(firstInView.kwh_produced_heating) || 0);

        const totalConsAbs = absoluteLast.v_cum_total;
        const diffConsKwh = lastInView.v_cum_total - firstInView.v_cum_total;

        // --- PRACA (Globalna) ---
        const correctedStarts = Math.max(0, (absoluteLast.starts || 0) - CONFIG.OFFSETS.starts);
        const correctedOpTotal = Math.max(0, (absoluteLast.op_time_total || 0) - CONFIG.OFFSETS.op_time_total);
        const correctedOpCwu = Math.max(0, (absoluteLast.op_time_cwu || 0) - CONFIG.OFFSETS.op_time_cwu);

        // --- ANALIZA STREF ---
        const workZones = this.prepareWorkZones(dRange);
        const blocks = [];
        let currentBlock = null;

        workZones.forEach((p) => {
            if (p.isRunning && !currentBlock) {
                currentBlock = { start: p.x, end: p.x };
            } else if (p.isRunning && currentBlock) {
                currentBlock.end = p.x;
            } else if (!p.isRunning && currentBlock) {
                blocks.push(currentBlock);
                currentBlock = null;
            }
        });
        if (currentBlock) blocks.push(currentBlock);

        // --- LOGIKA CYKLU PRACY I RESTARTÓW ---
        const lastZonePoint = workZones[workZones.length - 1];
        const isRunningNow = lastZonePoint ? lastZonePoint.isRunning : false;

        let currentUptimeMs = 0;
        let currentDowntimeMs = 0;
        let currentCycleRestarts = 0;
        let modeLabel = ""; // Inicjalizacja tutaj naprawia błąd Scope'u

        if (isRunningNow && blocks.length > 0) {
            const lastActiveBlock = blocks[blocks.length - 1];
            currentUptimeMs = Date.now() - lastActiveBlock.start;

            const cycleStartTs = lastActiveBlock.start;

            // Wykrywanie trybów wewnątrz strefy
            const zonesInCycle = workZones.filter(z => z.x >= cycleStartTs);
            const hasCO = zonesInCycle.some(z => z.yCO === 1);
            const hasCWU = zonesInCycle.some(z => z.yCWU === 1);

            if (hasCO && hasCWU) modeLabel = "(CO + CWU)";
            else if (hasCO) modeLabel = "(CO)";
            else if (hasCWU) modeLabel = "(CWU)";

            // Liczenie restartów
            const pointsInCycle = dRange.filter(d => {
                const ts = new Date(d.timestamp + " UTC").getTime();
                return ts >= cycleStartTs;
            });

            if (pointsInCycle.length > 0) {
                const firstP = pointsInCycle[0];
                const lastP = pointsInCycle[pointsInCycle.length - 1];
                const diffInCycle = (Number(lastP.starts) || 0) - (Number(firstP.starts) || 0);
                currentCycleRestarts = Math.max(0, diffInCycle);
            }
        } else if (!isRunningNow && blocks.length > 0) {
            // --- POMPA STOI (Nowa logika) ---
            const lastActiveBlock = blocks[blocks.length - 1];
            currentDowntimeMs = Date.now() - lastActiveBlock.end; // Liczymy od końca ostatniej pracy

            // Opcjonalnie: pobierz restarty z tego właśnie zakończonego cyklu
            const cycleStartTs = lastActiveBlock.start;
            const pointsInCycle = dRange.filter(d => {
                const ts = new Date(d.timestamp + " UTC").getTime();
                return ts >= cycleStartTs && ts <= lastActiveBlock.end;
            });

            if (pointsInCycle.length > 0) {
                const firstP = pointsInCycle[0];
                const lastP = pointsInCycle[pointsInCycle.length - 1];
                currentCycleRestarts = Math.max(0, (Number(lastP.starts) || 0) - (Number(firstP.starts) || 0));
            }
        }

        // --- ZDROWIE I ETYKIETY ---
        const intervalMin = CONFIG.DATA.INTERVAL_MIN || 2; // upewnij się, że masz to w configu
        const rangeDurationMs = rangeEnd.getTime() - rangeStart.getTime();
        const expectedRecords = Math.max(1, Math.floor(rangeDurationMs / (intervalMin * 60 * 1000)));

        const health = ((dRange.length / expectedRecords) * 100);
        const healthPercent = isNaN(health) ? "0.0" : health.toFixed(1);
        const rangeLabel = this.state.activeFrame || '24h';

        console.log("DEBUG KPI VALUES:", {
            days: daysSinceSync,
            starts: correctedStarts,
            result: correctedStarts / daysSinceSync
        });

        return {
            last: lastInView,
            prev: prevInView,
            absoluteLast: absoluteLast,
            isOnline: isOnline,
            dRange: dRange,
            workZones: workZones,
            displayStart: rangeStart,
            displayEnd: rangeEnd,
            dataCountRange: dRange.length,
            totalCount: processedData.length,
            calculated: {
                rangeLabel: rangeLabel,
                dbDaysFromStart: daysSinceStart,
                dbDaysFromSync: Math.floor(daysSinceSync),
                dbHealth: healthPercent,

                // Dane dla KPI Statusy
                currentUptimeMs: currentUptimeMs,
                currentDowntimeMs: currentDowntimeMs,
                isRunningNow: isRunningNow,
                rangeRestarts: isRunningNow ? currentCycleRestarts : 0,
                currentCycleMode: modeLabel, // Teraz modeLabel jest zawsze zdefiniowane (nawet jako "")

                // Produkcja / Zużycie
                totalKwh: totalProdCorrected,
                avgKwh: (totalProdCorrected / daysSinceSync),
                diffKwh: (diffProdCwu + diffProdHeating),
                diffKwhCwu: diffProdCwu,
                cwuKwh: totalProdCwu,
                cwuPercentKwh: totalProdCorrected > 0 ? ((totalProdCwu / totalProdCorrected) * 100) : 0,
                totalConsKwh: totalConsAbs,
                avgConsKwh: (totalConsAbs / daysSinceSync),
                diffConsKwh: diffConsKwh,
                cwuConsKwh: absoluteLast.v_cum_cwu,
                cwuConsPercent: totalConsAbs > 0 ? ((absoluteLast.v_cum_cwu / totalConsAbs) * 100) : 0,
                currentPowerKw: lastInView.v_inst_power,

                // Praca (globalnie)
                totalStarts: correctedStarts,
                totalWorkHours: correctedOpTotal,
                totalCwuHours: correctedOpCwu,
                cwuPercentTime: correctedOpTotal > 0 ? ((correctedOpCwu / correctedOpTotal) * 100) : 0,
                diffStarts: lastInView.starts - firstInView.starts,
                diffWork: (lastInView.op_time_total - firstInView.op_time_total),

                // COP / Średnie
                ratio: correctedStarts > 0 ? (correctedOpTotal / correctedStarts) : 0,
                avgStarts: (correctedStarts / daysSinceSync),
                avgWork: (correctedOpTotal / daysSinceSync),
                totalCop: totalConsAbs > 0 ? (totalProdCorrected / totalConsAbs) : 0,
                rangeCop: diffConsKwh > 0 ? ((diffProdCwu + diffProdHeating) / diffConsKwh) : 0,
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

    getTrendIcon(curr, prev) {
        if (curr === undefined || prev === undefined || curr === null || prev === null) {
            return '';
        }

        const diff = curr - prev;
        const threshold = 0.01; // Bardzo czuły, dopasuj do potrzeb

        if (Math.abs(diff) < threshold) return '<span class="text-slate-600 font-black text-md">＝</span>';

        // Używamy strzałek o pełnej szerokości (np. ▲ ▼) lub standardowych ↑ ↓
        if (diff > 0) return '<span class="text-emerald-500">▲</span>';
        return '<span class="text-rose-500">▼</span>';
    }

    createChartsContainers() {
        TemplateManager.render('live-view', CONFIG.CHART_CONFIG, TemplateManager.chartCard);
    }

    _setupTimeFilters() {
        const frames = Object.keys(CONFIG.TIME_FRAMES);
        TemplateManager.render('filter-group', frames, (key) => {
            return TemplateManager.filterBtn(key, key === this.state.activeFrame);
        });
    }

    setupEventListeners() {
        // Obsługa filtrów (1h, 6h...)
        document.getElementById('filter-group').onclick = (e) => {
            const btn = e.target.closest('button');
            if (btn && btn.dataset.frame) {
                const frameKey = btn.dataset.frame;
                const range = this.calculateRange(frameKey);
                this.state.activeFrame = frameKey;
                this.state.startDate = range.startDate;
                this.state.endDate = range.endDate;
                this.state.liveOffset = 0;
                this._setupTimeFilters();
                this.render();
            }
        };
    }

    calculateRange(frameKey, referenceDate = new Date()) {
        const baseDate = new Date(referenceDate);
        let startDate, endDate;

        if (frameKey.includes('m')) {
            const monthsToBack = parseInt(frameKey) || 1;
            startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - (monthsToBack - 1), 1, 0, 0, 0);
            endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59);
        }
        else if (frameKey.includes('d')) {
            const daysToBack = parseInt(frameKey) || 1;
            startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - (daysToBack - 1), 0, 0, 0);
            endDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 23, 59, 59);
        }
        else if (frameKey.includes('h')) {
            const hoursToBack = parseInt(frameKey) || 1;
            startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), baseDate.getHours() - (hoursToBack - 1), 0, 0);
            endDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), baseDate.getHours(), 59, 59);
        }

        return {
            startDate,
            endDate,
            durationHrs: (endDate - startDate) / 3600000
        };
    }

    render() {
        if (!this.state.rawData || this.state.rawData.length === 0) return;

        const stats = this.getProcessedStats();
        if (!stats) return;

        this.updateDateNavigator(stats);
        this.updateUIComponents(stats);
        this.renderUnifiedView(stats);
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

        TemplateManager.render('kpi-expert', this.prepareKPIs(stats), TemplateManager.kpiCard);

        const startTime = stats.displayStart.getTime();
        const endTime = stats.displayEnd.getTime();

        console.group("DEBUG: Render Wykresu");
        console.log("Zakres okna (MIN):", new Date(startTime).toLocaleString());
        console.log("Zakres okna (MAX):", new Date(endTime).toLocaleString());
        console.groupEnd();

        let historyData = this.prepareHistoryData(stats.displayStart, stats.displayEnd);

        CONFIG.CHART_CONFIG.forEach(cfg => {
            const isHistorical = cfg.id.startsWith('c-daily-');

            const frameConfig = CONFIG.TIME_FRAMES[activeFrame || '24h'];

            this.chartMgr.draw(cfg.id, cfg.title(stats.last), cfg.datasets, {
                rawData: isHistorical ? historyData : stats.dRange,
                type: isHistorical ? 'bar' : 'line',
                unit: frameConfig.unit,
                agg: frameConfig.agg,
                min: startTime,
                max: isHistorical ? null : endTime,
                zones: isHistorical ? [] : stats.workZones,
                ...cfg
            });
        });
    }

    prepareHistoryData(minDate, maxDate) {
        const { hourlyData, activeFrame } = this.state;
        const config = CONFIG.TIME_FRAMES[activeFrame || '24h'];

        const startTime = minDate.getTime();
        const endTime = maxDate.getTime();

        const filtered = hourlyData.filter(d => {
            const dateStr = d.date.includes("UTC") ? d.date : d.date.replace(/-/g, "/") + " UTC";
            const itemTs = new Date(dateStr).getTime();
            return itemTs >= startTime && itemTs <= endTime;
        });

        let result = filtered.map(d => ({
            ...d,
            date: new Date(d.date.replace(/-/g, "/") + " UTC")
        }));

        if (config.agg === 'daily') {
            result = Utils.aggregateHourlyToDaily(result);
        } else if (config.agg === 'monthly') {
            result = Utils.aggregateHourlyToMonthly(result);
        }

        const sortedResult = result.sort((a, b) => a.date - b.date);

        // --- LOGI (teraz będą spójne z resztą aplikacji) ---
        console.group(`DEBUG HISTORY: ${activeFrame}`);
        console.log("Zakres od:", minDate.toLocaleString());
        console.log("Zakres do:", maxDate.toLocaleString());
        console.log("Znaleziono rekordów:", sortedResult.length);
        console.groupEnd();

        return sortedResult;
    }

    prepareWorkZones(rawData) {
        return rawData.map((d, index) => {
            const prev = index > 0 ? rawData[index - 1] : d;
            const state = this.getWorkState(d, prev);

            return {
                x: new Date(d.timestamp + " UTC").getTime(),
                yCO: state.isCO ? 1 : 0,
                yCWU: state.isCWU ? 1 : 0,
                yDefrost: state.isDefrost ? 1 : 0,
                isRunning: state.isRunning
            };
        });
    }

    getWorkState(d, prev) {
        const timestamp = d.timestamp || d.t || 'Nieznany';
        const hzRunning = (d.compressor_hz) > 0;

        prev = prev || d;

        // --- 1. WYKRYWANIE TRENDÓW ---
        const smDrop = (prev.degree_minutes || 0) - (d.degree_minutes || 0);
        const tempDrop = (prev.supply_line_eb101 || 0) - d.supply_line_eb101;

        // --- 2. LOGIKA LICZNIKÓW ---
        const prodHeatingDelta = Number(d.kwh_produced_heating || 0) - Number(prev.kwh_produced_heating || 0);
        const prodCWUDelta = Number(d.kwh_produced_cwu || 0) - Number(prev.kwh_produced_cwu || 0);

        let isCWU = false;
        let isCO = false;
        let isDefrost = false;

        // --- 3. HIERARCHIA DECYZJI ---

        // A. PRIORYTET: Defrost (wykrywamy go nawet przy 0 Hz, jeśli parametry lecą w dół)
        // Ustawiamy progi na tempDrop > 2.0 i smDrop > 4 (bardziej czułe)
        if (d.defrosting == 1 || (tempDrop > 2.0 && tempDrop < 15 && smDrop > 4)) {
            isDefrost = true;
        }
        // B. Grzanie wody (z licznika)
        else if (prodCWUDelta > 0.01) {
            isCWU = true;
        }
        // C. Grzanie CO (z licznika)
        else if (prodHeatingDelta > 0.01) {
            isCO = true;
        }
        // D. Fallback dla stanów nieustalonych
        else {
            // Jeśli sprężarka stoi i temperatura nie spada gwałtownie, to pompa po prostu "odpoczywa"
            if (!hzRunning && tempDrop <= 1.0) {
                return { isRunning: false, isCO: false, isCWU: false, isDefrost: false };
            }

            // Klasyczny fallback NIBE (różnica temperatur lub przyrost ładowania CWU)
            const deltaBT = d.supply_line_eb101 - (d.bt25_temp || 0);
            const bt6Rising = d.cwu_load > ((prev.cwu_load || 0) + 0.1);
            isCWU = (deltaBT > 10 || bt6Rising);
            isCO = !isCWU;
        }

        // Jeśli doszliśmy tutaj i którykolwiek stan jest true, to znaczy że pompa "pracuje"
        const isRunning = isDefrost || isCWU || isCO;

        return { isRunning, isCO, isCWU, isDefrost };
    }

    prepareKPIs(stats) {
        return CONFIG.KPIS.map(kpi => {
            let trendHtml = '';

            // Sprawdzamy, czy kpi ma przypisany klucz trendu i czy mamy dane historyczne
            if (kpi.trendKey && stats.last && stats.prev) {
                const curr = stats.last[kpi.trendKey];
                const prev = stats.prev[kpi.trendKey];

                // Tutaj możesz użyć swojej istniejącej metody getTrendIcon
                trendHtml = this.getTrendIcon(curr, prev);
            }

            return {
                ...kpi,
                v: kpi.v(stats),
                u: kpi.u(stats),
                c: kpi.dynamicClass ? kpi.dynamicClass(stats) : kpi.c,
                trend: trendHtml // Dodajemy wygenerowany HTML ikony
            };
        });
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