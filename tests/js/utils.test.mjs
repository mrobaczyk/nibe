import test from 'node:test';
import assert from 'node:assert/strict';
import { Utils } from '../../web/utils.js';

test('formatDate returns placeholder for empty input', () => {
    assert.equal(Utils.formatDate(null), '--:--');
    assert.equal(Utils.formatDate(''), '--:--');
});

test('formatDate formats a Date instance in tech mode', () => {
    const d = new Date(2026, 3, 1, 9, 5);
    assert.equal(Utils.formatDate(d), '2026-04-01 09:05');
});

test('formatDate formats chart mode by unit', () => {
    const d = new Date(2026, 3, 1, 9, 5);
    assert.equal(Utils.formatDate(d, 'chart', 'month'), '2026-04');
    assert.equal(Utils.formatDate(d, 'chart', 'day'), '2026-04-01');
});

test('formatTime renders minutes-only durations under an hour', () => {
    assert.equal(Utils.formatTime(45), '45 min');
});

test('formatTime renders hour:minute durations over an hour', () => {
    assert.equal(Utils.formatTime(125), '2:05h');
});

test('getTrendIcon returns empty string when either value is missing', () => {
    assert.equal(Utils.getTrendIcon(undefined, 1), '');
    assert.equal(Utils.getTrendIcon(1, null), '');
});

test('getTrendIcon renders an equals icon within the threshold', () => {
    assert.match(Utils.getTrendIcon(1.001, 1), /＝/);
});

test('getTrendIcon renders an up arrow when value increases', () => {
    assert.match(Utils.getTrendIcon(2, 1), /▲/);
});

test('getTrendIcon renders a down arrow when value decreases', () => {
    assert.match(Utils.getTrendIcon(1, 2), /▼/);
});

test('getTrendDelta analyzes all points and smooths short-term temperature fluctuations', () => {
    const data = [
        { ts: '2026-04-01 12:00', outdoor: 10 },
        { ts: '2026-04-01 12:05', outdoor: 10.3 },
        { ts: '2026-04-01 12:10', outdoor: 10.2 },
        { ts: '2026-04-01 12:15', outdoor: 10.6 },
        { ts: '2026-04-01 12:20', outdoor: 10.5 },
        { ts: '2026-04-01 12:25', outdoor: 10.9 },
        { ts: '2026-04-01 12:30', outdoor: 10.8 }
    ];

    const delta = Utils.getTrendDelta(data, data.at(-1), 'outdoor', 30 * 60_000, 10 * 60_000);
    assert.ok(delta > 0.1);
    assert.match(Utils.getTrendIcon(data.at(-1).outdoor, data.at(-1).outdoor - delta, 0.1), /▲/);
});

test('getTrendDelta returns undefined when there are too few points or a large gap', () => {
    const data = [
        { ts: '2026-04-01 12:00', outdoor: 10 },
        { ts: '2026-04-01 12:05', outdoor: 11 },
        { ts: '2026-04-01 12:10', outdoor: 12 },
        { ts: '2026-04-01 12:30', outdoor: 16 }
    ];

    assert.equal(
        Utils.getTrendDelta(data, data.at(-1), 'outdoor', 30 * 60_000, 10 * 60_000),
        undefined
    );
});

test('aggregateHourlyToDaily sums same-day records and computes COP', () => {
    const hourly = [
        { ts: '2026-04-01T12:00:00Z', starts: 1, kwh_p_heat: 2, kwh_c_heat: 1, kwh_p_cwu: 0, kwh_c_cwu: 0, out_avg: 4 },
        { ts: '2026-04-01T13:00:00Z', starts: 1, kwh_p_heat: 2, kwh_c_heat: 1, kwh_p_cwu: 0, kwh_c_cwu: 0, out_avg: 6 }
    ];
    const daily = Utils.aggregateHourlyToDaily(hourly);
    assert.equal(daily.length, 1);
    assert.equal(daily[0].starts, 2);
    assert.equal(daily[0].kwh_p_heat, 4);
    assert.equal(daily[0].cop_heat, 2);
});
