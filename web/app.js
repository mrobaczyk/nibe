import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';
import { TemplateManager } from './TemplateManager.js';
import { Utils } from './utils.js';

class App {
    constructor() {
        this.state = {
            view: CONFIG.DEFAULTS.VIEW,
            activeFrame: CONFIG.DEFAULTS.ACTIVE_FRAME || '24h',
            liveRange: CONFIG.DEFAULTS.LIVE_RANGE,
            liveOffset: 0,
            statsType: CONFIG.DEFAULTS.STATS_TYPE,
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
        this.render();

        // Odświeżanie co 5 minut
        setInterval(() => this.refreshData(), CONFIG.refreshIntervalMs);
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

    moveRange(type, direction) {
        if (this.state.view !== 'live') return;

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
        if (!navContainer || !stats) return;

        const config = CONFIG.TIME_FRAMES[this.state.activeFrame];
        const isLatest = this.state.liveOffset === 0;

        // 1. Obliczamy bazowy czas końcowy
        let rawEndTime = Date.now() + this.state.liveOffset;
        let end = new Date(rawEndTime);

        // 2. Jeśli jesteśmy w historii, wyrównujemy DO PEŁNEJ jednostki dla etykiety
        if (!isLatest) {
            if (config.hrs > 24) {
                end.setHours(0, 0, 0, 0);
                // Jeśli cofnęliśmy się o dni, chcemy pokazać np. do 00:00 dnia następnego
                // lub zostać przy 23:59 -> ale 00:00 jest czytelniejsze jako granica.
            } else {
                end.setMinutes(0, 0, 0); // Wyrównaj do pełnej godziny (np. 11:00)
            }
        }

        const endTimeTs = end.getTime();
        const startTimeTs = endTimeTs - (config.hrs * 3600000);

        // 3. Formatujemy napisy z czystych obiektów Date
        const startLabel = Utils.formatDate(new Date(startTimeTs));
        const endLabel = Utils.formatDate(new Date(endTimeTs));

        navContainer.innerHTML = TemplateManager.dateNavigator(startLabel, endLabel, isLatest);
    }

    getProcessedStats() {
        const { rawData, activeFrame, liveOffset } = this.state;
        if (!rawData.length) return null;

        const config = CONFIG.TIME_FRAMES[activeFrame || '24h'];
        const currentHrs = config.hrs;

        // 1. Przygotuj dane z wirtualnym licznikiem
        const processedData = this.processRawData(rawData);

        // 2. Wyznacz punkty czasowe i przefiltruj zakres
        const absoluteLast = processedData[processedData.length - 1];
        const absoluteLastTs = new Date(absoluteLast.timestamp + " UTC").getTime();

        const referenceTime = Date.now() + liveOffset;
        const rangeMs = currentHrs * 3600000;
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
        return this.assembleFinalStats(processedData, dRange, lastInView, prevInView, firstInView, absoluteLastTs, currentHrs);
    }

    assembleFinalStats(processedData, dRange, lastInView, prevInView, firstInView, absoluteLastTs, currentHrs) {
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

        const intervalMin = CONFIG.intervalMinutes;
        const expectedRecords = Math.max(1, Math.floor((currentHrs * 60) / intervalMin));
        const health = ((dRange.length / expectedRecords) * 100);
        const healthPercent = isNaN(health) ? "0.0" : health.toFixed(1);

        // Dynamiczna etykieta zakresu (np. 1h, 24h, 3d, 12m)
        const rangeLabel = currentHrs >= 8760 ? '12m' : (currentHrs > 24 ? `${currentHrs / 24}d` : `${currentHrs}h`);

        return {
            last: lastInView,
            prev: prevInView,
            absoluteLast: absoluteLast,
            isOnline: isOnline,
            dRange: dRange,
            dataCountRange: dRange.length,
            totalCount: processedData.length,
            calculated: {
                rangeLabel: rangeLabel,
                dbDaysFromStart: daysSinceStart,
                dbDaysFromSync: Math.floor(daysSinceSync),
                dbHealth: healthPercent,

                // Produkcja
                totalKwh: totalProdCorrected,
                avgKwh: (totalProdCorrected / daysSinceSync),
                diffKwh: (diffProdCwu + diffProdHeating),
                diffKwhCwu: diffProdCwu,
                cwuKwh: totalProdCwu,
                cwuPercentKwh: totalProdCorrected > 0 ? ((totalProdCwu / totalProdCorrected) * 100) : 0,

                // Zużycie
                totalConsKwh: totalConsAbs,
                avgConsKwh: (totalConsAbs / daysSinceSync),
                diffConsKwh: diffConsKwh,
                cwuConsKwh: absoluteLast.v_cum_cwu,
                cwuConsPercent: totalConsAbs > 0 ? ((absoluteLast.v_cum_cwu / totalConsAbs) * 100) : 0,
                currentPowerKw: lastInView.v_inst_power,

                // Praca 
                totalStarts: correctedStarts,
                totalWorkHours: correctedOpTotal,
                totalCwuHours: correctedOpCwu,
                cwuPercentTime: correctedOpTotal > 0 ? ((correctedOpCwu / correctedOpTotal) * 100) : 0,
                diffStarts: lastInView.starts - firstInView.starts,
                diffWork: (lastInView.op_time_total - firstInView.op_time_total),

                // Ratio i średnie liczone od momentu synchronizacji
                ratio: correctedStarts > 0 ? (correctedOpTotal / correctedStarts) : 0,
                avgStarts: (correctedStarts / daysSinceSync),
                avgWork: (correctedOpTotal / daysSinceSync),

                // COP
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
                this.state.activeFrame = frameKey;
                this.state.liveRange = CONFIG.TIME_FRAMES[frameKey].hrs;
                this.state.liveOffset = 0;
                this._setupTimeFilters(); // Odśwież widok przycisków
                this.render();
            }
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
        const { activeFrame, liveOffset } = this.state;
        const config = CONFIG.TIME_FRAMES[activeFrame || '24h'];

        TemplateManager.render('kpi-expert', this.prepareKPIs(stats), TemplateManager.kpiCard);

        const endTime = Date.now() + liveOffset;
        const startTime = endTime - (config.hrs * 3600000);

        // --- DEBUG START ---
        console.group("DEBUG: Render Wykresu");
        console.log("Zakres okna (MIN):", new Date(startTime).toLocaleString());
        console.log("Zakres okna (MAX):", new Date(endTime).toLocaleString());
        console.log("Ilość punktów w stats.dRange:", stats.dRange ? stats.dRange.length : 0);

        if (stats.dRange && stats.dRange.length > 0) {
            console.log("Pierwszy punkt w dRange:", new Date(stats.dRange[0].timestamp).toLocaleString());
            console.log("Ostatni punkt w dRange:", new Date(stats.dRange[stats.dRange.length - 1].timestamp).toLocaleString());
        }
        console.groupEnd();
        // --- DEBUG END ---

        let historyData = this.prepareHistoryData();
        historyData = this.prepareLiveHour(historyData, stats, config);

        CONFIG.CHART_CONFIG.forEach(cfg => {
            const isHistorical = cfg.id.startsWith('c-daily-');
            this.chartMgr.draw(cfg.id, cfg.title(stats.last), cfg.datasets, {
                rawData: isHistorical ? historyData : stats.dRange,
                type: isHistorical ? 'bar' : 'line',
                unit: config.unit,
                agg: config.agg,
                min: startTime,
                max: endTime,
                zones: isHistorical ? [] : this.prepareWorkZones(stats.dRange),
                ...cfg
            });
        });
    }

    prepareHistoryData() {
        const { hourlyData, activeFrame, liveOffset } = this.state;
        const config = CONFIG.TIME_FRAMES[activeFrame || '24h'];

        // 1. "Teraz" w milisekundach
        const nowTs = Date.now() + liveOffset;
        let startTime;
        let referenceTime;

        if (config.agg === 'daily') {
            const daysToInclude = config.hrs / 24;
            const startDate = new Date(nowTs);

            // Start: Początek pierwszego dnia zakresu
            startDate.setHours(0, 0, 0, 0);
            startDate.setDate(startDate.getDate() - (daysToInclude - 1));

            // DODAJEMY 1ms, żeby odciąć rekordy z godziny 00:00:00 dnia poprzedniego
            // lub ewentualne śmieciowe wpisy z punktu zero
            startTime = startDate.getTime() + 1;

            const endDate = new Date(nowTs);
            endDate.setHours(23, 59, 59, 999);
            referenceTime = endDate.getTime();
        } else {
            // Uniwersalna logika dla widoków godzinowych (1h, 3h, 6h, 24h itd.)
            const nowTs = Date.now() + liveOffset;

            // 1. Wyznaczamy koniec: zawsze do końca obecnej godziny
            const endHour = new Date(nowTs);
            endHour.setMinutes(59, 59, 999);
            referenceTime = endHour.getTime();

            // 2. Wyznaczamy start: "Teraz" minus X godzin z configu
            const startHour = new Date(nowTs - (config.hrs * 3600000));

            // 3. Zaokrąglamy do PEŁNEJ godziny (ucinamy minuty i sekundy)
            // Jeśli jest 10:30 i config.hrs = 3, to 10:30 - 3h = 7:30 -> zaokrąglamy do 7:00
            startHour.setMinutes(0, 0, 0, 0);

            // 4. KLUCZOWY MARGINES (+1ms): 
            // Jeśli startHour wyszło 04:00:00, to startTime będzie 04:00:00.001.
            // Filtr (itemTs >= startTime) odrzuci rekord z 04:00 i weźmie dopiero ten z 05:00.
            // Dzięki temu przy config.hrs = 6 dostaniesz dokładnie 6 słupków (5,6,7,8,9,10).
            startTime = startHour.getTime() + 1;
        }

        // 2. FILTROWANIE z uwzględnieniem UTC
        const filtered = hourlyData.filter(d => {
            // DODAJEMY " UTC", żeby JS wiedział, że 20:00 w pliku to 21:00 u nas
            const itemTs = new Date(d.date.replace(/-/g, "/") + " UTC").getTime();
            return itemTs >= startTime && itemTs <= referenceTime;
        });

        // 3. MAPOWANIE - przekazujemy obiekt Date (najbezpieczniej dla Chart.js)
        let result = filtered.map(d => ({
            ...d,
            // Zamieniamy string na obiekt Date, który Chart.js wyświetli lokalnie (jako 21:00)
            date: new Date(d.date.replace(/-/g, "/") + " UTC")
        }));

        if (config.agg === 'daily') {
            result = Utils.aggregateHourlyToDaily(result);
        }

        const sortedResult = result.sort((a, b) => new Date(a.date) - new Date(b.date));

        // --- LOGI (teraz będą jasne) ---
        console.group(`DEBUG: ${activeFrame}`);
        console.log("Szukamy danych od (lokalnie):", new Date(startTime).toString());
        console.log("Szukamy danych do (lokalnie):", new Date(referenceTime).toString());
        if (sortedResult.length > 0) {
            console.log("Ostatni punkt w danych (lokalnie):", sortedResult[sortedResult.length - 1].date.toString());
        }
        console.groupEnd();

        return sortedResult;
    }

    prepareLiveHour(historyData, stats, config) {
        console.group("--- LIVE HOUR DIAGNOSTICS ---");

        if (config?.unit !== 'hour' || !stats?.dRange || stats?.dRange.length === 0) {
            console.groupEnd();
            return historyData;
        }

        // 1. Ustalenie czasu punktu "Live" w UTC
        const lastPoint = stats.dRange[stats.dRange.length - 1];
        const rawTimestamp = lastPoint.timestamp.replace(' ', 'T') + "Z";
        const lastPointDate = new Date(rawTimestamp);
        const liveHourStartUTC = new Date(lastPointDate);
        liveHourStartUTC.setUTCHours(lastPointDate.getUTCHours(), 0, 0, 0);
        const liveHourTs = liveHourStartUTC.getTime();

        // 2. Sprawdzenie czy godzina już istnieje w danych historycznych
        const lastHistoryEntry = historyData[historyData.length - 1];
        const lastHistoryTs = lastHistoryEntry ? new Date(lastHistoryEntry.date).getTime() : 0;

        if (liveHourTs <= lastHistoryTs) {
            console.log("Godzina już w historyData. Pomijam.");
            console.groupEnd();
            return historyData;
        }

        // 3. Filtrowanie i sortowanie punktów z dRange dla tej godziny
        const hourPoints = stats.dRange.filter(p => {
            const pDate = new Date(p.timestamp.replace(' ', 'T') + "Z");
            pDate.setUTCHours(pDate.getUTCHours(), 0, 0, 0);
            return pDate.getTime() === liveHourTs;
        });

        if (hourPoints.length === 0) {
            console.groupEnd();
            return historyData;
        }

        hourPoints.sort((a, b) => new Date(a.timestamp.replace(' ', 'T')) - new Date(b.timestamp.replace(' ', 'T')));

        // 4. Agregacja zużycia (estymacja krokowa)
        let totalConsH = 0;
        let totalConsC = 0;
        const intervalMs = config?.refreshIntervalMs || 300000;
        const hourFraction = intervalMs / 3600000;

        for (let i = 0; i < hourPoints.length; i++) {
            const h = hourPoints[i];
            const prev = i > 0 ? hourPoints[i - 1] : null;

            const estKw = this.estimatePower(
                Number(h.compressor_hz || 0),
                Number(h.pump_speed || 0),
                Number(h.outdoor || 10)
            );

            const stepKwh = estKw * hourFraction;

            const deltaProdH = prev ? Math.max(0, (Number(h.kwh_produced_heating) || 0) - (Number(prev.kwh_produced_heating) || 0)) : 0;
            const deltaProdC = prev ? Math.max(0, (Number(h.kwh_produced_cwu) || 0) - (Number(prev.kwh_produced_cwu) || 0)) : 0;

            const totalDelta = deltaProdH + deltaProdC;

            if (totalDelta > 0) {
                totalConsH += stepKwh * (deltaProdH / totalDelta);
                totalConsC += stepKwh * (deltaProdC / totalDelta);
            } else {
                totalConsH += stepKwh;
            }
        }

        // 5. Finalne dane dla punktu Live
        const first = hourPoints[0];
        const last = hourPoints[hourPoints.length - 1];

        const dProdHeat = Math.max(0, (Number(last.kwh_produced_heating) || 0) - (Number(first.kwh_produced_heating) || 0));
        const dProdCWU = Math.max(0, (Number(last.kwh_produced_cwu) || 0) - (Number(first.kwh_produced_cwu) || 0));

        // Średnia temperatura (teraz wyjdzie poprawnie 7.7)
        const outdoorAvg = Number((hourPoints.reduce((s, p) => s + (Number(p.outdoor) || 0), 0) / hourPoints.length).toFixed(1));

        const dTotalMin = Math.max(0, (Number(last.op_time_total) || 0) - (Number(first.op_time_total) || 0));
        const dCWUMin = Math.max(0, (Number(last.op_time_cwu) || 0) - (Number(first.op_time_cwu) || 0));

        const liveAggregated = {
            date: liveHourStartUTC.toISOString(),
            isLive: true,
            kwh_produced_heating: dProdHeat,
            kwh_produced_cwu: dProdCWU,
            kwh_consumed_heating: Number(totalConsH.toFixed(3)),
            kwh_consumed_cwu: Number(totalConsC.toFixed(3)),
            // COP liczone na podstawie wyestymowanego zużycia
            cop_heating: totalConsH > 0.01 ? Number((dProdHeat / totalConsH).toFixed(2)) : 0,
            cop_cwu: totalConsC > 0.01 ? Number((dProdCWU / totalConsC).toFixed(2)) : 0,
            outdoor_avg: outdoorAvg,
            starts: Math.max(0, (Number(last.starts) || 0) - (Number(first.starts) || 0)),
            work_hours_heating: Number(((dTotalMin - dCWUMin) / 60).toFixed(2)),
            work_hours_cwu: Number((dCWUMin / 60).toFixed(2))
        };

        console.log("Final Live Aggregation Success:", liveAggregated);
        console.groupEnd();

        return [...historyData, liveAggregated];
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
        const card = canvas.closest('.card');
        const grid = card.closest('.chart-grid');
        const chartInstance = this.chartMgr.charts[chartId];

        const isFullscreen = card.classList.toggle('is-fullscreen');
        grid.classList.toggle('has-fullscreen', isFullscreen);

        if (!isFullscreen) {
            // 1. Zamiast czyścić styl, usuwamy atrybuty, które Chart.js mógł nadpisać
            canvas.removeAttribute('style');

            // 2. Jeśli Twój container to ten div z style="height: 320px" z poprzednich postów:
            const container = canvas.parentElement;
            if (container) {
                container.style.height = ''; // Powrót do wysokości z CSS (np. min-h-[400px])
            }
        }

        if (chartInstance) {
            // 3. Robimy resize natychmiast i drugi po krótkim timeout-cie
            // To rozwiązuje problem "skokowego" renderowania w CSS Grid/Flex
            chartInstance.resize();

            setTimeout(() => {
                chartInstance.resize();
                chartInstance.update('none'); // Odśwież bez animacji dla płynności
            }, 150); // Zwiększyłem do 150ms, żeby przeglądarka na pewno przeliczyła layout
        }

        if (isFullscreen) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            // Opcjonalnie: wymuś przeliczenie globalne okna
            window.dispatchEvent(new Event('resize'));
        }
    }
}

const app = new App();
window.app = app;