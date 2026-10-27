import test from 'node:test';
import assert from 'node:assert/strict';

// Atrapa elementu statusu z parameterEditor.
function makeStatus() {
    return { text: '', set textContent(value) { this.text = value; }, get textContent() { return this.text; } };
}

// Instaluje atrapę fetch i zwraca funkcję przywracającą.
function stubFetch(handler) {
    const original = globalThis.fetch;
    globalThis.fetch = handler;
    return () => { globalThis.fetch = original; };
}

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => body,
        text: async () => JSON.stringify(body)
    };
}

const API_URL = 'https://gateway.example';

const { submitParameterUpdate } = await import('../../web/parameterEditor.js');

test('odrzuca puste SETTINGS_API_URL', async () => {
    const status = makeStatus();
    await assert.rejects(
        submitParameterUpdate({ '40941': '-120' }, status, ''),
        /Skonfiguruj SETTINGS_API_URL/
    );
});

test('wysyła POST z values i zwraca true po udanym workflow', async () => {
    const calls = [];
    const restore = stubFetch(async (url, options = {}) => {
        calls.push({ url, options });
        if (url.endsWith('/api/settings')) {
            return jsonResponse({ requestId: 'req-1' }, 202);
        }
        if (url.endsWith('/api/requests/req-1')) {
            return jsonResponse({ status: 'completed', conclusion: 'success' });
        }
        return jsonResponse({ error: 'nieznany endpoint' }, 404);
    });

    try {
        const status = makeStatus();
        const result = await submitParameterUpdate({ '40941': '-120' }, status, API_URL);

        assert.equal(result, true);
        const post = calls.find(c => c.url === `${API_URL}/api/settings`);
        assert.equal(post.options.method, 'POST');
        assert.deepEqual(JSON.parse(post.options.body), { values: { '40941': '-120' } });
        assert.equal(post.options.credentials, 'include');
        assert.equal(status.textContent, 'myUplink przyjął zmianę. Dashboard odświeży odczyt przy następnym pobraniu danych.');
    } finally {
        restore();
    }
});

test('zgłasza błąd bramy, gdy POST nie zwróci requestId', async () => {
    const restore = stubFetch(async (url) => {
        if (url.endsWith('/api/settings')) return jsonResponse({ error: 'Parametr 40941 nie jest dozwolony.' }, 400);
        return jsonResponse({}, 404);
    });

    try {
        await assert.rejects(
            submitParameterUpdate({ '12345': '1' }, makeStatus(), API_URL),
            /Parametr 40941 nie jest dozwolony/
        );
    } finally {
        restore();
    }
});

test('zgłasza błąd, gdy workflow zakończył się porażką', async () => {
    const restore = stubFetch(async (url) => {
        if (url.endsWith('/api/settings')) return jsonResponse({ requestId: 'req-2' }, 202);
        return jsonResponse({ status: 'completed', conclusion: 'failure' });
    });

    try {
        await assert.rejects(
            submitParameterUpdate({ '40941': '-120' }, makeStatus(), API_URL),
            /Aktualizacja nie powiodła się/
        );
    } finally {
        restore();
    }
});

test('rozpoznaje ekran logowania Cloudflare Access w odpowiedzi nie-JSON', async () => {
    const restore = stubFetch(async () => ({
        ok: false,
        status: 302,
        headers: { get: () => 'text/html' },
        text: async () => '<html>Sign in to Cloudflare Access</html>',
        json: async () => { throw new Error('not json'); }
    }));

    try {
        await assert.rejects(
            submitParameterUpdate({ '40941': '-120' }, makeStatus(), API_URL),
            /Cloudflare Access/
        );
    } finally {
        restore();
    }
});

test('wyrzuca czytelny błąd, gdy połączenie z bramą się nie powiedzie', async () => {
    const restore = stubFetch(async () => { throw new Error('network down'); });

    try {
        await assert.rejects(
            submitParameterUpdate({ '40941': '-120' }, makeStatus(), API_URL),
            /Nie można połączyć z bramą ustawień/
        );
    } finally {
        restore();
    }
});
