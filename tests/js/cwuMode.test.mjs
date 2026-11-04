import test from 'node:test';
import assert from 'node:assert/strict';
import { setConfigHistory, getCwuMode, getWarsawClock, applyConfigToSamples, getCwuTargetTemp, getCwuStartTemp, getNextPeriodicIncrease, getDaysToPeriodicIncrease } from '../../web/cwuMode.js';

// Schedule 1: 17:15-06:00 comfort 0 every day; schedule 2: 07:15-16:00 comfort 0.
function dayValues(base, offsetStart, value) {
    const v = {};
    for (let i = 0; i < 7; i++) v[String(base + offsetStart + i)] = value;
    return v;
}
const baseline = {
    '47669': 1, ...dayValues(47669, 2, 62100), ...dayValues(47669, 10, 21600), ...dayValues(47669, 18, 0),
    '47635': 1, ...dayValues(47635, 2, 26100), ...dayValues(47635, 10, 57600), ...dayValues(47635, 18, 0)
};

test('warsaw clock uses local time with DST', () => {
    // 2026-07-01 10:00 UTC = 12:00 CEST (Wednesday)
    assert.deepEqual(getWarsawClock(Date.UTC(2026, 6, 1, 10, 0)), { day: 3, date: '2026-07-01', seconds: 12 * 3600 });
    // 2026-01-07 10:00 UTC = 11:00 CET (Wednesday)
    assert.deepEqual(getWarsawClock(Date.UTC(2026, 0, 7, 10, 0)), { day: 3, date: '2026-01-07', seconds: 11 * 3600 });
});

test('schedule window overrides demand, outside uses demand', () => {
    setConfigHistory([{ ts: '2026-11-01 00:00', values: baseline }]);
    // 2026-11-04 (Wed) 09:00 UTC = 10:00 CET -> schedule 2 -> economy
    assert.deepEqual(getCwuMode({ ts: '2026-11-04 09:00', hot_water_demand: 1 }), { mode: 0, source: 'schedule' });
    // 16:30 UTC = 17:30 CET -> schedule 1 -> economy
    assert.equal(getCwuMode({ ts: '2026-11-04 16:30', hot_water_demand: 1 }).mode, 0);
    // 03:00 UTC = 04:00 CET -> schedule 1 after midnight -> economy
    assert.equal(getCwuMode({ ts: '2026-11-04 03:00', hot_water_demand: 1 }).source, 'schedule');
    // 05:30 UTC = 06:30 CET -> gap -> demand normal
    assert.deepEqual(getCwuMode({ ts: '2026-11-04 05:30', hot_water_demand: 1 }), { mode: 1, source: 'demand' });
});

test('luxury via demand or boost, unknown before baseline', () => {
    setConfigHistory([
        { ts: '2026-11-01 00:00', values: baseline },
    ]);
    assert.deepEqual(getCwuMode({ ts: '2026-11-04 12:30', hot_water_demand: 2 }), { mode: 2, source: 'demand' });
    assert.deepEqual(getCwuMode({ ts: '2026-11-04 05:30', hot_water_boost: 1 }), { mode: 2, source: 'boost' });
    assert.equal(getCwuMode({ ts: '2026-10-01 00:00' }), null);
});

test('disabled comfort (-1) and inactive schedule are ignored', () => {
    setConfigHistory([{ ts: '2026-11-01 00:00', values: { ...baseline, ...dayValues(47635, 18, -1), '47669': 0 } }]);
    assert.deepEqual(getCwuMode({ ts: '2026-11-04 09:00', hot_water_demand: 1 }), { mode: 1, source: 'demand' });
});

test('applyConfigToSamples adds config values valid at each sample time', () => {
    setConfigHistory([
        { ts: '2026-11-01 00:00', values: { '47206': -180, '47377': 24 } },
        { ts: '2026-11-04 12:00', values: { '47206': -200 } }
    ]);
    const samples = [{ ts: '2026-10-31 23:55' }, { ts: '2026-11-02 10:00' }, { ts: '2026-11-04 12:00' }];
    applyConfigToSamples(samples);
    assert.equal(samples[0].start_gm_level, undefined);
    assert.deepEqual([samples[1].start_gm_level, samples[1].filter_time], [-180, 24]);
    assert.deepEqual([samples[2].start_gm_level, samples[2].filter_time], [-200, 24]);
});

test('periodic increase detected from charge set point, target temp follows mode', () => {
    setConfigHistory([{ ts: '2026-11-01 00:00', values: { ...baseline, '47043': 42, '47044': 40, '47045': 15, '47046': 55, '47047': 48, '47048': 44, '47049': 36 } }]);
    const periodic = { ts: '2026-11-04 05:30', hot_water_demand: 1, cwu_setpoint: 57 };
    assert.deepEqual(getCwuMode(periodic), { mode: 3, source: 'setpoint' });
    assert.equal(getCwuTargetTemp(periodic), 55);
    const normal = { ts: '2026-11-04 05:30', hot_water_demand: 1, cwu_setpoint: 46 };
    assert.equal(getCwuMode(normal).mode, 1);
    assert.equal(getCwuTargetTemp(normal), 44);
    assert.equal(getCwuTargetTemp({ ts: '2026-11-04 09:00', hot_water_demand: 1, cwu_setpoint: -32768 }), 36);
}); 

test('periodic increase from config date and start hour while charging', () => {
    setConfigHistory([{ ts: '2025-12-29 00:00', values: { ...baseline, '47050': 1, '49909': 16, '50249': '2026-11-03' } }]);
    // 2026-11-03 15:30 UTC = 16:30 CET, charging
    assert.equal(getCwuMode({ ts: '2026-11-03 15:30', priority: 20 }).source, 'periodic');
    assert.notEqual(getCwuMode({ ts: '2026-11-03 15:30', priority: 30 }).source, 'periodic');
    assert.notEqual(getCwuMode({ ts: '2026-11-04 15:30', priority: 20 }).source, 'periodic');
});

test('missing demand in old samples defaults to Normal', () => {
    setConfigHistory([{ ts: '2025-12-29 00:00', values: baseline }]);
    assert.deepEqual(getCwuMode({ ts: '2026-11-04 05:30' }), { mode: 1, source: 'demand' });
});

test('periodic increase days extrapolate backwards by period from the next date', () => {
    setConfigHistory([{ ts: '2025-12-29 00:00', values: { ...baseline, '47050': 1, '47051': 31, '49909': 16, '50249': '2026-12-04' } }]);
    // 2026-12-04 minus 31 days = 2026-11-03; minus 62 = 2026-10-03
    assert.equal(getCwuMode({ ts: '2026-11-03 15:30', priority: 20 }).source, 'periodic');
    assert.equal(getCwuMode({ ts: '2026-10-03 14:30', priority: 20 }).source, 'periodic');
    assert.notEqual(getCwuMode({ ts: '2026-11-04 15:30', priority: 20 }).source, 'periodic');
});

test('periodic increase ends when charging ends, not after a fixed time', () => {
    setConfigHistory([{ ts: '2025-12-29 00:00', values: { ...baseline, '47046': 55, '47050': 1, '47051': 31, '49909': 16, '50249': '2026-12-04' } }]);
    const run = {};
    const at = (ts, priority, cwu_load) => getCwuMode({ ts, priority, cwu_load, hot_water_demand: 1 }, run).source;
    assert.notEqual(at('2026-11-03 14:30', 30, 30), 'periodic');
    assert.equal(at('2026-11-03 15:05', 20, 40), 'periodic');
    assert.equal(at('2026-11-03 18:00', 20, 54), 'periodic');
    assert.equal(at('2026-11-03 18:30', 20, 55), 'periodic');
    assert.notEqual(at('2026-11-03 18:35', 20, 46), 'periodic');
    assert.notEqual(at('2026-11-03 19:00', 20, 46), 'periodic');
});

test('start temp follows mode', () => {
    setConfigHistory([{ ts: '2026-11-01 00:00', values: { ...baseline, '47043': 42, '47044': 40, '47045': 15, '47046': 55 } }]);
    assert.equal(getCwuStartTemp({ ts: '2026-11-04 05:30', hot_water_demand: 1 }), 40);
    assert.equal(getCwuStartTemp({ ts: '2026-11-04 09:00', hot_water_demand: 1 }), 15);
    assert.equal(getCwuStartTemp({ ts: '2026-11-04 05:30', hot_water_demand: 2 }), 42);
});

test('next periodic increase from config', () => {
    setConfigHistory([{ ts: '2025-12-29 00:00', values: { ...baseline, '47050': 1, '49909': 16, '50249': '2026-12-04' } }]);
    assert.deepEqual(getNextPeriodicIncrease(Date.UTC(2026, 10, 4)), { date: '2026-12-04', hour: 16 });
    assert.equal(getNextPeriodicIncrease(Date.UTC(2020, 0, 1)), null);
    assert.equal(getDaysToPeriodicIncrease(Date.UTC(2026, 10, 4, 12)), 30);
    assert.equal(getDaysToPeriodicIncrease(Date.UTC(2026, 11, 4, 12)), 0);
    assert.equal(getDaysToPeriodicIncrease(Date.UTC(2026, 11, 5, 12)), null);
});

test('applyConfigToSamples adds additional heat start level', () => {
    setConfigHistory([{ ts: '2025-12-29 00:00', values: { ...baseline, '47206': -180, '48072': 700 } }]);
    const [s] = applyConfigToSamples([{ ts: '2026-11-04 10:00' }]);
    assert.equal(s.start_gm_level, -180);
    assert.equal(s.start_add_heat_level, -700);
});
