import test from 'node:test';
import assert from 'node:assert/strict';

import { parseFlexibleJSON } from '../../web/dataLoader.js';
import { computeNextOffset } from '../../web/rangeNavigation.js';
import { prepareHistoryData } from '../../web/historyData.js';
import { getTimeConfig } from '../../web/chartScales.js';
import { getLocalTimestamp } from '../../web/chartData.js';

test('parseFlexibleJSON obsługuje tablicę i JSONL', () => {
    assert.deepEqual(parseFlexibleJSON('[{"a":1}]'), [{ a: 1 }]);
    assert.deepEqual(parseFlexibleJSON('{"a":1}\n\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
    assert.deepEqual(parseFlexibleJSON('  '), []);
});

test('computeNextOffset wyrównuje do pełnej godziny i blokuje przyszłość', () => {
    const now = new Date('2026-01-10T12:34:00').getTime();
    const back = computeNextOffset('24h', 0, 'small', -1, now);
    assert.equal(new Date(now + back).getHours(), 11);
    assert.equal(new Date(now + back).getMinutes(), 0);
    assert.equal(computeNextOffset('24h', 0, 'small', 1, now), 0);
});

test('prepareHistoryData filtruje po zakresie', () => {
    const hourly = [{ ts: '2026-01-01 10:00' }, { ts: '2026-01-01 12:00' }, { ts: '2026-01-02 10:00' }];
    const res = prepareHistoryData(hourly, '24h', new Date('2026-01-01T11:00:00Z'), new Date('2026-01-01T13:00:00Z'));
    assert.equal(res.length, 1);
});

test('moduły wykresów: konfiguracja czasu i timestampy', () => {
    assert.deepEqual(getTimeConfig(false, 'day'), { timeUnit: 'day', tickLimitX: 7 });
    assert.equal(getLocalTimestamp('2026-01-01 10:00'), Date.UTC(2026, 0, 1, 10, 0));
});
