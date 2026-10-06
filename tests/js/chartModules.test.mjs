import test from 'node:test';
import assert from 'node:assert/strict';

import { getLocalTimestamp, mapDatasetData, resolveBgColor, prepareDatasets } from '../../web/chartData.js';
import { getTimeConfig, getXScale, getYScale, getYTempScale } from '../../web/chartScales.js';
import { getPluginsConfig, getDatalabelsConfig, getTooltipConfig, verticalLinePlugin } from '../../web/chartPlugins.js';
import { CONFIG } from '../../web/config.js';

test('getLocalTimestamp: Date, pusty, UTC string, sama data i nieprawidłowy tekst', () => {
    const d = new Date(Date.UTC(2026, 0, 1, 10));
    assert.equal(getLocalTimestamp(d), d.getTime());
    assert.equal(getLocalTimestamp(null), null);
    assert.equal(getLocalTimestamp('2026-01-01 10:00'), Date.UTC(2026, 0, 1, 10));
    assert.equal(getLocalTimestamp('2026-01-01T10:00:00Z'), Date.UTC(2026, 0, 1, 10));
    assert.equal(getLocalTimestamp('2026-04-01'), new Date(2026, 3, 1).getTime());
    assert.equal(getLocalTimestamp('nonsense 99:99'), null);
});

test('mapDatasetData: klucz tekstowy, brak wartości i pomijanie rekordów bez ts', () => {
    const raw = [
        { ts: 'a', tsMs: 1000, v: 5 },
        { ts: 'b', tsMs: 2000 },
        { tsMs: 3000, v: 9 },
        { ts: 'd', tsMs: 4000, v: '7' }
    ];
    assert.deepEqual(mapDatasetData({ k: 'v' }, raw), [{ x: 1000, y: 5 }, { x: 4000, y: 7 }]);
});

test('mapDatasetData: funkcja k i funkcja d (0 oraz brak pola dają null)', () => {
    const raw = [{ ts: 'a', tsMs: 1000, a: 2, b: 3 }, { ts: 'b', tsMs: 2000, a: 2 }, { ts: 'c', tsMs: 3000, a: 0, b: 0 }];
    assert.deepEqual(mapDatasetData({ k: r => r.a * 10 }, raw).map(p => p.y), [20, 20, 0]);
    assert.deepEqual(mapDatasetData({ d: get => get('a') + get('b') }, raw), [{ x: 1000, y: 5 }]);
});

test('mapDatasetData: przerwa większa niż 8 min wstawia punkt null (poza słupkami)', () => {
    const T = 1_000_000;
    const raw = [{ ts: 'a', tsMs: T, v: 1 }, { ts: 'b', tsMs: T + 9 * 60 * 1000, v: 2 }];
    const line = mapDatasetData({ k: 'v' }, raw);
    assert.equal(line.length, 3);
    assert.deepEqual(line[1], { x: T + 1, y: null });
    assert.equal(mapDatasetData({ k: 'v', t: 'bar' }, raw).length, 2);
    const near = [{ ts: 'a', tsMs: T, v: 1 }, { ts: 'b', tsMs: T + 5 * 60 * 1000, v: 2 }];
    assert.equal(mapDatasetData({ k: 'v' }, near).length, 2);
});

test('mapDatasetData: strefy i dane ręczne', () => {
    const zones = [{ x: 1, cwu: 1 }, { x: 2, cwu: 0 }];
    assert.deepEqual(mapDatasetData({ isZone: 'cwu' }, [], { zones }), [{ x: 1, y: 1 }, { x: 2, y: 0 }]);
    assert.deepEqual(mapDatasetData({ manualData: [{ x: 1, y: 2 }] }, []), [{ x: 1, y: 2 }]);
});

test('resolveBgColor dodaje przezroczystość tylko do kolorów hex', () => {
    assert.equal(resolveBgColor({ isZone: true, c: '#ff0000' }, false), '#ff0000' + CONFIG.UI.ALPHA_ZONE);
    assert.equal(resolveBgColor({ isZone: true, c: 'rgba(1,2,3,0.5)' }, false), 'rgba(1,2,3,0.5)');
    assert.equal(resolveBgColor({ c: '#00ff00', t: 'bar' }, false), '#00ff00' + CONFIG.UI.ALPHA_BAR);
    assert.equal(resolveBgColor({ c: '#00ff00' }, true), '#00ff00' + CONFIG.UI.ALPHA_BAR);
    assert.equal(resolveBgColor({ c: '#00ff00' }, false), 'transparent');
});

test('prepareDatasets: styl linii, stan ukrycia z chartStates i wirtualna legenda stref', () => {
    const raw = [{ ts: 'a', tsMs: 1000, v: 1 }];
    const datasets = [
        { l: 'Linia', k: 'v', c: '#111111', h: true },
        { l: 'Praca CO', isZone: 'heat', c: '#222222', yAxisID: 'y-work' }
    ];
    const out = prepareDatasets(datasets, raw, { zones: [{ x: 1, heat: 1 }] }, false, null, 'c-x');
    assert.equal(out.length, 3);
    assert.equal(out[0].hidden, true);
    assert.equal(out[0].borderWidth, CONFIG.UI.BORDER_WIDTH);
    assert.equal(out[1].borderWidth, 0);
    assert.equal(out[1].stepped, 'before');
    assert.equal(out[2].label, 'Praca CO (tło)');
    assert.deepEqual(out[2].data, []);

    const shown = prepareDatasets(datasets, raw, { zones: [] }, false, null, 'c-x', { 'c-x': { Linia: true } });
    assert.equal(shown[0].hidden, false);
});

test('prepareDatasets: dla jednostki czasu punkty są ukryte', () => {
    const out = prepareDatasets([{ l: 'A', k: 'v', c: '#111111' }], [], {}, false, 'hour', 'c-x');
    assert.equal(out[0].pointRadius, 0);
});

test('getTimeConfig mapuje jednostki na limity znaczników', () => {
    assert.deepEqual(getTimeConfig(false, 'month'), { timeUnit: 'month', tickLimitX: 12 });
    assert.deepEqual(getTimeConfig(false, 'day'), { timeUnit: 'day', tickLimitX: 7 });
    assert.deepEqual(getTimeConfig(false, 'hour'), { timeUnit: 'hour', tickLimitX: 8 });
    assert.deepEqual(getTimeConfig(false, undefined), { timeUnit: 'hour', tickLimitX: 8 });
});

test('getXScale: zakres, offset dla słupków i autoSkip wyłączony dla miesięcy', () => {
    const x = getXScale(true, 'month', 12, false, 10, 20);
    assert.equal(x.min, 10);
    assert.equal(x.max, 20);
    assert.equal(x.offset, true);
    assert.equal(x.ticks.autoSkip, false);
    assert.equal(getXScale(false, 'hour', 8, false, 1, 2).ticks.autoSkip, true);
});

test('getYScale: nazwy trybów CWU, formatowanie i podświetlenie zera w GM', () => {
    const cwu = getYScale('c-cwu-mode', false, null, null, false);
    assert.equal(cwu.ticks.callback(1), CONFIG.cwuNames[1]);
    assert.equal(cwu.ticks.callback(9), null);
    assert.equal(cwu.ticks.stepSize, 1);
    assert.equal(cwu.grace, '0%');

    const plain = getYScale('c-temp', false, 0, 50, false);
    assert.equal(plain.ticks.callback(3), 3);
    assert.equal(plain.ticks.callback(2.55), '2.5'.replace('2.5', (2.55).toFixed(1)));
    assert.equal(plain.min, 0);
    assert.equal(plain.max, 50);
    assert.equal(plain.grace, '5%');

    const gm = getYScale('c-gm', false, null, null, false);
    assert.match(gm.grid.color({ tick: { value: 0 } }), /248, 113, 113/);
    assert.equal(gm.ticks.color({ tick: { value: 0 } }), '#f87171');
});

test('getYScale: słupki zaczynają od zera', () => {
    assert.equal(getYScale('c-x', false, null, null, true).suggestedMin, 0);
    assert.equal(getYScale('c-x', false, null, null, false).suggestedMin, undefined);
});

test('getYTempScale pokazuje się tylko gdy któryś dataset używa y-temp', () => {
    assert.equal(getYTempScale([{ yAxisID: 'y' }]).display, false);
    assert.equal(getYTempScale([{ yAxisID: 'y' }, { yAxisID: 'y-temp' }]).display, true);
});

test('getDatalabelsConfig: etykiety tylko dla słupków i formatowanie liczb', () => {
    const cfg = getDatalabelsConfig(true);
    const barCtx = { dataset: { data: [{ y: 2 }] }, dataIndex: 0, chart: { config: { type: 'bar' } } };
    assert.equal(cfg.display(barCtx), true);
    assert.equal(cfg.display({ ...barCtx, dataset: { data: [{ y: 0 }] } }), false);
    assert.equal(cfg.display({ ...barCtx, dataset: { yAxisID: 'y-work', data: [{ y: 1 }] } }), false);
    assert.equal(cfg.display({ ...barCtx, chart: { config: { type: 'line' } } }), false);
    assert.equal(cfg.formatter({ y: 3 }), 3);
    assert.equal(cfg.formatter(2.55), (2.55).toFixed(1));
    assert.equal(cfg.formatter(0), '');
    assert.equal(cfg.formatter(null), '');
    assert.equal(cfg.formatter('abc'), '');
});

test('getTooltipConfig: filtr null, tytuły wg typu i precyzja etykiet', () => {
    const cfg = getTooltipConfig('day', 'bar');
    assert.equal(cfg.filter({ raw: { y: null } }), false);
    assert.equal(cfg.filter({ raw: { y: 1 } }), true);

    const ts = Date.UTC(2026, 0, 1, 10);
    const lineTitle = getTooltipConfig('hour', 'line').callbacks.title([{ parsed: { x: ts } }]);
    assert.notEqual(lineTitle, '--:--');

    const label = cfg.callbacks.label;
    assert.equal(label({ dataset: { yAxisID: 'y-work' }, parsed: { y: 1 } }), null);
    assert.equal(label({ dataset: { label: 'A' }, parsed: { y: 1.234 } }), 'A: 1.2');
    assert.equal(label({ dataset: { label: 'A', precision: 0 }, parsed: { y: 12.6 } }), 'A: 13');
    assert.equal(label({ dataset: { label: 'A' }, parsed: { y: 0.05 } }), 'A: 0.05');
    assert.equal(label({ dataset: { label: 'A' }, parsed: { y: null } }), 'A: 0');
});

test('getPluginsConfig: legenda ukrywa nazwy techniczne i zapisuje stan przełączenia', () => {
    const toggles = [];
    const cfg = getPluginsConfig('Tytuł', false, 'hour', 'line', (...args) => toggles.push(args));
    assert.equal(cfg.title.text, 'TYTUŁ');
    const filter = cfg.legend.labels.filter;
    assert.equal(filter({ text: 'Praca CO' }), false);
    assert.equal(filter({ text: '' }), false);
    assert.equal(filter({ text: 'Temp. zewn.' }), true);
    const zoneItem = { text: 'Praca CO (tło)' };
    assert.equal(filter(zoneItem), true);
    assert.equal(zoneItem.pointStyle, 'rect');
    assert.equal(filter({ text: 'Starty' }), true);

    globalThis.Chart = { defaults: { plugins: { legend: { onClick() { } } } } };
    const legend = { chart: { canvas: { id: 'c-1' }, isDatasetVisible: () => false } };
    cfg.legend.onClick({}, { text: 'Starty', datasetIndex: 0 }, legend);
    cfg.legend.onClick({}, { text: 'X (tło)', datasetIndex: 1 }, legend);
    delete globalThis.Chart;
    assert.deepEqual(toggles, [['c-1', 'Starty', false]]);
});

test('verticalLinePlugin rysuje linię tylko przy aktywnym znaczniku czasu', () => {
    const calls = [];
    const ctx = new Proxy({}, { get: (_, name) => (...args) => calls.push(name) });
    const chart = { ctx, scales: { x: { getPixelForValue: () => 42 }, y: { top: 0, bottom: 10 } } };
    verticalLinePlugin.afterDraw({ ...chart, activeTimestamp: null });
    assert.equal(calls.length, 0);
    verticalLinePlugin.afterDraw({ ...chart, activeTimestamp: 123 });
    assert.ok(calls.includes('stroke'));
});
