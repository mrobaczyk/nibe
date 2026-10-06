import test from 'node:test';
import assert from 'node:assert/strict';

import { Utils } from '../../web/utils.js';
import { CONFIG } from '../../web/config.js';
import { computeNextOffset } from '../../web/rangeNavigation.js';
import { prepareHistoryData } from '../../web/historyData.js';
import { parseFlexibleJSON } from '../../web/dataLoader.js';

test('parseTs traktuje surowe znaczniki jako UTC i przepuszcza Date, liczby i ISO', () => {
    const expected = Date.UTC(2026, 0, 1, 10, 30);
    assert.equal(Utils.parseTs('2026-01-01 10:30'), expected);
    assert.equal(Utils.parseTs('2026-01-01T10:30:00Z'), expected);
    assert.equal(Utils.parseTs('2026-01-01T11:30:00+01:00'), expected);
    assert.equal(Utils.parseTs(new Date(expected)), expected);
    assert.equal(Utils.parseTs(expected), expected);
    assert.ok(Number.isNaN(Utils.parseTs('garbage')));
});

test('recordTime preferuje tsMs, a bez niego parsuje ts', () => {
    assert.equal(Utils.recordTime({ ts: '2026-01-01 10:00', tsMs: 5 }), 5);
    assert.equal(Utils.recordTime({ ts: '2026-01-01 10:00' }), Date.UTC(2026, 0, 1, 10));
});

test('aggregateHourlyToMonthly sumuje miesiąc, liczy COP i średnią temperaturę', () => {
    const hourly = [
        { ts: '2026-01-10 12:00', kwh_p_heat: 6, kwh_c_heat: 2, kwh_p_cwu: 3, kwh_c_cwu: 1, starts: 1, work_h_heat: 1, work_h_cwu: 0.5, out_avg: 0 },
        { ts: '2026-01-20 12:00', kwh_p_heat: 4, kwh_c_heat: 2, kwh_p_cwu: 0, kwh_c_cwu: 0, starts: 2, work_h_heat: 1, work_h_cwu: 0, out_avg: 4 },
        { ts: '2026-02-10 12:00', kwh_p_heat: 1, kwh_c_heat: 1, out_avg: -2 }
    ];
    const [jan, feb] = Utils.aggregateHourlyToMonthly(hourly);
    assert.equal(jan.ts, '2026-01-01');
    assert.equal(jan.kwh_p_heat, 10);
    assert.equal(jan.kwh_c_heat, 4);
    assert.equal(jan.cop_heat, 2.5);
    assert.equal(jan.cop_cwu, 3);
    assert.equal(jan.starts, 3);
    assert.equal(jan.out_avg, 2);
    assert.equal(feb.ts, '2026-02-01');
    assert.equal(feb.out_avg, -2);
});

test('aggregateHourlyToMonthly pomija ujemne zużycie i rekordy bez ts', () => {
    const [m] = Utils.aggregateHourlyToMonthly([
        { kwh_p_heat: 100, kwh_c_heat: 1 },
        { ts: '2026-03-10 12:00', kwh_p_heat: 50, kwh_c_heat: -1, out_avg: 1 }
    ]);
    assert.equal(m.kwh_p_heat, 0);
    assert.equal(m.cop_heat, 0);
});

test('aggregateHourlyToDaily zwraca [] dla nieprawidłowego wejścia i zero COP bez zużycia', () => {
    assert.deepEqual(Utils.aggregateHourlyToDaily(null), []);
    assert.deepEqual(Utils.aggregateHourlyToDaily(undefined), []);
    const [d] = Utils.aggregateHourlyToDaily([{ ts: '2026-01-10 12:00', kwh_p_heat: 3, kwh_c_heat: 0, out_avg: 5 }]);
    assert.equal(d.cop_heat, 0);
    assert.equal(d.out_avg, 5);
    assert.ok(d.date instanceof Date);
});

test('computeNextOffset: krótkie zakresy krokują godzinami/dobami, długie dobami/tygodniami', () => {
    const now = new Date('2026-01-10T12:00:00').getTime();
    const hours = off => Math.round((now + off - now) / 3600000);
    assert.equal(hours(computeNextOffset('24h', 0, 'small', -1, now)), -1);
    assert.equal(hours(computeNextOffset('24h', 0, 'large', -1, now)), -24);
    assert.equal(hours(computeNextOffset('7d', 0, 'small', -1, now)), -24);
    assert.equal(hours(computeNextOffset('7d', 0, 'large', -1, now)), -168);
});

test('computeNextOffset: wracając do przyszłości nie przekracza "teraz"', () => {
    const now = new Date('2026-01-10T12:00:00').getTime();
    const back = computeNextOffset('24h', 0, 'large', -1, now);
    assert.equal(computeNextOffset('24h', back, 'large', 1, now), 0);
    assert.equal(computeNextOffset('24h', back, 'large', 1, now) <= 0, true);
});

test('prepareHistoryData agreguje wg ramki czasowej i sortuje', () => {
    const hourly = [
        { ts: '2026-01-02 12:00', kwh_p_heat: 2, kwh_c_heat: 1, out_avg: 1 },
        { ts: '2026-01-01 12:00', kwh_p_heat: 3, kwh_c_heat: 1, out_avg: 1 },
        { ts: '2026-01-01 14:00', kwh_p_heat: 3, kwh_c_heat: 1, out_avg: 1 }
    ];
    const from = new Date('2025-12-31T00:00:00Z');
    const to = new Date('2026-01-05T00:00:00Z');
    const daily = prepareHistoryData(hourly, '7d', from, to);
    assert.equal(daily.length, 2);
    assert.ok(daily[0].ts <= daily[1].ts);
    assert.equal(daily[0].kwh_p_heat, 6);
    const monthly = prepareHistoryData(hourly, '3m', from, to);
    assert.equal(monthly.length, 1);
    assert.equal(monthly[0].kwh_p_heat, 8);
    const hourlyRes = prepareHistoryData(hourly, '24h', from, to);
    assert.equal(hourlyRes.length, 3);
    assert.ok(hourlyRes[0].ts instanceof Date);
});

test('parseFlexibleJSON pomija uszkodzone linie i zwraca [] dla złej tablicy', () => {
    const warn = console.warn;
    const error = console.error;
    console.warn = () => { };
    console.error = () => { };
    try {
        assert.deepEqual(parseFlexibleJSON('{"a":1}\nnot json\n{"a":2}'), [{ a: 1 }, { a: 2 }]);
        assert.deepEqual(parseFlexibleJSON('[{"a":1},'), []);
    } finally {
        console.warn = warn;
        console.error = error;
    }
});

test('CONFIG: spójność wykresów, KPI i ramek czasowych', () => {
    const kpiIds = new Set(CONFIG.KPIS.map(k => k.id));
    assert.equal(kpiIds.size, CONFIG.KPIS.length, 'id KPI są unikalne');
    const chartIds = CONFIG.CHART_CONFIG.map(c => c.id);
    assert.equal(new Set(chartIds).size, chartIds.length, 'id wykresów są unikalne');
    for (const chart of CONFIG.CHART_CONFIG) {
        assert.ok(kpiIds.has(chart.kpiId), `wykres ${chart.id} wskazuje istniejące KPI`);
        assert.ok(Array.isArray(chart.datasets) && chart.datasets.length > 0);
    }
    assert.ok(CONFIG.TIME_FRAMES[CONFIG.DEFAULTS.ACTIVE_FRAME]);
    for (const [key, frame] of Object.entries(CONFIG.TIME_FRAMES)) {
        assert.ok(['hour', 'day', 'month'].includes(frame.unit), `ramka ${key} ma jednostkę`);
        assert.ok(['hourly', 'daily', 'monthly'].includes(frame.agg), `ramka ${key} ma agregację`);
    }
});

test('fetchDashboardData zgłasza błąd przy odpowiedzi HTTP innej niż 2xx', async () => {
    const { fetchDashboardData } = await import('../../web/dataLoader.js');
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => ({ ok: !String(url).includes('hourly'), status: 404, url, text: async () => '[]', json: async () => ({}) });
    try {
        await assert.rejects(fetchDashboardData(), /HTTP 404/);
    } finally {
        globalThis.fetch = realFetch;
    }
});
