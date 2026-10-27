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

test('resizeCharts recalculates dimensions of rendered charts', () => {
    let resizeCalls = 0;
    const ctrl = new ChartController({
        charts: {
            first: { resize: () => { resizeCalls++; } },
            second: { resize: () => { resizeCalls++; } }
        },
        draw: () => { }
    });

    ctrl.resizeCharts();

    assert.equal(resizeCalls, 2);
});

// --- Zamykanie pełnego ekranu klawiszem Escape ---

// Stub DOM dla toggleFullscreen: canvas -> card z classList, body, listenery keydown.
function makeFullscreenDom({ activeElement = null, containsActive = true } = {}) {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;

    const keydownListeners = new Set();
    const cardClasses = new Set();
    const makeClassList = (set) => ({
        toggle: (name, force) => {
            const next = force === undefined ? !set.has(name) : force;
            if (next) set.add(name); else set.delete(name);
            return next;
        }
    });
    const card = {
        classList: makeClassList(cardClasses),
        contains: (el) => containsActive && el === activeElement
    };

    globalThis.document = {
        getElementById: (id) => (id === 'c-test' ? { closest: () => card } : null),
        addEventListener: (type, handler) => { if (type === 'keydown') keydownListeners.add(handler); },
        removeEventListener: (type, handler) => { if (type === 'keydown') keydownListeners.delete(handler); },
        body: { classList: makeClassList(new Set()) },
        activeElement
    };
    globalThis.window = { scrollTo: () => { } };

    const restore = () => {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    };
    return { keydownListeners, cardClasses, restore };
}

test('toggleFullscreen rejestruje handler Escape, który zamyka pełny ekran', () => {
    const dom = makeFullscreenDom();
    try {
        let resizeCalls = 0;
        const ctrl = new ChartController({
            charts: { 'c-test': { resize: () => { resizeCalls++; }, update: () => { } } },
            draw: () => { }
        });

        ctrl.toggleFullscreen('c-test');

        assert.equal(dom.cardClasses.has('is-fullscreen'), true, 'wejście w pełny ekran');
        assert.equal(dom.keydownListeners.size, 1, 'handler Escape zarejestrowany');

        [...dom.keydownListeners][0]({ key: 'Escape' });

        assert.equal(dom.cardClasses.has('is-fullscreen'), false, 'Escape zamyka pełny ekran');
        assert.equal(dom.keydownListeners.size, 0, 'handler usunięty po wyjściu');
        assert.equal(resizeCalls, 2, 'wykres przerysowany przy wejściu i wyjściu');
    } finally {
        dom.restore();
    }
});

test('handler Escape ignoruje klawisze inne niż Escape', () => {
    const dom = makeFullscreenDom();
    try {
        const ctrl = new ChartController({
            charts: { 'c-test': { resize: () => { }, update: () => { } } },
            draw: () => { }
        });

        ctrl.toggleFullscreen('c-test');
        [...dom.keydownListeners][0]({ key: 'a' });

        assert.equal(dom.cardClasses.has('is-fullscreen'), true, 'inny klawisz nie zamyka pełnego ekranu');
    } finally {
        dom.restore();
    }
});

test('Escape zdejmuje fokus z przycisku w karcie (zapobiega outline z przeglądarki)', () => {
    const button = { blurCalls: 0, blur() { this.blurCalls++; } };
    const dom = makeFullscreenDom({ activeElement: button });
    try {
        const ctrl = new ChartController({
            charts: { 'c-test': { resize: () => { }, update: () => { } } },
            draw: () => { }
        });

        ctrl.toggleFullscreen('c-test');
        [...dom.keydownListeners][0]({ key: 'Escape' });

        assert.equal(button.blurCalls, 1, 'fokus zdjęty z przycisku w karcie');
    } finally {
        dom.restore();
    }
});

test('fokus poza zamykaną kartą pozostaje nietkany', () => {
    const outsideButton = { blurCalls: 0, blur() { this.blurCalls++; } };
    const dom = makeFullscreenDom({ activeElement: outsideButton, containsActive: false });
    try {
        const ctrl = new ChartController({
            charts: { 'c-test': { resize: () => { }, update: () => { } } },
            draw: () => { }
        });

        ctrl.toggleFullscreen('c-test'); // wejście
        ctrl.toggleFullscreen('c-test'); // wyjście (np. ponowne kliknięcie)

        assert.equal(outsideButton.blurCalls, 0, 'fokus poza kartą nietkany');
    } finally {
        dom.restore();
    }
});

// --- Debouncowany resize (#7) ---

test('setupResizeListener podpina debouncowany window.resize wywołujący resizeCharts', async () => {
    const originalWindow = globalThis.window;
    const resizeListeners = new Set();
    globalThis.window = {
        ...originalWindow,
        addEventListener: (type, handler) => { if (type === 'resize') resizeListeners.add(handler); },
        removeEventListener: (type, handler) => { if (type === 'resize') resizeListeners.delete(handler); }
    };
    let resizeCalls = 0;
    const ctrl = new ChartController({
        charts: { only: { resize: () => { resizeCalls++; } } },
        draw: () => { }
    });
    try {
        ctrl.setupResizeListener();

        assert.equal(resizeListeners.size, 1, 'handler resize podpięty');

        // Szybka seria zdarzeń resize -> debounce powinien wywołać resizeCharts raz.
        const handler = [...resizeListeners][0];
        handler();
        handler();
        handler();
        await new Promise(resolve => setTimeout(resolve, CONFIG.NAVIGATION.RESIZE_DEBOUNCE_MS + 100));
        assert.equal(resizeCalls, 1, 'debounce: seria zdarzeń = jedno przerysowanie');

        // Kolejne zdarzenie po oknie debouncu -> kolejne przerysowanie.
        handler();
        await new Promise(resolve => setTimeout(resolve, CONFIG.NAVIGATION.RESIZE_DEBOUNCE_MS + 100));
        assert.equal(resizeCalls, 2, 'nowe zdarzenie po oknie debouncu działa');
    } finally {
        ctrl.teardownResizeListener();
        globalThis.window = originalWindow;
    }
});

test('setupResizeListener nie podpina handlera drugi raz (idempotencja)', async () => {
    const originalWindow = globalThis.window;
    const resizeListeners = new Set();
    globalThis.window = {
        ...originalWindow,
        addEventListener: (type, handler) => { if (type === 'resize') resizeListeners.add(handler); },
        removeEventListener: (type, handler) => { if (type === 'resize') resizeListeners.delete(handler); }
    };
    const ctrl = new ChartController({ charts: {}, draw: () => { } });
    try {
        ctrl.setupResizeListener();
        ctrl.setupResizeListener();
        assert.equal(resizeListeners.size, 1, 'duplikat handlera nie jest podpinany');
    } finally {
        ctrl.teardownResizeListener();
        globalThis.window = originalWindow;
    }
});
