import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, root)), 'utf-8');

// --- #34: README zawiera sekcję "Struktura projektu" zgodną z faktycznym drzewem ---

test('README opisuje strukturę projektu', () => {
    const readme = read('README.md');
    assert.match(readme, /^##\s+Struktura projektu$/m, 'sekcja ## Struktura projektu istnieje');
});

// Ścieżki, które dokumentacja MUSI wymieniać - każdy wpis weryfikowany istnieniem.
const REQUIRED_PATHS = [
    'index.html',
    'web/app.js',
    'web/config.js',
    'web/components/',
    'web/dataProcessing.js',
    'web/charts.js',
    'scripts/fetch_nibe.py',
    'scripts/data_utils.py',
    'scripts/set_nibe_parameters.py',
    'cloudflare/worker.js',
    'data/data_stream.json',
    'data/hourly_stats.json',
    'data/power_model.json',
    'tests/js/',
    'tests/test_data_utils.py',
    '.github/workflows/'
];

test('wszystkie ścieżki z sekcji struktury istnieją w repo', () => {
    for (const relativePath of REQUIRED_PATHS) {
        assert.ok(existsSync(fileURLToPath(new URL(relativePath, root))), `${relativePath} istnieje`);
    }
});

test('wymienione w teście pliki są opisane w README (katalog + nazwa pliku)', () => {
    const readme = read('README.md');
    for (const relativePath of REQUIRED_PATHS) {
        const segments = relativePath.split('/');
        const dir = segments.slice(0, -1).join('/') + '/';
        const name = segments.at(-1);

        if (segments.length === 1) {
            assert.ok(readme.includes(name), `README wspomina ${name}`);
        } else {
            assert.ok(readme.includes(dir), `README wspomina katalog ${dir}`);
            assert.ok(readme.includes(name), `README wspomina ${name} (w sekcji ${dir})`);
        }
    }
});
