const ALLOWED_PARAMETER_IDS = new Set(['40941', '47007', '47011']);
const GITHUB_API = 'https://api.github.com';
let accessKeysCache;

function jsonResponse(body, status, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
    });
}

function getCorsHeaders(request, env) {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== env.ALLOWED_ORIGIN) return null;

    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin'
    };
}

function decodeBase64Url(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function getAccessKeys(teamDomain) {
    if (accessKeysCache && accessKeysCache.expiresAt > Date.now()) {
        return accessKeysCache.keys;
    }

    const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!response.ok) throw new Error('Nie można pobrać kluczy Cloudflare Access.');

    const body = await response.json();
    accessKeysCache = { keys: body.keys || [], expiresAt: Date.now() + 60 * 60 * 1000 };
    return accessKeysCache.keys;
}

async function authorizeAccess(request, env) {
    const teamDomain = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const audience = env.ACCESS_AUD;
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!teamDomain || !audience || !token) throw new Error('Brak autoryzacji Cloudflare Access.');

    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Nieprawidłowy token Cloudflare Access.');

    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (header.alg !== 'RS256' || !header.kid) throw new Error('Nieobsługiwany token Cloudflare Access.');

    const jwk = (await getAccessKeys(teamDomain)).find(key => key.kid === header.kid);
    if (!jwk) throw new Error('Nieznany klucz podpisujący Cloudflare Access.');

    const publicKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
    );
    const signedContent = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const validSignature = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        decodeBase64Url(parts[2]),
        signedContent
    );
    const now = Math.floor(Date.now() / 1000);
    const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

    if (!validSignature || claims.iss !== `https://${teamDomain}` || !tokenAudiences.includes(audience)) {
        throw new Error('Nieprawidłowy token Cloudflare Access.');
    }
    if (!Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf && claims.nbf > now)) {
        throw new Error('Token Cloudflare Access wygasł lub nie jest jeszcze ważny.');
    }
}

async function githubRequest(path, env, options = {}) {
    const response = await fetch(`${GITHUB_API}${path}`, {
        ...options,
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'nibe-settings-worker',
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        console.error('GitHub API request failed:', response.status);
        throw new Error(`GitHub API zwróciło status ${response.status}.`);
    }
    return response;
}

function parseSubmittedValues(body) {
    if (!body || typeof body !== 'object' || !body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
        throw new Error('Oczekiwano mapy values z parametrami.');
    }

    const entries = Object.entries(body.values);
    if (entries.length < 1 || entries.length > ALLOWED_PARAMETER_IDS.size) {
        throw new Error('Można wysłać od 1 do 3 wartości.');
    }

    const values = {};
    for (const [parameterId, submittedValue] of entries) {
        if (!ALLOWED_PARAMETER_IDS.has(parameterId)) throw new Error(`Parametr ${parameterId} nie jest dozwolony.`);
        const value = String(submittedValue).trim();
        if (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
            throw new Error(`Wartość parametru ${parameterId} musi być skończoną liczbą.`);
        }
        values[parameterId] = value;
    }
    return values;
}

async function dispatchParameterUpdate(request, env) {
    const requestBody = await request.json();
    const values = parseSubmittedValues(requestBody);
    const requestId = crypto.randomUUID();
    const repository = env.GITHUB_REPOSITORY;
    const workflow = env.GITHUB_WORKFLOW || 'nibe_set_parameters.yml';
    const ref = env.GITHUB_REF || 'main';
    if (!repository || !env.GITHUB_TOKEN) throw new Error('Brak konfiguracji GitHub Worker.');

    await githubRequest(`/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, env, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ref,
            inputs: {
                request_id: requestId,
                values_json: JSON.stringify(values)
            }
        })
    });

    return jsonResponse({ requestId, status: 'queued' }, 202);
}

async function getRequestStatus(requestId, env) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
        return jsonResponse({ error: 'Nieprawidłowy identyfikator żądania.' }, 400);
    }

    const repository = env.GITHUB_REPOSITORY;
    const workflow = env.GITHUB_WORKFLOW || 'nibe_set_parameters.yml';
    const url = `/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&per_page=100`;
    const response = await githubRequest(url, env);
    const body = await response.json();
    const run = (body.workflow_runs || []).find(item =>
        String(item.display_title || item.name || '').includes(requestId)
    );

    if (!run) return jsonResponse({ requestId, status: 'queued' }, 200);
    return jsonResponse({
        requestId,
        status: run.status,
        conclusion: run.conclusion,
        updatedAt: run.updated_at
    }, 200);
}

export default {
    async fetch(request, env) {
        const corsHeaders = getCorsHeaders(request, env);
        if (!corsHeaders) return jsonResponse({ error: 'Origin niedozwolony.' }, 403);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

        try {
            await authorizeAccess(request, env);
            const url = new URL(request.url);

            if (request.method === 'POST' && url.pathname === '/api/settings') {
                const response = await dispatchParameterUpdate(request, env);
                Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
                return response;
            }

            const statusMatch = url.pathname.match(/^\/api\/requests\/([0-9a-f-]+)$/i);
            if (request.method === 'GET' && statusMatch) {
                const response = await getRequestStatus(statusMatch[1], env);
                Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
                return response;
            }

            return jsonResponse({ error: 'Nie znaleziono endpointu.' }, 404, corsHeaders);
        } catch (error) {
            const status = error.message.includes('Cloudflare Access') ? 401 : 400;
            return jsonResponse({ error: error.message }, status, corsHeaders);
        }
    }
};