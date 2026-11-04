import { Utils } from './utils.js';

export const CWU_MODE = { ECONOMY: 0, NORMAL: 1, LUXURY: 2 };

const SCHEDULES = [
    { active: '47669', start: 47671, finish: 47679, comfort: 47687 },
    { active: '47635', start: 47637, finish: 47645, comfort: 47653 }
];
const WARSAW_TZ = 'Europe/Warsaw';
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

let configEntries = [];

export function setConfigHistory(history) {
    configEntries = (Array.isArray(history) ? history : [])
        .map(entry => ({ tsMs: Utils.parseTs(entry.ts), values: entry.values || {} }))
        .filter(entry => !isNaN(entry.tsMs))
        .sort((a, b) => a.tsMs - b.tsMs);
}

export function getConfigAt(tsMs) {
    if (!configEntries.length || tsMs < configEntries[0].tsMs) return null;
    const state = {};
    for (const entry of configEntries) {
        if (entry.tsMs > tsMs) break;
        Object.assign(state, entry.values);
    }
    return state;
}

const CONFIG_SAMPLE_FIELDS = { start_gm_level: '47206', filter_time: '47377' };

// Adds rarely-changing settings from config history to samples (sorted by ts).
export function applyConfigToSamples(samples) {
    if (!configEntries.length) return samples;
    let next = 0;
    const state = {};
    let hasConfig = false;
    for (const sample of samples) {
        const tsMs = Utils.parseTs(sample.ts);
        while (next < configEntries.length && configEntries[next].tsMs <= tsMs) {
            Object.assign(state, configEntries[next].values);
            hasConfig = true;
            next++;
        }
        if (!hasConfig) continue;
        for (const [field, id] of Object.entries(CONFIG_SAMPLE_FIELDS)) {
            if (state[id] !== undefined) sample[field] = state[id];
        }
    }
    return samples;
}

// Local Warsaw weekday (0 = Sunday) and seconds since midnight, DST-aware.
export function getWarsawClock(tsMs) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: WARSAW_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(tsMs));
    const get = type => parts.find(p => p.type === type).value;
    return {
        day: WEEKDAY_INDEX[get('weekday')],
        seconds: Number(get('hour')) * 3600 + Number(get('minute')) * 60
    };
}

// Schedule ids are ordered Sunday, Saturday, ..., Monday.
const dayOffset = day => (7 - day) % 7;

function scheduleComfortAt(config, schedule, day, seconds) {
    if (Number(config[schedule.active]) !== 1) return null;
    const read = (base, d) => config[String(base + dayOffset(d))];
    const matches = (d, isPreviousDay) => {
        const start = Number(read(schedule.start, d));
        const finish = Number(read(schedule.finish, d));
        const comfort = Number(read(schedule.comfort, d));
        if (![start, finish, comfort].every(Number.isFinite) || comfort < 0 || start === finish) return null;
        if (start < finish) {
            return !isPreviousDay && seconds >= start && seconds < finish ? comfort : null;
        }
        // Window crossing midnight belongs to the day it starts on.
        if (isPreviousDay) return seconds < finish ? comfort : null;
        return seconds >= start ? comfort : null;
    };
    const today = matches(day, false);
    return today !== null ? today : matches((day + 6) % 7, true);
}

// Returns { mode, source } or null when config is unknown for this time.
export function getCwuMode(sample) {
    if (!sample) return null;
    const tsMs = sample.tsMs ?? Utils.parseTs(sample.ts);
    if (Number(sample.hot_water_boost) === 1) return { mode: CWU_MODE.LUXURY, source: 'boost' };

    const config = getConfigAt(tsMs);
    if (!config) return null;
    const demand = sample.hot_water_demand == null ? NaN : Number(sample.hot_water_demand);
    if (demand === CWU_MODE.LUXURY) return { mode: CWU_MODE.LUXURY, source: 'demand' };

    const { day, seconds } = getWarsawClock(tsMs);
    for (const schedule of SCHEDULES) {
        const comfort = scheduleComfortAt(config, schedule, day, seconds);
        if (comfort !== null) return { mode: comfort, source: 'schedule' };
    }
    return Number.isFinite(demand) ? { mode: demand, source: 'demand' } : null;
}
