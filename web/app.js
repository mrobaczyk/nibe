import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';
import { TemplateManager } from './TemplateManager.js';
import { Utils } from './utils.js';

const CHART_PREFERENCES_KEY = 'nibe-chart-kpi-preferences';

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
        this.chartPreferences = this.loadChartPreferences();
        this.chartRenderJobs = new Map();
        this.chartVisibility = new Map();
        this.appliedChartVisibility = new Map();
        this.chartObserver = null;
        this.lastStats = null;
        this.init();
    }

    async init() {
        await this.loadData();
        this.createChartsContainers();
        this.setupChartObserver();
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

    fillMissingData(sparseData) {
        if (!sparseData || sparseData.length === 0) return [];

        const fullData = [];
        // Pamięć ostatniego stanu (pełny obiekt)
        let lastKnownState = { ...sparseData[0] };

        // Margines błędu (np. 120 sekund), żeby drobne opóźnienia w Actions 
        // nie były traktowane jako wielka dziura w danych
        const JITTER_MS = 120000;
        const MAX_ALLOWED_GAP = CONFIG.refreshIntervalMs + JITTER_MS;

        sparseData.forEach((entry, index) => {
            const currentTime = new Date(entry.ts).getTime();

            if (index > 0) {
                const prevTime = new Date(fullData[fullData.length - 1].ts).getTime();
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
            const ts = new Date(d.ts + " UTC").getTime();
            return ts >= range.startDate.getTime() && ts <= range.endDate.getTime();
        });

        const absoluteLast = processedData[processedData.length - 1];
        const absoluteLastTs = new Date(absoluteLast.ts + " UTC").getTime();
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
        const totalProdCwu = Math.max(0, (Number(absoluteLast.kwh_p_cwu) || 0) - CONFIG.OFFSETS.cwu);
        const totalProdHeating = Math.max(0, (Number(absoluteLast.kwh_p_heat) || 0) - CONFIG.OFFSETS.heating);
        const totalProdCorrected = totalProdCwu + totalProdHeating;

        const diffProdCwu = (Number(lastInView.kwh_p_cwu) || 0) - (Number(firstInView.kwh_p_cwu) || 0);
        const diffProdHeating = (Number(lastInView.kwh_p_heat) || 0) - (Number(firstInView.kwh_p_heat) || 0);

        const totalConsAbs = absoluteLast.v_cum_total;
        const diffConsKwh = lastInView.v_cum_total - firstInView.v_cum_total;

        // --- PRACA (Globalna) ---
        const correctedStarts = Math.max(0, (absoluteLast.starts || 0) - CONFIG.OFFSETS.starts);
        const correctedOpTotal = Math.max(0, (absoluteLast.op_time_total || 0) - CONFIG.OFFSETS.op_time_total);
        const correctedOpCwu = Math.max(0, (absoluteLast.op_time_cwu || 0) - CONFIG.OFFSETS.op_time_cwu);

        // --- ANALIZA STREF ---
        const workZones = this.prepareWorkZones(dRange);
        const {
            isRunningNow,
            currentUptimeMs,
            currentDowntimeMs,
            currentCycleRestarts,
            modeLabel
        } = this.getCurrentCycleMetrics(processedData);

        // --- ZDROWIE I ETYKIETY ---
        const now = new Date();
        const delayMs = 120000;
        const effectiveEnd = rangeEnd > now ? new Date(now.getTime() - delayMs) : rangeEnd;
        const durationMs = effectiveEnd.getTime() - rangeStart.getTime();
        const intervalMs = CONFIG.intervalMinutes * 60 * 1000;
        const expectedRecords = Math.max(1, Math.floor(durationMs / intervalMs) + 1);
        const health = (dRange.length / expectedRecords) * 100;
        const healthPercent = isNaN(health) ? "0.0" : Math.min(100, health).toFixed(1);
        const rangeLabel = this.state.activeFrame || '24h';

        console.table({
            "Zakres (min)": durationMs / 60000,
            "Rekordów w dRange": dRange.length,
            "Oczekiwano": expectedRecords,
            "Interwał (ms)": intervalMs,
            "Start": rangeStart.toISOString(),
            "End (effective)": effectiveEnd.toISOString()
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

                // Status
                isCO: lastInView.workState?.isCO || false,
                isCWU: lastInView.workState?.isCWU || false,
                isDefrost: lastInView.workState?.isDefrost || false,
                isOilReturn: lastInView.workState?.isOilReturn || false,
                isRunning: lastInView.workState?.isRunning || false,

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

    setupChartObserver() {
        if (!('IntersectionObserver' in window)) {
            this.syncChartVisibility();
            return;
        }

        this.chartObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const chartId = entry.target.id.slice(2);
                this.chartVisibility.set(chartId, entry.isIntersecting);

                if (entry.isIntersecting) {
                    this.renderChart(chartId);
                }
            });
        }, { rootMargin: '100px 0px' });

        this.syncChartVisibility();
    }

    renderChart(chartId) {
        const job = this.chartRenderJobs.get(chartId);
        if (!job) return;

        const rawData = typeof job.rawData === 'function' ? job.rawData() : job.rawData;
        this.chartMgr.draw(chartId, job.title, job.datasets, {
            ...job.options,
            rawData
        });
    }

    loadChartPreferences() {
        const chartedKpiIds = [...new Set(CONFIG.CHART_CONFIG.map(chart => chart.kpiId).filter(Boolean))];
        const defaults = Object.fromEntries(
            chartedKpiIds.map(kpiId => [kpiId, true])
        );

        try {
            const saved = JSON.parse(localStorage.getItem(CHART_PREFERENCES_KEY) || '{}');
            return Object.fromEntries(Object.keys(defaults).map(id => [
                id,
                typeof saved[id] === 'boolean' ? saved[id] : defaults[id]
            ]));
        } catch {
            return defaults;
        }
    }

    isChartEnabled(chartId) {
        const chart = CONFIG.CHART_CONFIG.find(item => item.id === chartId);
        return Boolean(chart && this.chartPreferences[chart.kpiId] && this.isChartAvailable(chartId));
    }

    isChartAvailable(chartId) {
        const isHistorical = chartId.startsWith('c-daily-');
        const longRange = /^([0-9]+)m$/.exec(this.state.activeFrame);
        return !longRange || Number(longRange[1]) <= 1 || isHistorical;
    }

    syncChartVisibility() {
        CONFIG.CHART_CONFIG.forEach(cfg => {
            const enabled = this.isChartEnabled(cfg.id);
            if (this.appliedChartVisibility.get(cfg.id) === enabled) return;

            this.appliedChartVisibility.set(cfg.id, enabled);
            const card = document.getElementById(`p-${cfg.id}`);
            if (!card) return;

            card.style.display = enabled ? '' : 'none';
            if (enabled) {
                if (this.chartObserver) {
                    this.chartVisibility.set(cfg.id, false);
                    this.chartObserver.observe(card);
                } else {
                    this.renderChart(cfg.id);
                }
                return;
            }

            this.chartObserver?.unobserve(card);
            this.chartVisibility.set(cfg.id, false);
            if (this.chartMgr.charts[cfg.id]) {
                this.chartMgr.charts[cfg.id].destroy();
                delete this.chartMgr.charts[cfg.id];
            }
        });
    }

    toggleKpiCharts(kpiId) {
        if (!(kpiId in this.chartPreferences)) return;
        const hasAvailableCharts = CONFIG.CHART_CONFIG.some(chart => chart.kpiId === kpiId && this.isChartAvailable(chart.id));
        if (!hasAvailableCharts) return;

        this.chartPreferences[kpiId] = !this.chartPreferences[kpiId];
        try {
            localStorage.setItem(CHART_PREFERENCES_KEY, JSON.stringify(this.chartPreferences));
        } catch (error) {
            console.warn('Nie udało się zapisać ustawień wykresów:', error);
        }

        if (this.lastStats) this.renderKpis(this.lastStats);
        this.syncChartVisibility();
        if (!this.chartObserver) {
            CONFIG.CHART_CONFIG
                .filter(chart => chart.kpiId === kpiId && this.isChartEnabled(chart.id))
                .forEach(chart => this.renderChart(chart.id));
        }
    }

    renderKpis(stats) {
        TemplateManager.render('kpi-expert', this.prepareKPIs(stats), TemplateManager.kpiCard);
    }

    openParameterEditor(kpiId) {
        const kpi = CONFIG.KPIS.find(item => item.id === kpiId && item.editableParameters?.length);
        if (!kpi || !this.lastStats?.absoluteLast) return;

        document.getElementById('nibe-settings-dialog')?.remove();

        const dialog = document.createElement('dialog');
        dialog.id = 'nibe-settings-dialog';
        dialog.className = 'w-[calc(100%-2rem)] max-w-md rounded-lg border border-slate-700 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-black/70';

        const form = document.createElement('form');
        form.className = 'flex flex-col gap-4 p-5';

        const heading = document.createElement('h2');
        heading.className = 'pr-8 text-base font-bold text-white';
        heading.textContent = `Edytuj: ${kpi.t}`;
        form.appendChild(heading);

        const inputById = new Map();
        for (const parameter of kpi.editableParameters) {
            const label = document.createElement('label');
            label.className = 'flex flex-col gap-1.5 text-sm text-slate-300';
            label.textContent = parameter.label;

            const input = document.createElement('input');
            input.type = 'number';
            input.step = 'any';
            input.required = true;
            input.name = parameter.parameterId;
            input.className = 'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30';
            const currentValue = this.lastStats.absoluteLast[parameter.field];
            input.value = currentValue === undefined || currentValue === null ? '' : String(currentValue);
            inputById.set(parameter.parameterId, { input, currentValue });
            label.appendChild(input);
            form.appendChild(label);
        }

        const status = document.createElement('p');
        status.className = 'min-h-5 text-sm text-slate-400';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        form.appendChild(status);

        const actions = document.createElement('div');
        actions.className = 'flex justify-end gap-2';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800';
        cancelButton.textContent = 'Anuluj';
        cancelButton.addEventListener('click', () => dialog.close());

        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.className = 'rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60';
        submitButton.textContent = 'Wyślij zmianę';
        actions.append(cancelButton, submitButton);
        form.appendChild(actions);

        form.addEventListener('submit', async event => {
            event.preventDefault();
            const values = {};
            for (const [parameterId, entry] of inputById) {
                const value = entry.input.value.trim();
                if (!value || !Number.isFinite(Number(value))) {
                    entry.input.focus();
                    status.textContent = `Podaj poprawną liczbę dla parametru ${parameterId}.`;
                    return;
                }
                if (Number(value) !== Number(entry.currentValue)) values[parameterId] = value;
            }

            if (Object.keys(values).length === 0) {
                status.textContent = 'Wartości nie zostały zmienione.';
                return;
            }

            submitButton.disabled = true;
            cancelButton.disabled = true;
            status.textContent = 'Wysyłanie zmiany do GitHub Actions...';
            try {
                const result = await this.submitParameterUpdate(values, status);
                submitButton.textContent = result ? 'Zapisano' : 'Sprawdź status';
                cancelButton.disabled = false;
                if (result) setTimeout(() => dialog.close(), 1800);
            } catch (error) {
                status.textContent = error.message;
                submitButton.disabled = false;
                cancelButton.disabled = false;
            }
        });

        let backdropMouseDown = false;
        dialog.addEventListener('mousedown', event => {
            backdropMouseDown = event.target === dialog;
        });
        dialog.addEventListener('click', event => {
            if (event.target === dialog && backdropMouseDown) dialog.close();
            backdropMouseDown = false;
        });
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        dialog.appendChild(form);
        document.body.appendChild(dialog);
        dialog.showModal();
        dialog.querySelector('input')?.focus();
    }

    async submitParameterUpdate(values, statusElement) {
        const apiUrl = CONFIG.SETTINGS_API_URL.replace(/\/$/, '');
        if (!apiUrl) throw new Error('Skonfiguruj SETTINGS_API_URL w web/config.js po wdrożeniu Workera.');

        const response = await fetch(`${apiUrl}/api/settings`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ values })
        });
        const request = await response.json().catch(() => ({}));
        if (!response.ok || !request.requestId) {
            throw new Error(request.error || `Nie udało się zlecić zmiany (HTTP ${response.status}).`);
        }

        for (let attempt = 0; attempt < 45; attempt++) {
            statusElement.textContent = 'Żądanie w kolejce. Czekam na wynik GitHub Actions...';
            await new Promise(resolve => setTimeout(resolve, 2000));
            const statusResponse = await fetch(`${apiUrl}/api/requests/${request.requestId}`, {
                credentials: 'include'
            });
            const run = await statusResponse.json().catch(() => ({}));
            if (!statusResponse.ok) throw new Error(run.error || 'Nie udało się sprawdzić statusu zapisu.');

            if (run.status === 'completed') {
                if (run.conclusion === 'success') {
                    statusElement.textContent = 'myUplink przyjął zmianę. Dashboard odświeży odczyt przy następnym pobraniu danych.';
                    return true;
                }
                throw new Error('Aktualizacja nie powiodła się. Sprawdź log workflow „Set NIBE Parameters” w GitHub Actions.');
            }
        }

        throw new Error(`Workflow nadal działa. ID żądania: ${request.requestId}. Sprawdź jego status w GitHub Actions przed ponowną wysyłką.`);
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

        console.group("DEBUG: Render Wykresu");
        console.log("Zakres okna (MIN):", new Date(startTime).toLocaleString());
        console.log("Zakres okna (MAX):", new Date(roundedMax).toLocaleString());
        console.groupEnd();

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

            this.chartRenderJobs.set(cfg.id, {
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

        this.syncChartVisibility();
        CONFIG.CHART_CONFIG.forEach(cfg => {
            if (this.isChartEnabled(cfg.id) && (!this.chartObserver || this.chartVisibility.get(cfg.id))) {
                this.renderChart(cfg.id);
            }
        });
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

        const sortedResult = result.sort((a, b) => a.ts - b.ts);

        // --- LOGI (teraz będą spójne z resztą aplikacji) ---
        console.group(`DEBUG HISTORY: ${activeFrame}`);
        console.log("Zakres od:", minDate.toLocaleString());
        console.log("Zakres do:", maxDate.toLocaleString());
        console.log("Znaleziono rekordów:", sortedResult.length);
        console.groupEnd();

        return sortedResult;
    }

    prepareWorkZones(dRange) {
        return dRange.map(d => {
            const state = d.workState || { isCO: false, isCWU: false, isDefrost: false, isOilReturn: false, isRunning: false };

            return {
                x: new Date(d.ts + " UTC").getTime(),
                yCO: state.isCO ? 1 : 0,
                yCWU: state.isCWU ? 1 : 0,
                yDefrost: state.isDefrost ? 1 : 0,
                yOilReturn: state.isOilReturn ? 1 : 0,
                isRunning: state.isRunning
            };
        });
    }

    getCurrentCycleMetrics(processedData, now = Date.now()) {
        const isRunningNow = Boolean(processedData[processedData.length - 1]?.workState?.isRunning);
        let lastActiveIndex = -1;

        for (let index = processedData.length - 1; index >= 0; index--) {
            if (processedData[index].workState?.isRunning) {
                lastActiveIndex = index;
                break;
            }
        }

        if (lastActiveIndex < 0) {
            return {
                isRunningNow,
                currentUptimeMs: 0,
                currentDowntimeMs: 0,
                currentCycleRestarts: 0,
                modeLabel: ''
            };
        }

        let cycleStartIndex = lastActiveIndex;
        while (cycleStartIndex > 0 && processedData[cycleStartIndex - 1].workState?.isRunning) {
            cycleStartIndex--;
        }

        const cyclePoints = processedData.slice(cycleStartIndex, lastActiveIndex + 1);
        const cycleStartTs = new Date(processedData[cycleStartIndex].ts + ' UTC').getTime();
        const lastActiveTs = new Date(processedData[lastActiveIndex].ts + ' UTC').getTime();
        const firstCyclePoint = cyclePoints[0];
        const lastCyclePoint = cyclePoints[cyclePoints.length - 1];
        const currentCycleRestarts = Math.max(
            0,
            (Number(lastCyclePoint.starts) || 0) - (Number(firstCyclePoint.starts) || 0)
        );
        const hasCO = cyclePoints.some(point => point.workState.isCO);
        const hasCWU = cyclePoints.some(point => point.workState.isCWU);
        let modeLabel = '';

        if (isRunningNow) {
            if (hasCO && hasCWU) modeLabel = '(CO + CWU)';
            else if (hasCO) modeLabel = '(CO)';
            else if (hasCWU) modeLabel = '(CWU)';
        }

        return {
            isRunningNow,
            currentUptimeMs: isRunningNow ? Math.max(0, now - cycleStartTs) : 0,
            currentDowntimeMs: isRunningNow ? 0 : Math.max(0, now - lastActiveTs),
            currentCycleRestarts,
            modeLabel
        };
    }

    getWorkState(d, prev) {
        const hzRunning = (Number(d.compressor_hz) || 0) > 0;
        prev = prev || d;

        const outdoor = Number(d.outdoor || 0);
        const evapTemp = Number(d.evap || 0);
        const startsDelta = (Number(d.starts) || 0) - (Number(prev.starts) || 0);
        const smDrop = (prev.dm || 0) - (d.dm || 0);
        const tempDrop = (prev.supply_line_eb101 || 0) - d.supply_line_eb101;

        const prodHeatingDelta = Number(d.kwh_p_heat || 0) - Number(prev.kwh_p_heat || 0);
        const prodCWUDelta = Number(d.kwh_p_cwu || 0) - Number(prev.kwh_p_cwu || 0);
        const bt6Delta = (Number(d.cwu_load) || 0) - (Number(prev.cwu_load) || 0);

        let isCWU = false, isCO = false, isDefrost = false, isOilReturn = false;

        const hasRestartSignature = d.defrosting == 1 || (startsDelta > 0 && tempDrop > 2.0 && smDrop > 4);

        if (hasRestartSignature) {
            const canPhysicallyFreeze = outdoor < 12;
            const isEvapCold = evapTemp < 2;

            if (canPhysicallyFreeze && isEvapCold) {
                isDefrost = true;
            } else {
                isOilReturn = true;
            }
        }
        else if (prodCWUDelta > 0.01 || bt6Delta > 0.1) {
            isCWU = true;
        }
        else if (prodHeatingDelta > 0.01) {
            isCO = true;
        }
        else {
            if (!hzRunning && tempDrop <= 1.0) {
                return { isRunning: false, isCO: false, isCWU: false, isDefrost: false, isOilReturn: false };
            }

            const deltaBT = d.supply_line_eb101 - (d.bt25_temp || 0);
            isCWU = (deltaBT > 10 || bt6Delta > 0);
            isCO = !isCWU;
        }

        const isRunning = isDefrost || isCWU || isCO || isOilReturn;
        return { isRunning, isCO, isCWU, isDefrost, isOilReturn };
    }

    prepareKPIs(stats) {
        return CONFIG.KPIS.map(kpi => {
            const chartIds = CONFIG.CHART_CONFIG.filter(chart => chart.kpiId === kpi.id).map(chart => chart.id);
            const chartAvailable = chartIds.some(chartId => this.isChartAvailable(chartId));
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
                chartIds,
                chartAvailable,
                editableParameters: (kpi.editableParameters || []).map(parameter => ({
                    ...parameter,
                    currentValue: stats.absoluteLast?.[parameter.field]
                })),
                v: kpi.v(stats),
                u: kpi.u(stats),
                c: kpi.dynamicClass ? kpi.dynamicClass(stats) : kpi.c,
                chartEnabled: chartAvailable && this.chartPreferences[kpi.id],
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