import test from 'node:test';
import assert from 'node:assert/strict';

// Atrapa elementu śledząca podpięte listenery, scrollLeft i cursor (slider.style.cursor).
function makeSlider() {
    const listeners = new Map();
    return {
        listeners,
        scrollLeft: 0,
        offsetLeft: 0,
        style: { cursor: '' },
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        dispatch(type, event) {
            for (const handler of listeners.get(type) || []) handler(event);
        }
    };
}

function makeEvent(overrides = {}) {
    return {
        deltaY: 0,
        pageX: 0,
        preventDefault() { this.prevented = true; },
        prevented: false,
        ...overrides
    };
}

const { setupFilterScroll } = await import('../../web/filterScroll.js');

test('brak slajdera nie rzuca (null/undefined bezpieczne)', () => {
    assert.doesNotThrow(() => setupFilterScroll(null));
    assert.doesNotThrow(() => setupFilterScroll(undefined));
});

test('setupFilterScroll podpina wymagane listenery', () => {
    const slider = makeSlider();
    setupFilterScroll(slider);

    for (const type of ['wheel', 'mousedown', 'mouseleave', 'mouseup', 'mousemove']) {
        assert.ok(slider.listeners.has(type), `brak listenera ${type}`);
    }
});

test('kółko myszy przewija w poziomie i blokuje domyślne przewijanie pionowe', () => {
    const slider = makeSlider();
    slider.scrollLeft = 100;
    setupFilterScroll(slider);

    const event = makeEvent({ deltaY: 120 });
    slider.dispatch('wheel', event);

    assert.equal(slider.scrollLeft, 220, 'scrollLeft += deltaY');
    assert.equal(event.prevented, true, 'preventDefault wywołany');
});

test('kółko bez deltaY nie przewija i nie blokuje', () => {
    const slider = makeSlider();
    setupFilterScroll(slider);

    const event = makeEvent({ deltaY: 0 });
    slider.dispatch('wheel', event);

    assert.equal(slider.scrollLeft, 0);
    assert.equal(event.prevented, false);
});

test('przeciąganie przesuwa pasek 2x i ustawia cursor grabbing/grab', () => {
    const slider = makeSlider();
    setupFilterScroll(slider);

    slider.offsetLeft = 0;
    slider.scrollLeft = 50;
    slider.dispatch('mousedown', makeEvent({ pageX: 100 }));
    assert.equal(slider.style.cursor, 'grabbing');

    slider.dispatch('mousemove', makeEvent({ pageX: 130 })); // walk = 30*2 = 60
    assert.equal(slider.scrollLeft, -10, 'scrollLeft = start - walk');

    slider.dispatch('mouseup', makeEvent({}));
    assert.equal(slider.style.cursor, 'grab');

    // Po mouseup mousemove już nie przesuwa.
    slider.dispatch('mousemove', makeEvent({ pageX: 200 }));
    assert.equal(slider.scrollLeft, -10);
});

test('mouseleave kończy przeciąganie (cursor wraca do grab)', () => {
    const slider = makeSlider();
    setupFilterScroll(slider);

    slider.dispatch('mousedown', makeEvent({ pageX: 10 }));
    assert.equal(slider.style.cursor, 'grabbing');

    slider.dispatch('mouseleave', makeEvent({}));
    assert.equal(slider.style.cursor, 'grab');
});
