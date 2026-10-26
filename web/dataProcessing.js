// dataProcessing.js
// Pure data transformation helpers used by App. No DOM access, no localStorage.
import { CONFIG } from './config.js';
import { Utils } from './utils.js';

// Model mocy jest wspólny z backendem (data/power_model.json) i ładowany przez setPowerModel.
let powerModel = null;

export function setPowerModel(model) {
    powerModel = model;
}

export function estimatePower(hz, pumpSpeed, tempExt, model = powerModel) {
    if (!model) throw new Error('Model mocy nie został załadowany (setPowerModel).');
    if (hz < 1) return model.standby_kw;

    // Brak odczytu temperatury zewnętrznej (null/undefined/NaN) -> wartość domyślna z modelu.
    const outdoor = (tempExt == null || !Number.isFinite(Number(tempExt)))
        ? model.default_outdoor_c
        : Number(tempExt);

    let tempCorrection = 1.0;
    if (outdoor < model.cold_below_c) {
        tempCorrection = 1.0 + (model.cold_below_c - outdoor) * model.cold_correction_per_c;
    }

    let compressorKw = hz * model.hz_coeff_kw * tempCorrection;
    if (outdoor < model.tray_heater_below_c) {
        compressorKw += model.tray_heater_kw;
    }

    const circPumpKw = model.circ_pump_kw * (pumpSpeed / 100);
    return Math.round((compressorKw + circPumpKw) * 1000) / 1000;
}

function readFiniteValue(data, key) {
    if (data?.[key] == null || data[key] === '') return null;
    const value = Number(data[key]);
    return Number.isFinite(value) ? value : null;
}

const OIL_RETURN_INTERVAL_MS = 3 * 60 * 60 * 1000;

function hasCompressorProtectionSignal(d, prev) {
    const samples = [d, prev];
    if (samples.some(sample => (readFiniteValue(sample, 'hot_gas') ?? -Infinity) >= 115)) return true;
    if (samples.some(sample => (readFiniteValue(sample, 'liquid_line') ?? -Infinity) >= 65)) return true;

    // The low-pressure channel is reported in bar; manual thresholds are in MPa.
    const lowPressureBar = samples.map(sample => readFiniteValue(sample, 'low_pressure'));
    const sampleSpanMs = d.ts && prev.ts
        ? Utils.parseTs(d.ts) - Utils.parseTs(prev.ts)
        : 0;
    const lowPressureStayedBelow = (limit, requiredMs) =>
        lowPressureBar.every(value => value !== null && value < limit) &&
        sampleSpanMs > requiredMs;
    if (lowPressureStayedBelow(0.15, 15 * 1000)) return true;
    if (lowPressureStayedBelow(0.79, 5 * 60 * 1000)) return true;

    const highSuperheatAtLowPressure = samples.every(sample => {
        const pressure = readFiniteValue(sample, 'low_pressure');
        const suctionGas = readFiniteValue(sample, 'suction_gas');
        const evaporation = readFiniteValue(sample, 'evap');
        return pressure !== null && pressure < 1.5 &&
            suctionGas !== null && evaporation !== null &&
            suctionGas - evaporation > 30;
    });
    return highSuperheatAtLowPressure && sampleSpanMs > 60 * 1000;
}

export function getWorkState(d, prev, next, runtime = {}) {
    const compressorHz = readFiniteValue(d, 'compressor_hz');
    const hzRunning = compressorHz !== null && compressorHz > 0;
    prev = prev || d;

    const outdoor = readFiniteValue(d, 'outdoor');
    const evapTemp = readFiniteValue(d, 'evap');
    const currentStarts = readFiniteValue(d, 'starts');
    const previousStarts = readFiniteValue(prev, 'starts');
    const startsDelta = currentStarts !== null && previousStarts !== null
        ? currentStarts - previousStarts
        : 0;
    const prevDm = readFiniteValue(prev, 'dm');
    const currentDm = readFiniteValue(d, 'dm');
    const prevSupply = readFiniteValue(prev, 'supply_line_eb101');
    const currentSupply = readFiniteValue(d, 'supply_line_eb101');
    const smDrop = prevDm !== null && currentDm !== null ? prevDm - currentDm : null;
    const tempDrop = prevSupply !== null && currentSupply !== null ? prevSupply - currentSupply : null;
    const previousHz = readFiniteValue(prev, 'compressor_hz');
    const prevHzRunning = previousHz !== null && previousHz > 0;

    const prodHeatingDelta = Number(d.kwh_p_heat || 0) - Number(prev.kwh_p_heat || 0);
    const prodCWUDelta = Number(d.kwh_p_cwu || 0) - Number(prev.kwh_p_cwu || 0);
    const bt6Delta = (Number(d.cwu_load) || 0) - (Number(prev.cwu_load) || 0);

    let isCWU = false, isCO = false, isDefrost = false, isOilReturn = false, isCompressorProtection = false;

    // The manual's defrost start curves end at +6°C outdoor temperature.
    const isDefrostOutdoorRange = outdoor !== null && outdoor <= 6;
    // Pre-defrost icing: coil runs well below freezing.
    const isEvapCold = evapTemp !== null && evapTemp < 2;
    // Mid-defrost: hot gas is reversed into the outdoor coil, so its
    // temperature spikes far above outdoor air.
    const isEvapHotSpike = outdoor !== null && evapTemp !== null && evapTemp > outdoor + 15;
    const evapSignature = isDefrostOutdoorRange && (isEvapCold || isEvapHotSpike);

    const explicitDefrost = d.defrosting == 1 && prev.defrosting != 1;
    // The compressor-stop and the starts-counter bump often land in different
    // 5-min samples (stop+evap spike in one row, restart counter in the next),
    // so a mid-run hz drop with an evap signature is treated as its own signal -
    // but only if the counter confirms a restart in the next sample. A stop
    // without a following start is an ordinary end of cycle, not a defrost.
    const nextStarts = readFiniteValue(next, 'starts');
    const startsBumpsNext = currentStarts !== null && nextStarts !== null && nextStarts > currentStarts;
    const hzStoppedMidRun = !hzRunning && prevHzRunning && (startsDelta > 0 || startsBumpsNext);
    const legacyRestartSignature = startsDelta > 0 && tempDrop !== null && tempDrop > 2.0 && smDrop !== null && smDrop > 4;
    // The 5-min sampling can miss the short `defrosting` flag, but the starts counter still
    // bumps when the compressor restarts while it was running in both neighbouring samples.
    const restartedWithinRun = startsDelta > 0 && prevHzRunning && hzRunning;
    const timeSinceStopSampleMs = prev.ts && runtime.previousSampleTs
        ? Utils.parseTs(prev.ts) - Utils.parseTs(runtime.previousSampleTs)
        : 0;
    const timeSinceCurrentSampleMs = d.ts && prev.ts
        ? Utils.parseTs(d.ts) - Utils.parseTs(prev.ts)
        : 0;
    const restartedAfterOneSampleStop = startsDelta > 0 && hzRunning &&
        !prevHzRunning && runtime.wasRunningBeforeStop === true &&
        timeSinceStopSampleMs > 0 && timeSinceStopSampleMs <= CONFIG.refreshIntervalMs + 120000 &&
        timeSinceCurrentSampleMs > 0 && timeSinceCurrentSampleMs <= CONFIG.refreshIntervalMs + 120000;
    const restartCandidate = !runtime.previousWasRestart &&
        (explicitDefrost || legacyRestartSignature || restartedWithinRun ||
            restartedAfterOneSampleStop || (hzStoppedMidRun && evapSignature));
    const accumulatedRunMs = runtime.accumulatedRunMsSinceRestart ?? 0;
    const runMsSinceCompressorStart = runtime.runMsSinceCompressorStart ?? 0;
    const oilReturnDue = runtime.isReliable !== false && accumulatedRunMs >= OIL_RETURN_INTERVAL_MS;
    // Condition B requires knowing that the previous defrost ended by its max-time limit,
    // which is not available in the logged data.
    const defrostConditionsA = runtime.isReliable !== false &&
        accumulatedRunMs > 37 * 60 * 1000 &&
        runMsSinceCompressorStart > 30 * 60 * 1000 &&
        runMsSinceCompressorStart >= 5 * 60 * 1000;

    if (restartCandidate) {
        if (hasCompressorProtectionSignal(d, prev)) {
            isCompressorProtection = true;
            isOilReturn = true;
        } else if (isDefrostOutdoorRange && defrostConditionsA && (explicitDefrost || evapSignature)) {
            isDefrost = true;
        } else if (oilReturnDue) {
            isOilReturn = true;
        } else {
            isOilReturn = true;
        }
    }
    else if (hzRunning && (prodCWUDelta > 0.01 || bt6Delta > 0.1)) {
        isCWU = true;
    }
    else if (hzRunning && prodHeatingDelta > 0.01) {
        isCO = true;
    }
    else {
        if (!hzRunning && tempDrop !== null && tempDrop <= 1.0) {
            return {
                isRunning: false,
                isCO: false,
                isCWU: false,
                isDefrost: false,
                isOilReturn: false,
                isCompressorProtection: false
            };
        }

        const supplyLine = readFiniteValue(d, 'supply_line_eb101');
        const bt25 = readFiniteValue(d, 'bt25_temp') ?? 0;
        const deltaBT = supplyLine === null ? 0 : supplyLine - bt25;
        isCWU = (deltaBT > 10 || bt6Delta > 0);
        isCO = !isCWU;
    }

    const isRunning = isDefrost || isCWU || isCO || isOilReturn;
    return { isRunning, isCO, isCWU, isDefrost, isOilReturn, isCompressorProtection };
}

export function processRawData(rawData) {
    let runningTotalCons = 0;
    let runningTotalCwu = 0;
    let accumulatedRunMsSinceRestart = 0;
    let runMsSinceCompressorStart = 0;
    let previousWasRestart = false;
    const maxSampleGapMs = CONFIG.refreshIntervalMs + 120000;

    return rawData.map((d, index) => {
        const prev = index > 0 ? rawData[index - 1] : d;
        if (index > 0) {
            const elapsedMs = Utils.parseTs(d.ts) - Utils.parseTs(prev.ts);
            const prevHzRunning = (Number(prev.compressor_hz) || 0) > 0;
            if (elapsedMs > 0 && elapsedMs <= maxSampleGapMs && prevHzRunning && !previousWasRestart) {
                accumulatedRunMsSinceRestart += elapsedMs;
                runMsSinceCompressorStart += elapsedMs;
            } else if (!prevHzRunning || elapsedMs <= 0 || elapsedMs > maxSampleGapMs || previousWasRestart) {
                runMsSinceCompressorStart = 0;
            }
        }

        const hz = Number(d.compressor_hz) || 0;
        const pump = Number(d.pump_speed) || 0;
        const out = d.outdoor;

        const estKw = estimatePower(hz, pump, out);
        const stepKwh = estKw / 12;

        const state = getWorkState(d, prev, rawData[index + 1], {
            accumulatedRunMsSinceRestart,
            runMsSinceCompressorStart,
            previousWasRestart,
            previousSampleTs: index > 1 ? rawData[index - 2].ts : null,
            wasRunningBeforeStop: index > 1 &&
                (Number(rawData[index - 2].compressor_hz) || 0) > 0 &&
                Utils.parseTs(prev.ts) - Utils.parseTs(rawData[index - 2].ts) <= maxSampleGapMs,
            isReliable: true
        });
        previousWasRestart = state.isDefrost || state.isOilReturn;
        if (previousWasRestart) {
            if (state.isDefrost || !state.isCompressorProtection) {
                accumulatedRunMsSinceRestart = 0;
            }
            runMsSinceCompressorStart = 0;
        }

        let stepCwu = 0;
        if (state.isRunning && state.isCWU) {
            stepCwu = stepKwh;
        }

        runningTotalCons += stepKwh;
        runningTotalCwu += stepCwu;

        return {
            ...d,
            tsMs: Utils.parseTs(d.ts),
            v_cum_total: runningTotalCons,
            v_cum_cwu: runningTotalCwu,
            v_inst_power: estKw,
            runAccumMs: accumulatedRunMsSinceRestart,
            workState: state
        };
    });
}

export function fillMissingData(sparseData, refreshIntervalMs = CONFIG.refreshIntervalMs) {
    if (!sparseData || sparseData.length === 0) return [];

    const fullData = [];
    // Pamięć ostatniego stanu (pełny obiekt)
    let lastKnownState = { ...sparseData[0] };

    // Margines błędu (np. 120 sekund), żeby drobne opóźnienia w Actions
    // nie były traktowane jako wielka dziura w danych
    const JITTER_MS = 120000;
    const MAX_ALLOWED_GAP = refreshIntervalMs + JITTER_MS;
    let prevTime = null;

    sparseData.forEach((entry, index) => {
        const currentTime = Utils.parseTs(entry.ts);

        if (index > 0) {
            const timeDiff = currentTime - prevTime;

            // 1. Jeśli różnica mieści się w interwale (+ margines)
            if (timeDiff <= MAX_ALLOWED_GAP) {
                // Łączymy: weź wszystko z poprzedniego stanu i nadpisz nowościami z entry
                const hydrated = { ...lastKnownState, ...entry };
                fullData.push(hydrated);
                lastKnownState = hydrated;
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
        prevTime = currentTime;
    });

    return fullData;
}

export function calculateRange(frameKey, referenceDate = new Date()) {
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

export function prepareWorkZones(dRange) {
    return dRange.map(d => {
        const state = d.workState || { isCO: false, isCWU: false, isDefrost: false, isOilReturn: false, isRunning: false };

        return {
            x: Utils.recordTime(d),
            yCO: state.isCO ? 1 : 0,
            yCWU: state.isCWU ? 1 : 0,
            yDefrost: state.isDefrost ? 1 : 0,
            yOilReturn: state.isOilReturn ? 1 : 0,
            isRunning: state.isRunning
        };
    });
}

export function getCurrentCycleMetrics(processedData, now = Date.now()) {
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
            sinceRestartMs: 0,
            untilOilReturnMs: null,
            currentCycleRestarts: 0,
            modeLabel: ''
        };
    }

    let cycleStartIndex = lastActiveIndex;
    while (cycleStartIndex > 0 && processedData[cycleStartIndex - 1].workState?.isRunning) {
        cycleStartIndex--;
    }

    const cyclePoints = processedData.slice(cycleStartIndex, lastActiveIndex + 1);
    const cycleStartTs = Utils.recordTime(processedData[cycleStartIndex]);
    const downtimeStartTs = !isRunningNow
        ? Utils.recordTime(processedData[lastActiveIndex + 1])
        : 0;
    const firstCyclePoint = cyclePoints[0];
    const lastCyclePoint = cyclePoints[cyclePoints.length - 1];
    const currentCycleRestarts = Math.max(
        0,
        (Number(lastCyclePoint.starts) || 0) - (Number(firstCyclePoint.starts) || 0)
    );
    // Last restart inside the running cycle: starts counter bump or a defrost/oil-return sample.
    let lastRestartIndex = cycleStartIndex;
    for (let index = lastActiveIndex; index > cycleStartIndex; index--) {
        const point = processedData[index];
        const startsBumped = (Number(point.starts) || 0) > (Number(processedData[index - 1].starts) || 0);
        if (startsBumped || point.workState?.isDefrost || point.workState?.isOilReturn) {
            lastRestartIndex = index;
            break;
        }
    }
    const sinceRestartTs = Utils.recordTime(processedData[lastRestartIndex]);
    const lastRecord = processedData[processedData.length - 1];
    let untilOilReturnMs = null;
    if (isRunningNow && Number.isFinite(lastRecord.runAccumMs)) {
        // Time since the last sample is not yet in the accumulated counter.
        const maxSampleGapMs = CONFIG.refreshIntervalMs + 120000;
        const sinceLastSampleMs = Math.min(maxSampleGapMs, Math.max(0, now - Utils.recordTime(lastRecord)));
        untilOilReturnMs = Math.max(0, OIL_RETURN_INTERVAL_MS - lastRecord.runAccumMs - sinceLastSampleMs);
    }
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
        currentDowntimeMs: isRunningNow ? 0 : Math.max(0, now - downtimeStartTs),
        sinceRestartMs: isRunningNow ? Math.max(0, now - sinceRestartTs) : 0,
        untilOilReturnMs,
        currentCycleRestarts,
        modeLabel
    };
}

export function assembleFinalStats(processedData, dRange, lastInView, prevInView, firstInView, absoluteLastTs, rangeStart, rangeEnd, activeFrame) {
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
    const workZones = prepareWorkZones(dRange);
    const {
        isRunningNow,
        currentUptimeMs,
        currentDowntimeMs,
        sinceRestartMs,
        untilOilReturnMs,
        currentCycleRestarts,
        modeLabel
    } =  getCurrentCycleMetrics(processedData);

    // --- ZDROWIE I ETYKIETY ---
    const now = new Date();
    const delayMs = 120000;
    const effectiveEnd = rangeEnd > now ? new Date(now.getTime() - delayMs) : rangeEnd;
    const durationMs = effectiveEnd.getTime() - rangeStart.getTime();
    const intervalMs = CONFIG.intervalMinutes * 60 * 1000;
    const expectedRecords = Math.max(1, Math.floor(durationMs / intervalMs) + 1);
    const health = (dRange.length / expectedRecords) * 100;
    const healthPercent = isNaN(health) ? "0.0" : Math.min(100, health).toFixed(1);
    const rangeLabel = activeFrame || '24h';

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
            sinceRestartMs: sinceRestartMs,
            untilOilReturnMs: untilOilReturnMs,
            isRunningNow: isRunningNow,
            rangeRestarts: isRunningNow ? currentCycleRestarts : 0,
            currentCycleMode: modeLabel, // Zawsze zdefiniowane (nawet jako "")

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
