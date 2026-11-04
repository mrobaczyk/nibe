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

export async function fetchDashboardData() {
    const t = Date.now();
    const responses = await Promise.all([
        fetch(`${CONFIG.DATA.STREAM}?t=${t}`),
        fetch(`${CONFIG.DATA.HOURLY}?t=${t}`),
        fetch(`${CONFIG.DATA.POWER_MODEL}?t=${t}`)
    ]);
    const failed = responses.find(r => !r.ok);
    if (failed) throw new Error(`HTTP ${failed.status} dla ${failed.url}`);
    const [rData, rHourly, rModel] = responses;

    let configHistory = [];
    try {
        const rConfig = await fetch(`${CONFIG.DATA.CONFIG_HISTORY}?t=${t}`);
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
