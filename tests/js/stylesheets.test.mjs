import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const read = (relativePath) => readFileSync(fileURLToPath(new URL(relativePath, root)), 'utf-8');

// --- Migracja Tailwind z Play CDN na statyczny build (#3) ---

test('index.html nie ładuje Tailwind z CDN ani innego zewnętrznego skryptu tailwind', () => {
    const html = read('index.html');
    assert.ok(!html.includes('cdn.tailwindcss.com'), 'usunięto script cdn.tailwindcss.com');
    assert.ok(!/<script[^>]+tailwind/i.test(html), 'brak jakiegokolwiek skryptu tailwind');
});

test('index.html ładuje statyczny tailwind.css po styles.css', () => {
    const html = read('index.html');
    const stylesAt = html.indexOf('web/styles.css');
    const tailwindAt = html.indexOf('web/tailwind.css');

    assert.ok(tailwindAt > -1, 'link do web/tailwind.css istnieje');
    assert.ok(stylesAt > -1, 'link do web/styles.css istnieje');
    // Kolejność odwzorowuje dotychczasowy efekt: wygenerowany style CDN lądował po styles.css,
    // więc utilities Tailwinda muszą móc nadpisywać reguły z styles.css.
    assert.ok(stylesAt < tailwindAt, 'styles.css ładowany przed tailwind.css');
});

test('web/tailwind.css istnieje i zawiera preflight oraz krytyczne klasy', () => {
    const cssPath = fileURLToPath(new URL('web/tailwind.css', root));
    if (!existsSync(cssPath)) {
        assert.fail('Brak web/tailwind.css - zbuduj: npx tailwindcss@3.4.17 -c tailwind.config.js -i web/tailwind.input.css -o web/tailwind.css --minify');
    }
    const css = read('web/tailwind.css');
    assert.ok(css.length > 1000, 'plik nie jest pusty');

    // Preflight (reset) - bez niego przyciski/ inputy dostaną natywne style przeglądarki.
    assert.match(css, /box-sizing:border-box/, 'preflight obecny');

    // Klasy składane dynamicznie w ChartComponent._btn (hover:bg-${color}-600)
    // niewidoczne dla skanera - muszą pochodzić z safelist w tailwind.config.js.
    const requiredClasses = [
        'hover\\:bg-emerald-600',
        'hover\\:bg-slate-600',
        'hover\\:bg-blue-600',
        // Arbitralne wartości i warianty używane w szablonach:
        'max-w-\\[1600px\\]',
        'animate-spin',
        'animate-pulse',
        'opacity-50',
        'grayscale',
        'focus\\:ring-2',
        'disabled\\:opacity-20',
        'md\\:grid-cols-4',
        'lg\\:grid-cols-6',
        'backdrop\\:bg-black\\/70',
        'shadow-\\[0_0_8px_\\#10b981\\]'
    ];
    for (const cls of requiredClasses) {
        assert.ok(css.includes(cls), `brak klasy ${cls} w web/tailwind.css`);
    }
});
