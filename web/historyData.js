import { CONFIG } from './config.js';
import { Utils } from './utils.js';

export function prepareHistoryData(hourlyData, activeFrame, minDate, maxDate) {
    const config = CONFIG.TIME_FRAMES[activeFrame || '24h'];
    const startTime = minDate.getTime();
    const endTime = maxDate.getTime();

    const result = [];
    for (const d of hourlyData) {
        const itemTs = Utils.parseTs(d.ts);
        if (itemTs >= startTime && itemTs <= endTime) {
            result.push({ ...d, ts: new Date(itemTs) });
        }
    }

    let aggregated = result;
    if (config.agg === 'daily') {
        aggregated = Utils.aggregateHourlyToDaily(result);
    } else if (config.agg === 'monthly') {
        aggregated = Utils.aggregateHourlyToMonthly(result);
    }

    // ts bywa Date (godziny) lub tekstem YYYY-MM-DD (dni/miesiące), więc samo odejmowanie dałoby NaN
    return aggregated.sort((a, b) => Utils.parseTs(a.ts) - Utils.parseTs(b.ts));
}
