import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// auth.js wykonuje wiring DOM na top-level, więc przed importem podstawiamy
// atrapy elementów i localStorage. Plik nie eksportuje niczego - test RED
// wymusi wyeksportowanie hashPassword i EXPECTED_HASH (refaktor bez zmiany zachowania).
class MemoryStorage {
    constructor() { this.store = new Map(); }
    getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
    setItem(key, value) { this.store.set(key, String(value)); }
    removeItem(key) { this.store.delete(key); }
}

const makeFakeElement = () => ({
    style: {},
    classList: { add() { }, remove() { } },
    value: '',
    focus() { },
    addEventListener() { }
});

const fakeElements = {
    'auth-overlay': makeFakeElement(),
    'pass-input': makeFakeElement(),
    'auth-btn': makeFakeElement(),
    'auth-error': makeFakeElement()
};

globalThis.document = { getElementById: (id) => fakeElements[id] };
globalThis.localStorage = new MemoryStorage();

const { hashPassword, EXPECTED_HASH } = await import('../../web/auth.js');

test('hashPassword zwraca SHA-256 hex zgodny z node:crypto (znane wektory)', async () => {
    assert.equal(await hashPassword('abc'), createHash('sha256').update('abc').digest('hex'));
    assert.equal(await hashPassword(''), createHash('sha256').update('').digest('hex'));
    assert.equal(await hashPassword('ąę żółć'), createHash('sha256').update('ąę żółć', 'utf8').digest('hex'));
});

test('hashPassword jest deterministyczny', async () => {
    assert.equal(await hashPassword('x1'), await hashPassword('x1'));
    assert.notEqual(await hashPassword('x1'), await hashPassword('x2'));
});

test('EXPECTED_HASH ma format 64 znaków lowercase hex (SHA-256)', () => {
    assert.match(EXPECTED_HASH, /^[0-9a-f]{64}$/);
});
