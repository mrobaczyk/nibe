import test from 'node:test';
import assert from 'node:assert/strict';

import { buildKpis, buildKpiChartIndex } from '../../web/kpiModel.js';
import { CONFIG } from '../../web/config.js';

// Atrapa kontrolera: dostępność wykresów sterowana per id, preferencje domyślnie włączone.
function makeChartCtrl(availableIds = null, preferences = {}) {
    return {
        isChartAvailable: (chartId) => (availableIds ? availableIds.has(chartId) : true),
        chartPreferences: preferences
    };
}

function makeStats() {
    const dRange = [
        { ts: '2026-04-01 12:00', outdoor: 10, dm: -80, compressor_hz: 30, cwu_load: 38 },
        { ts: '2026-04-01 12:05', outdoor: 10.3, dm: -85, compressor_hz: 33, cwu_load: 38.2 },
        { ts: '2026-04-01 12:10', outdoor: 10.6, dm: -90, compressor_hz: 36, cwu_load: 38.4 },
        { ts: '2026-04-01 12:15', outdoor: 10.9, dm: -95, compressor_hz: 39, cwu_load: 38.6 },
        { ts: '2026-04-01 12:20', outdoor: 11.2, dm: -100, compressor_hz: 42, cwu_load: 38.8 }
    ];
    return { last: dRange.at(-1), dRange, absoluteLast: dRange.at(-1) };
}

test('buildKpiChartIndex grupuje wykresy po kpiId w jednym przebiegu', () => {
    const index = buildKpiChartIndex(makeChartCtrl());

    const expected = {};
    for (const chart of CONFIG.CHART_CONFIG) {
        if (!chart.kpiId) continue;
        (expected[chart.kpiId] ??= []).push(chart.id);
    }

    for (const [kpiId, chartIds] of Object.entries(expected)) {
        assert.deepEqual(index.get(kpiId)?.chartIds, chartIds, `kpiId ${kpiId}`);
    }
});

test('buildKpiChartIndex oznacza dostępność, gdy którykolwiek wykres KPI jest dostępny', () => {
    // Atrapa: dostępne są tylko wykresy historyczne (c-daily-*).
    const available = new Set(CONFIG.CHART_CONFIG.filter(c => c.id.startsWith('c-daily-')).map(c => c.id));
    const index = buildKpiChartIndex(makeChartCtrl(available));

    for (const [kpiId, entry] of index) {
        const someAvailable = entry.chartIds.some(id => available.has(id));
        assert.equal(entry.chartAvailable, someAvailable, `kpiId ${kpiId}`);
    }
});

test('buildKpis zwraca metadane zgodne z indeksem wykresów', () => {
    const ctrl = makeChartCtrl(null, { temp_outdoor: false });
    const stats = makeStats();

    const kpis = buildKpis(stats, ctrl);

    assert.equal(kpis.length, CONFIG.KPIS.length);
    const index = buildKpiChartIndex(ctrl);
    for (const kpi of kpis) {
        const entry = index.get(kpi.id);
        if (entry) {
            assert.deepEqual(kpi.chartIds, entry.chartIds, `kpi ${kpi.id}: chartIds`);
            assert.equal(kpi.chartAvailable, entry.chartAvailable, `kpi ${kpi.id}: chartAvailable`);
        } else {
            assert.deepEqual(kpi.chartIds, [], `kpi ${kpi.id} bez wykresów`);
            assert.equal(kpi.chartAvailable, false);
        }
    }

    const outdoor = kpis.find(k => k.id === 'temp_outdoor');
    assert.equal(outdoor.chartEnabled, false, 'wyłączona preferencja wyłącza wykres');
    assert.match(outdoor.trend, /▲/, 'rosnący trend outdoor pokazuje strzałkę w górę');
});

test('buildKpis pomija trend, gdy dane trendu nie wystarczają', () => {
    // 3 próbki -> za mało dla okna 20 min (wymagane >= 4 punkty).
    const stats = {
        last: { ts: '2026-04-01 12:10', outdoor: 10.6, dm: -90 },
        dRange: [
            { ts: '2026-04-01 12:00', outdoor: 10, dm: -80 },
            { ts: '2026-04-01 12:05', outdoor: 10.3, dm: -85 },
            { ts: '2026-04-01 12:10', outdoor: 10.6, dm: -90 }
        ],
        absoluteLast: { ts: '2026-04-01 12:10' }
    };

    const kpis = buildKpis(stats, makeChartCtrl());
    const outdoor = kpis.find(k => k.id === 'temp_outdoor');
    assert.equal(outdoor.trend, '', 'brak strzałki trendu przy za mało punktach');
});
