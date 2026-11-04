import { CONFIG } from './config.js';

export function parseFlexibleJSON(text) {
    const trimmed = text.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
        try {
            return JSON.parse(trimmed);
        } catch (e) {
            console.error("Błąd parsowania standardowego JSON:", e);
            return [];
        }
    }

    return trimmed.split('\n')
        .filter(line => line.trim().length > 0)
        .map((line, index) => {
            try {
                return JSON.parse(line);
            } catch (err) {
                console.warn(`Błąd w linii ${index + 1}:`, err);
                return null;
            }
        })
        .filter(item => item !== null);
}

// 'no-cache' = always revalidate (ETag / 304), so data stays fresh but unchanged files are not re-downloaded.
const FETCH_OPTIONS = { cache: 'no-cache' };

export async function fetchDashboardData() {
    const responses = await Promise.all([
        fetch(CONFIG.DATA.STREAM, FETCH_OPTIONS),
        fetch(CONFIG.DATA.HOURLY, FETCH_OPTIONS),
        fetch(CONFIG.DATA.POWER_MODEL, FETCH_OPTIONS)
    ]);
    const failed = responses.find(r => !r.ok);
    if (failed) throw new Error(`HTTP ${failed.status} dla ${failed.url}`);
    const [rData, rHourly, rModel] = responses;

    let configHistory = [];
    try {
        const rConfig = await fetch(CONFIG.DATA.CONFIG_HISTORY, FETCH_OPTIONS);
        if (rConfig.ok) configHistory = await rConfig.json();
    } catch (e) {
        console.warn("Brak historii konfiguracji:", e);
    }

    return {
        configHistory,
        powerModel: await rModel.json(),
        rawJson: parseFlexibleJSON(await rData.text()),
        hourlyData: parseFlexibleJSON(await rHourly.text())
    };
}
