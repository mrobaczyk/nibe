import test from 'node:test';
import assert from 'node:assert/strict';
import { setConfigHistory, getCwuMode, getWarsawClock } from '../../web/cwuMode.js';

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
    assert.deepEqual(getWarsawClock(Date.UTC(2026, 6, 1, 10, 0)), { day: 3, seconds: 12 * 3600 });
    // 2026-01-07 10:00 UTC = 11:00 CET (Wednesday)
    assert.deepEqual(getWarsawClock(Date.UTC(2026, 0, 7, 10, 0)), { day: 3, seconds: 11 * 3600 });
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
