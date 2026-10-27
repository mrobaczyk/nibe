import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../../web/config.js';
import { KpiComponent } from '../../web/components/KpiComponent.js';

// --- #21: dane z API nie mogą przechodzić do innerHTML bez escapowania ---

const PAYLOAD = '<img src=x onerror=alert(1)>';

function statsWithLast(last) {
    return {
        last,
        absoluteLast: last,
        dRange: [],
        calculated: { rangeLabel: '24h' }
    };
}

test('wartość tekstowa z API jest escapowana w KPI (punkt wejścia f())', () => {
    const stats = statsWithLast({ outdoor: PAYLOAD });
    const kpi = CONFIG.KPIS.find(k => k.id === 'temp_outdoor');

    const html = kpi.v(stats);

    assert.ok(!html.includes('<img'), 'surowy HTML z API nie może przejść do KPI');
    assert.ok(html.includes('&lt;img'), 'wartość jest escapowana');
});

test('wartość parametru edytowalnego (curve) jako tekst też jest escapowana', () => {
    const stats = statsWithLast({ heat_curve: PAYLOAD, heat_offset: 2 });
    const kpi = CONFIG.KPIS.find(k => k.id === 'curve');

    const html = kpi.v(stats);

    assert.ok(!html.includes('<img'), 'surowy HTML nie przechodzi');
    assert.ok(html.includes('&lt;img'), 'wartość escapowana');
});

test('KpiComponent.render (sink innerHTML) renderuje escapowaną wartość', () => {
    const stats = statsWithLast({ outdoor: PAYLOAD });
    const kpi = CONFIG.KPIS.find(k => k.id === 'temp_outdoor');
    // Tak jak buildKpis: funkcje v/u zastępowane są wyliczonymi HTML-ami.
    const built = { ...kpi, v: kpi.v(stats), u: kpi.u(stats) };

    const html = KpiComponent.render(built);

    assert.ok(!html.includes('<img src=x'), 'sink nie renderuje surowego payloadu');
});

test('escapowanie nie zmienia formatowania liczb i tekstowych liczb', () => {
    const stats = statsWithLast({ outdoor: '12.5', dm: -120 });

    const outdoor = CONFIG.KPIS.find(k => k.id === 'temp_outdoor');
    assert.equal(outdoor.v(stats), '12.5°C');

    const dm = CONFIG.KPIS.find(k => k.id === 'dm');
    assert.equal(dm.v(stats), '-120');
});

test('ampersand i cudzysłowy w wartościach tekstowych są escapowane', () => {
    const stats = statsWithLast({ outdoor: 'A&B"C\'D<E>' });

    const html = CONFIG.KPIS.find(k => k.id === 'temp_outdoor').v(stats);

    assert.ok(html.includes('A&amp;B&quot;C&#39;D&lt;E&gt;'), `otrzymano: ${html}`);
});
