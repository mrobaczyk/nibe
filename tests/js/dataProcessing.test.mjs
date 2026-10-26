import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../../web/config.js';
import {
    setPowerModel,
    estimatePower,
    getWorkState,
    processRawData,
    fillMissingData,
    calculateRange,
    prepareWorkZones,
    getCurrentCycleMetrics,
    assembleFinalStats
} from '../../web/dataProcessing.js';

const powerModelUrl = new URL('../../data/power_model.json', import.meta.url);
setPowerModel(JSON.parse(readFileSync(powerModelUrl, 'utf-8')));

test('estimatePower matches reference values from the shared model', () => {
    // Te same wartości sprawdza tests/test_data_utils.py dla backendu.
    assert.equal(Number(estimatePower(40, 50, 5).toFixed(3)), 1.195);
    assert.equal(Number(estimatePower(40, 50, 0).toFixed(3)), 1.31);
});

test('estimatePower treats missing outdoor temperature as the model default and 0°C as real', () => {
    assert.equal(estimatePower(40, 50, undefined), estimatePower(40, 50, 10));
    assert.equal(estimatePower(40, 50, NaN), estimatePower(40, 50, 10));
    assert.notEqual(estimatePower(40, 50, 0), estimatePower(40, 50, 10));
});

test('estimatePower throws when no model is loaded', () => {
    assert.throws(() => estimatePower(40, 50, 5, null), /Model mocy/);
});

test('estimatePower returns standby power below 1Hz', () => {
    assert.equal(estimatePower(0, 0, 5), 0.02);
});

test('estimatePower rises with lower outdoor temperature', () => {
    const warm = estimatePower(40, 50, 10);
    const cold = estimatePower(40, 50, -5);
    assert.ok(cold > warm, 'colder outdoor temp should increase estimated power');
});

test('estimatePower adds defrost-tray surcharge below 2°C', () => {
    const justAbove = estimatePower(40, 50, 2.1);
    const justBelow = estimatePower(40, 50, 1.9);
    assert.ok(justBelow - justAbove > 0.05);
});

test('getWorkState detects CWU production from produced-energy delta', () => {
    const prev = { kwh_p_cwu: 10, kwh_p_heat: 5, cwu_load: 0, supply_line_eb101: 30, starts: 1, dm: 0 };
    const curr = { kwh_p_cwu: 10.5, kwh_p_heat: 5, cwu_load: 0, supply_line_eb101: 30, starts: 1, dm: 0, compressor_hz: 40 };
    const state = getWorkState(curr, prev);
    assert.equal(state.isCWU, true);
    assert.equal(state.isCO, false);
    assert.equal(state.isRunning, true);
});

test('getWorkState detects CO production from heating-energy delta', () => {
    const prev = { kwh_p_cwu: 10, kwh_p_heat: 5, cwu_load: 0, supply_line_eb101: 30, starts: 1, dm: 0 };
    const curr = { kwh_p_cwu: 10, kwh_p_heat: 5.5, cwu_load: 0, supply_line_eb101: 30, starts: 1, dm: 0, compressor_hz: 40 };
    const state = getWorkState(curr, prev);
    assert.equal(state.isCO, true);
    assert.equal(state.isCWU, false);
});

test('getWorkState does not infer running from production counter updates with compressor stopped', () => {
    const prev = { kwh_p_cwu: 10, kwh_p_heat: 5, cwu_load: 0, supply_line_eb101: 30, starts: 1, dm: 0, compressor_hz: 0 };
    const curr = { kwh_p_cwu: 10, kwh_p_heat: 5.3, cwu_load: 0, supply_line_eb101: 30, starts: 1, dm: 0, compressor_hz: 0 };
    const state = getWorkState(curr, prev);
    assert.equal(state.isRunning, false);
    assert.equal(state.isCO, false);
});

test('getWorkState detects a restart signature as defrost when evaporator is cold', () => {
    const prev = { starts: 1, dm: 20, supply_line_eb101: 35, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0 };
    const curr = {
        starts: 2, dm: 10, supply_line_eb101: 32, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0,
        outdoor: 5, evap: 0, compressor_hz: 40
    };
    const state = getWorkState(curr, prev, null, {
        accumulatedRunMsSinceRestart: 40 * 60 * 1000,
        runMsSinceCompressorStart: 31 * 60 * 1000
    });
    assert.equal(state.isDefrost, true);
    assert.equal(state.isOilReturn, false);
});

test('getWorkState classifies a mild-day hot evaporator spike as oil return', () => {
    // Oil return also reverses the cycle, so a hot evaporator alone is not
    // enough to identify defrost when outdoor conditions do not support icing.
    const prev = { starts: 1719, dm: 20, supply_line_eb101: 41.2, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0 };
    const curr = {
        starts: 1720, dm: 10, supply_line_eb101: 30.9, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0,
        outdoor: 12.6, evap: 32.1, compressor_hz: 0
    };
    const state = getWorkState(curr, prev);
    assert.equal(state.isDefrost, false);
    assert.equal(state.isOilReturn, true);
});

test('getWorkState classifies the 2026-10-24 warm explicit defrost flag as oil return', () => {
    const prev = {
        starts: 1787, dm: -182, supply_line_eb101: 25.8, kwh_p_heat: 6171.7,
        kwh_p_cwu: 1721.4, cwu_load: 39.7, compressor_hz: 25
    };
    const curr = {
        starts: 1787, dm: -193, supply_line_eb101: 26.3, kwh_p_heat: 6171.7,
        kwh_p_cwu: 1721.4, cwu_load: 39.7, outdoor: 12.8, evap: 6,
        compressor_hz: 0, defrosting: 1
    };
    const state = getWorkState(curr, prev, { starts: 1788 });
    assert.equal(state.isDefrost, false);
    assert.equal(state.isOilReturn, true);
});

test('getWorkState detects defrost before the starts counter increments', () => {
    // The compressor-stop + evap spike land here, the starts bump on the next row.
    const prev = { starts: 1719, dm: 20, supply_line_eb101: 41.2, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0, compressor_hz: 49 };
    const curr = {
        starts: 1719, dm: 15, supply_line_eb101: 30.9, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0,
        outdoor: 5.6, evap: 32.1, compressor_hz: 0
    };
    const state = getWorkState(curr, prev, { starts: 1720 }, {
        accumulatedRunMsSinceRestart: 40 * 60 * 1000,
        runMsSinceCompressorStart: 31 * 60 * 1000
    });
    assert.equal(state.isDefrost, true);
    assert.equal(state.isOilReturn, false);
});

test('getWorkState requires the manual timing conditions before classifying defrost', () => {
    const prev = { starts: 1, dm: 20, supply_line_eb101: 35, compressor_hz: 25 };
    const curr = {
        starts: 2, dm: 10, supply_line_eb101: 32, outdoor: 5, evap: 0,
        compressor_hz: 0, defrosting: 1
    };
    const state = getWorkState(curr, prev, null, {
        accumulatedRunMsSinceRestart: 10 * 60 * 1000,
        runMsSinceCompressorStart: 10 * 60 * 1000
    });
    assert.equal(state.isDefrost, false);
    assert.equal(state.isOilReturn, true);
});

test('getWorkState classifies an event at three accumulated compressor hours as technological restart', () => {
    const state = getWorkState(
        { starts: 2, outdoor: 5, evap: 0, compressor_hz: 0, defrosting: 1 },
        { starts: 1, compressor_hz: 25 },
        null,
        {
            accumulatedRunMsSinceRestart: 3 * 60 * 60 * 1000,
            runMsSinceCompressorStart: 10 * 60 * 1000
        }
    );
    assert.equal(state.isDefrost, false);
    assert.equal(state.isOilReturn, true);
});

test('valid manual defrost conditions take precedence over the three-hour oil-return timer', () => {
    const state = getWorkState(
        { starts: 2, outdoor: 5, evap: 0, compressor_hz: 0, defrosting: 1 },
        { starts: 1, compressor_hz: 25 },
        null,
        {
            accumulatedRunMsSinceRestart: 3 * 60 * 60 * 1000,
            runMsSinceCompressorStart: 31 * 60 * 1000
        }
    );
    assert.equal(state.isDefrost, true);
    assert.equal(state.isOilReturn, false);
});

test('getWorkState does not infer cold defrost conditions from missing temperatures', () => {
    const state = getWorkState(
        { starts: 2, evap: 0, compressor_hz: 0, defrosting: 1 },
        { starts: 1, compressor_hz: 25 }
    );
    assert.equal(state.isDefrost, false);
    assert.equal(state.isOilReturn, true);
});

test('getWorkState detects a restart inside a running cycle from the starts counter alone', () => {
    const prev = { starts: 1790, compressor_hz: 34, outdoor: 8.3, evap: 3 };
    const curr = { starts: 1791, compressor_hz: 34, outdoor: 8.3, evap: 3 };
    const state = getWorkState(curr, prev, null, {
        accumulatedRunMsSinceRestart: 175 * 60 * 1000,
        runMsSinceCompressorStart: 175 * 60 * 1000
    });
    assert.equal(state.isOilReturn || state.isDefrost, true);
});

test('getWorkState does not treat an ordinary compressor start as a restart', () => {
    const prev = { starts: 1790, compressor_hz: 0 };
    const curr = { starts: 1791, compressor_hz: 40, outdoor: 8.3, evap: 3, kwh_p_heat: 1, kwh_p_cwu: 1 };
    const state = getWorkState(curr, prev);
    assert.equal(state.isOilReturn || state.isDefrost, false);
});

test('getWorkState does not count a repeated defrost flag as a second restart', () => {
    const state = getWorkState(
        { starts: 2, outdoor: 5, evap: 0, compressor_hz: 0, defrosting: 1 },
        { starts: 1, compressor_hz: 25, defrosting: 1 },
        null,
        { previousWasRestart: true }
    );
    assert.equal(state.isDefrost, false);
    assert.equal(state.isOilReturn, false);
});

test('getWorkState classifies a hot-gas protection stop as technological restart', () => {
    const prev = { starts: 1, compressor_hz: 25, hot_gas: 116 };
    const curr = { starts: 2, compressor_hz: 0, outdoor: 5, evap: 0, defrosting: 1 };
    const state = getWorkState(curr, prev, null, {
        accumulatedRunMsSinceRestart: 40 * 60 * 1000,
        runMsSinceCompressorStart: 31 * 60 * 1000
    });
    assert.equal(state.isDefrost, false);
    assert.equal(state.isOilReturn, true);
    assert.equal(state.isCompressorProtection, true);
});

test('getWorkState recognizes sustained low-pressure protection only with consecutive evidence', () => {
    const prev = {
        ts: '2026-01-01 00:00', starts: 1, compressor_hz: 25,
        low_pressure: 1.2, suction_gas: 35, evap: 0
    };
    const curr = {
        ts: '2026-01-01 00:05', starts: 2, compressor_hz: 0,
        low_pressure: 1.2, suction_gas: 35, evap: 0, outdoor: 5, defrosting: 1
    };
    const state = getWorkState(curr, prev);
    assert.equal(state.isOilReturn, true);
    assert.equal(state.isCompressorProtection, true);
});

test('processRawData preserves accumulated runtime over downtime and resets it after oil return', () => {
    const raw = [];
    const addSample = (minute, overrides = {}) => {
        const timestamp = new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString().slice(0, 16).replace('T', ' ');
        raw.push({
            ts: timestamp,
            starts: 1,
            dm: 0,
            supply_line_eb101: 30,
            bt25_temp: 25,
            kwh_p_heat: 5 + minute / 1000,
            kwh_p_cwu: 5,
            cwu_load: 0,
            outdoor: 5,
            evap: 0,
            liquid_line: 25,
            low_pressure: 8,
            hot_gas: 90,
            suction_gas: 5,
            compressor_hz: 30,
            ...overrides
        });
    };

    for (let minute = 0; minute <= 165; minute += 5) addSample(minute);
    addSample(170, { compressor_hz: 0 });
    addSample(20 * 60 + 50);
    addSample(20 * 60 + 55);
    addSample(21 * 60, { compressor_hz: 0, starts: 2, defrosting: 1 });
    for (let minute = 21 * 60 + 5; minute < 22 * 60; minute += 5) addSample(minute);
    addSample(22 * 60, { compressor_hz: 0, starts: 3, defrosting: 1 });

    const processed = processRawData(raw);
    const oilReturn = processed.find(sample => sample.starts === 2);
    const defrost = processed.find(sample => sample.starts === 3);
    assert.equal(oilReturn.workState.isOilReturn, true);
    assert.equal(defrost.workState.isDefrost, true);
    assert.equal(defrost.workState.isOilReturn, false);
});

test('getWorkState does not treat a plain compressor stop with cold evaporator as defrost', () => {
    // Real case 2026-10-17 04:35: hz 66 -> 0, evap -0.1, no starts bump afterwards.
    const prev = { starts: 1760, dm: 100, supply_line_eb101: 53, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0, compressor_hz: 66 };
    const curr = {
        starts: 1760, dm: 100, supply_line_eb101: 26.6, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0,
        outdoor: 6.2, evap: -0.1, compressor_hz: 0
    };
    const state = getWorkState(curr, prev, { starts: 1760 });
    assert.equal(state.isDefrost, false);
    assert.equal(state.isOilReturn, false);
}); 

test('getWorkState treats stopped compressor with no drop as idle', () => {
    const prev = { starts: 1, dm: 0, supply_line_eb101: 30, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0 };
    const curr = { starts: 1, dm: 0, supply_line_eb101: 30, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0, compressor_hz: 0 };
    const state = getWorkState(curr, prev);
    assert.deepEqual(state, {
        isRunning: false, isCO: false, isCWU: false, isDefrost: false,
        isOilReturn: false, isCompressorProtection: false
    });
});

test('processRawData accumulates cumulative consumption across entries', () => {
    const raw = [
        { ts: '2026-01-01 00:00', compressor_hz: 40, pump_speed: 50, outdoor: 5, kwh_p_heat: 0, kwh_p_cwu: 0, cwu_load: 0, supply_line_eb101: 30, starts: 0, dm: 0 },
        { ts: '2026-01-01 00:05', compressor_hz: 40, pump_speed: 50, outdoor: 5, kwh_p_heat: 0.1, kwh_p_cwu: 0, cwu_load: 0, supply_line_eb101: 30, starts: 0, dm: 0 }
    ];
    const result = processRawData(raw);
    assert.equal(result.length, 2);
    assert.ok(result[1].v_cum_total > result[0].v_cum_total);
    assert.ok('workState' in result[1]);
});

test('processRawData does not mutate input and sets tsMs in UTC', () => {
    const raw = [{ ts: '2026-01-01 00:00', compressor_hz: 40, pump_speed: 50, outdoor: 5 }];
    const [item] = processRawData(raw);
    assert.equal(item.tsMs, Date.UTC(2026, 0, 1, 0, 0));
    assert.ok(!('v_cum_total' in raw[0]));
    assert.ok(!('tsMs' in raw[0]));
});

test('fillMissingData hydrates small gaps with the previous known state', () => {
    const sparse = [
        { ts: '2026-01-01 00:00:00', dm: 10, extra: 'a' },
        { ts: '2026-01-01 00:05:00', dm: 20 }
    ];
    const result = fillMissingData(sparse, 5 * 60 * 1000);
    assert.equal(result[1].extra, 'a', 'missing fields should be hydrated from previous entry');
    assert.equal(result[1].dm, 20, 'explicit fields from the entry should win');
});

test('fillMissingData starts a fresh snapshot after a large gap', () => {
    const sparse = [
        { ts: '2026-01-01 00:00:00', dm: 10, extra: 'a' },
        { ts: '2026-01-01 05:00:00', dm: 20 }
    ];
    const result = fillMissingData(sparse, 5 * 60 * 1000);
    assert.equal('extra' in result[1], false, 'large gaps should not inherit stale fields');
});

test('calculateRange computes an hourly window ending at the reference hour', () => {
    const reference = new Date(2026, 0, 15, 13, 30, 0);
    const range = calculateRange('3h', reference);
    assert.equal(range.startDate.getHours(), 11);
    assert.equal(range.endDate.getHours(), 13);
    assert.ok(Math.abs(range.durationHrs - 3) < 0.01);
});

test('calculateRange computes a full-day window for day frames', () => {
    const reference = new Date(2026, 0, 15, 13, 30, 0);
    const range = calculateRange('3d', reference);
    assert.equal(range.startDate.getDate(), 13);
    assert.equal(range.startDate.getHours(), 0);
    assert.equal(range.endDate.getHours(), 23);
});

test('prepareWorkZones maps work states into chart zone flags', () => {
    const dRange = [
        { ts: '2026-01-01 00:00', workState: { isCO: true, isCWU: false, isDefrost: false, isOilReturn: false, isRunning: true } }
    ];
    const zones = prepareWorkZones(dRange);
    assert.equal(zones[0].yCO, 1);
    assert.equal(zones[0].yCWU, 0);
    assert.equal(zones[0].isRunning, true);
});

test('getCurrentCycleMetrics reports zero uptime when nothing has ever run', () => {
    const processedData = [
        { ts: '2026-01-01 00:00', starts: 0, workState: { isRunning: false, isCO: false, isCWU: false } }
    ];
    const metrics = getCurrentCycleMetrics(processedData);
    assert.equal(metrics.isRunningNow, false);
    assert.equal(metrics.currentUptimeMs, 0);
    assert.equal(metrics.modeLabel, '');
});

test('getCurrentCycleMetrics starts downtime at the first stopped sample', () => {
    const now = new Date('2026-01-01T00:20:00Z').getTime();
    const processedData = [
        { ts: '2026-01-01 00:00', workState: { isRunning: true } },
        { ts: '2026-01-01 00:05', workState: { isRunning: false } },
        { ts: '2026-01-01 00:10', workState: { isRunning: false } }
    ];

    const metrics = getCurrentCycleMetrics(processedData, now);

    assert.equal(metrics.isRunningNow, false);
    assert.equal(metrics.currentDowntimeMs, 15 * 60 * 1000);
});

test('getCurrentCycleMetrics estimates time left to the 3h oil-return runtime', () => {
    const now = new Date('2026-01-01T01:02:00Z').getTime();
    const processedData = [
        { ts: '2026-01-01 01:00', runAccumMs: 90 * 60 * 1000, workState: { isRunning: true, isCO: true } }
    ];
    const metrics = getCurrentCycleMetrics(processedData, now);
    assert.equal(metrics.untilOilReturnMs, 88 * 60 * 1000);
});

test('getCurrentCycleMetrics does not estimate oil return while stopped', () => {
    const processedData = [
        { ts: '2026-01-01 01:00', runAccumMs: 90 * 60 * 1000, workState: { isRunning: false } }
    ];
    assert.equal(getCurrentCycleMetrics(processedData).untilOilReturnMs, null);
});

test('processRawData exposes accumulated compressor runtime', () => {
    const raw = [0, 5, 10].map(minute => ({
        ts: `2026-01-01 00:${String(minute).padStart(2, '0')}`,
        compressor_hz: 30, pump_speed: 50, outdoor: 5, kwh_p_heat: 5 + minute / 100,
        kwh_p_cwu: 5, cwu_load: 0, supply_line_eb101: 30, starts: 1, dm: 0
    }));
    const result = processRawData(raw);
    assert.equal(result[2].runAccumMs, 10 * 60 * 1000);
});

test('getCurrentCycleMetrics labels an active combined CO+CWU cycle', () => {
    const now = new Date('2026-01-01T01:00:00Z').getTime();
    const processedData = [
        { ts: '2026-01-01 00:00', starts: 5, workState: { isRunning: true, isCO: true, isCWU: false } },
        { ts: '2026-01-01 00:30', starts: 5, workState: { isRunning: true, isCO: false, isCWU: true } }
    ];
    const metrics = getCurrentCycleMetrics(processedData, now);
    assert.equal(metrics.isRunningNow, true);
    assert.equal(metrics.modeLabel, '(CO + CWU)');
    assert.ok(metrics.currentUptimeMs > 0);
});

test('assembleFinalStats computes range COP from consumption and production deltas', () => {
    const point = (overrides) => ({
        ts: '2026-04-01 00:00', starts: 0, op_time_total: 0, op_time_cwu: 0,
        kwh_p_heat: 0, kwh_p_cwu: 0, v_cum_total: 0, v_cum_cwu: 0, v_inst_power: 0,
        workState: { isCO: false, isCWU: false, isDefrost: false, isOilReturn: false, isRunning: false },
        ...overrides
    });
    const first = point({ kwh_p_heat: 100, kwh_p_cwu: 50, v_cum_total: 40 });
    const last = point({ kwh_p_heat: 110, kwh_p_cwu: 55, v_cum_total: 45, starts: 2, op_time_total: 3 });
    const processedData = [first, last];
    const rangeStart = new Date('2026-04-01T00:00:00Z');
    const rangeEnd = new Date('2026-04-01T01:00:00Z');
    const absoluteLastTs = new Date('2026-04-01T00:30:00Z').getTime();

    const stats = assembleFinalStats(processedData, processedData, last, first, first, absoluteLastTs, rangeStart, rangeEnd, '1h');

    assert.equal(stats.calculated.diffKwh, 15);
    assert.equal(stats.calculated.diffConsKwh, 5);
    assert.equal(stats.calculated.rangeCop, 3);
    assert.equal(stats.calculated.rangeLabel, '1h');

    const consumptionKpi = CONFIG.KPIS.find(kpi => kpi.id === 'consumption');
    assert.equal(consumptionKpi.v(stats), '45.0');
    assert.match(consumptionKpi.u(stats), /1h: \+5\.0/);
});
