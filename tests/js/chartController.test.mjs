import test from 'node:test';
import assert from 'node:assert/strict';

// ChartController touches browser globals (localStorage/document/window) only
// when its methods run, so we stub the minimum needed before importing it.
class MemoryStorage {
    constructor() { this.store = new Map(); }
    getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
    setItem(key, value) { this.store.set(key, String(value)); }
    removeItem(key) { this.store.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.document = { getElementById: () => null };
globalThis.window = {};

const { ChartController } = await import('../../web/chartController.js');
const { CONFIG } = await import('../../web/config.js');

function makeController(overrides = {}) {
    globalThis.localStorage = new MemoryStorage();
    return new ChartController({ charts: {}, draw: () => { } }, overrides);
}

test('loadChartPreferences defaults every charted KPI to enabled', () => {
    const ctrl = makeController();
    const chartedKpiIds = [...new Set(CONFIG.CHART_CONFIG.map(c => c.kpiId).filter(Boolean))];
    for (const kpiId of chartedKpiIds) {
        assert.equal(ctrl.chartPreferences[kpiId], true);
    }
});

test('isChartAvailable hides non-historical charts beyond a 1-month range', () => {
    const ctrl = makeController({ getActiveFrame: () => '3m' });
    assert.equal(ctrl.isChartAvailable('c-stats'), false);
    assert.equal(ctrl.isChartAvailable('c-daily-something'), true);
});

test('isChartAvailable keeps charts available for short ranges', () => {
    const ctrl = makeController({ getActiveFrame: () => '24h' });
    assert.equal(ctrl.isChartAvailable('c-stats'), true);
});

test('toggleKpiCharts flips and persists the preference for a KPI', () => {
    const ctrl = makeController();
    const kpiId = CONFIG.CHART_CONFIG[0].kpiId;
    const before = ctrl.chartPreferences[kpiId];

    ctrl.toggleKpiCharts(kpiId);

    assert.equal(ctrl.chartPreferences[kpiId], !before);
    const saved = JSON.parse(globalThis.localStorage.getItem('nibe-chart-kpi-preferences'));
    assert.equal(saved[kpiId], !before);
});

test('toggleKpiCharts calls the onPreferenceChange callback', () => {
    let called = 0;
    const ctrl = makeController({ onPreferenceChange: () => { called++; } });
    ctrl.toggleKpiCharts(CONFIG.CHART_CONFIG[0].kpiId);
    assert.equal(called, 1);
});

test('toggleKpiCharts ignores unknown KPI ids', () => {
    const ctrl = makeController();
    const snapshot = { ...ctrl.chartPreferences };
    ctrl.toggleKpiCharts('does-not-exist');
    assert.deepEqual(ctrl.chartPreferences, snapshot);
});

test('isChartEnabled reflects both preference and availability', () => {
    const ctrl = makeController({ getActiveFrame: () => '24h' });
    const chart = CONFIG.CHART_CONFIG[0];
    assert.equal(ctrl.isChartEnabled(chart.id), true);
    ctrl.toggleKpiCharts(chart.kpiId);
    assert.equal(ctrl.isChartEnabled(chart.id), false);
});
