import test from 'node:test';
import assert from 'node:assert/strict';

// ChartManager dotyka globali przeglądarki (Chart, document) w konstruktorze
// i w draw(), więc podstawiamy minimalne atrapy przed importem modułu.
class FakeChart {
    constructor(canvas, config) {
        FakeChart.instances.push(this);
        this.canvas = canvas;
        this.type = config.type;
        this.config = config;
        this.data = config.data;
        this.options = config.options;
        this.updateModes = [];
        this.destroyed = false;
    }
    update(mode) { this.updateModes.push(mode ?? 'default'); }
    destroy() { this.destroyed = true; }
    resize() { }
}

FakeChart.instances = [];

globalThis.Chart = Object.assign(FakeChart, {
    registry: { plugins: { get: () => ({ id: 'verticalLine' }) } }
});
globalThis.document = { getElementById: (id) => ({ id }) };

const { ChartManager } = await import('../../web/charts.js');

function drawArgs(overrides = {}) {
    return {
        datasets: [{ l: 'A', k: 'v', c: '#111111' }],
        rawData: [{ ts: '2026-01-01 00:00', tsMs: Date.UTC(2026, 0, 1), v: 1 }],
        ...overrides
    };
}

test('draw tworzy wykres przy pierwszym wywołaniu', () => {
    FakeChart.instances.length = 0;
    const mgr = new ChartManager();
    const { datasets, rawData } = drawArgs();

    mgr.draw('c-x', 'Tytuł', datasets, { rawData });

    assert.equal(FakeChart.instances.length, 1);
    assert.equal(mgr.charts['c-x'].destroyed, false);
});

test('draw aktualizuje istniejący wykres zamiast niszczyć i tworzyć od nowa', () => {
    FakeChart.instances.length = 0;
    const mgr = new ChartManager();
    const { datasets, rawData } = drawArgs();

    mgr.draw('c-x', 'Pierwszy', datasets, { rawData });
    const first = mgr.charts['c-x'];

    mgr.draw('c-x', 'Drugi', datasets, { rawData, min: 123, max: 456 });

    assert.equal(FakeChart.instances.length, 1, 'instancja wykresu nie jest odtwarzana');
    assert.equal(first.destroyed, false, 'stary wykres nie jest niszczony');
    assert.equal(mgr.charts['c-x'], first, 'to nadal ta sama instancja');
    assert.deepEqual(first.updateModes, ['none'], 'aktualizacja bez animacji');
    assert.equal(first.data.datasets[0].label, 'A', 'nowe datasety podmienione');
    assert.equal(first.options.plugins.title.text, 'DRUGI', 'opcje (np. tytuł) podmieniane');
    assert.equal(first.options.scales.x.min, 123, 'zakres osi podmieniany');
});

test('draw niszczy i odtwarza wykres przy zmianie typu', () => {
    FakeChart.instances.length = 0;
    const mgr = new ChartManager();
    const { datasets, rawData } = drawArgs();

    mgr.draw('c-x', 'Linia', datasets, { rawData });
    const first = mgr.charts['c-x'];

    mgr.draw('c-x', 'Słupek', datasets, { rawData, type: 'bar' });

    assert.equal(first.destroyed, true, 'stara instancja zniszczona przy zmianie typu');
    assert.equal(FakeChart.instances.length, 2);
    assert.notEqual(mgr.charts['c-x'], first);
    assert.equal(mgr.charts['c-x'].type, 'bar');
});
