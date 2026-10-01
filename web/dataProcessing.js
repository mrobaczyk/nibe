// dataProcessing.js
// Pure data transformation helpers used by App. No DOM access, no localStorage.
import { CONFIG } from './config.js';

export function estimatePower(hz, pumpSpeed, tempExt) {
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

export function getWorkState(d, prev) {
    const hzRunning = (Number(d.compressor_hz) || 0) > 0;
    prev = prev || d;

    const outdoor = Number(d.outdoor || 0);
    const evapTemp = Number(d.evap || 0);
    const startsDelta = (Number(d.starts) || 0) - (Number(prev.starts) || 0);
    const smDrop = (prev.dm || 0) - (d.dm || 0);
    const tempDrop = (prev.supply_line_eb101 || 0) - d.supply_line_eb101;
    const prevHzRunning = (Number(prev.compressor_hz) || 0) > 0;

    const prodHeatingDelta = Number(d.kwh_p_heat || 0) - Number(prev.kwh_p_heat || 0);
    const prodCWUDelta = Number(d.kwh_p_cwu || 0) - Number(prev.kwh_p_cwu || 0);
    const bt6Delta = (Number(d.cwu_load) || 0) - (Number(prev.cwu_load) || 0);

    let isCWU = false, isCO = false, isDefrost = false, isOilReturn = false;

    // Above this, even at max compressor load the evaporating temp rarely dips below 0°C, so icing is implausible.
    const isPhysicallyPlausible = outdoor < 15;
    // Pre-defrost icing: coil runs well below freezing.
    const isEvapCold = evapTemp < 2;
    // Mid-defrost: hot gas is reversed into the outdoor coil, so its
    // temperature spikes far above outdoor air even on mild days (~13°C).
    const isEvapHotSpike = evapTemp > outdoor + 15;
    const evapSignature = isPhysicallyPlausible && (isEvapCold || isEvapHotSpike);

    const explicitDefrost = d.defrosting == 1;
    // The compressor-stop and the starts-counter bump often land in different
    // 5-min samples (stop+evap spike in one row, restart counter in the next),
    // so a mid-run hz drop with an evap signature is treated as its own signal.
    const hzStoppedMidRun = !hzRunning && prevHzRunning;
    const legacyRestartSignature = startsDelta > 0 && tempDrop > 2.0 && smDrop > 4;
    const hasRestartSignature = explicitDefrost || legacyRestartSignature || (hzStoppedMidRun && evapSignature);

    if (hasRestartSignature) {
        if (explicitDefrost || evapSignature) {
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

export function processRawData(rawData) {
    let runningTotalCons = 0;
    let runningTotalCwu = 0;

    return rawData.map((d, index) => {
        const prev = index > 0 ? rawData[index - 1] : d;

        const hz = Number(d.compressor_hz) || 0;
        const pump = Number(d.pump_speed) || 0;
        const out = Number(d.outdoor) || 10;

        const estKw = estimatePower(hz, pump, out);
        const stepKwh = estKw / 12;

        const state = getWorkState(d, prev);

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

export function fillMissingData(sparseData, refreshIntervalMs = CONFIG.refreshIntervalMs) {
    if (!sparseData || sparseData.length === 0) return [];

    const fullData = [];
    // Pamięć ostatniego stanu (pełny obiekt)
    let lastKnownState = { ...sparseData[0] };

    // Margines błędu (np. 120 sekund), żeby drobne opóźnienia w Actions
    // nie były traktowane jako wielka dziura w danych
    const JITTER_MS = 120000;
    const MAX_ALLOWED_GAP = refreshIntervalMs + JITTER_MS;

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
            x: new Date(d.ts + " UTC").getTime(),
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
        currentCycleRestarts,
        modeLabel
    } = getCurrentCycleMetrics(processedData);

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
