import test from 'node:test';
import assert from 'node:assert/strict';
import {
    estimatePower,
    getWorkState,
    processRawData,
    fillMissingData,
    calculateRange,
    prepareWorkZones,
    getCurrentCycleMetrics,
    assembleFinalStats
} from '../../web/dataProcessing.js';

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

test('getWorkState detects a restart signature as defrost when evaporator is cold', () => {
    const prev = { starts: 1, dm: 20, supply_line_eb101: 35, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0 };
    const curr = {
        starts: 2, dm: 10, supply_line_eb101: 32, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0,
        outdoor: 5, evap: 0, compressor_hz: 40
    };
    const state = getWorkState(curr, prev);
    assert.equal(state.isDefrost, true);
    assert.equal(state.isOilReturn, false);
});

test('getWorkState treats stopped compressor with no drop as idle', () => {
    const prev = { starts: 1, dm: 0, supply_line_eb101: 30, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0 };
    const curr = { starts: 1, dm: 0, supply_line_eb101: 30, kwh_p_heat: 5, kwh_p_cwu: 5, cwu_load: 0, compressor_hz: 0 };
    const state = getWorkState(curr, prev);
    assert.deepEqual(state, { isRunning: false, isCO: false, isCWU: false, isDefrost: false, isOilReturn: false });
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
    const range = calculateRange('1d', reference);
    assert.equal(range.startDate.getDate(), 15);
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
});
