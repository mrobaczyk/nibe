import { Utils } from './utils.js';

export const CWU_MODE = { ECONOMY: 0, NORMAL: 1, LUXURY: 2, PERIODIC_INCREASE: 3 };

// 47046-47049: stop (target) temperature of the periodic increase, luxury, normal and economy.
const STOP_TEMP_ID = { 0: '47049', 1: '47048', 2: '47047', 3: '47046' };
// 47043-47045: start temperature of luxury, normal and economy; the periodic increase starts like luxury.
const START_TEMP_ID = { 0: '47045', 1: '47044', 2: '47043', 3: '47043' };
const STOP_PERIODIC_ID = '47046';
// Charge set point (43115) is stop temp + 2 °C while charging and -32768 otherwise.
const CHARGE_SETPOINT_OFFSET = 2;

const SCHEDULES = [
    { active: '47669', start: 47671, finish: 47679, comfort: 47687 },
    { active: '47635', start: 47637, finish: 47645, comfort: 47653 }
];
const WARSAW_TZ = 'Europe/Warsaw';
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

let configEntries = [];
let configStates = [];
let periodicDays = [];

const warsawClockFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: WARSAW_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
// Formatting is the hot path (one call per sample), so results are cached per minute.
const clockCache = new Map();

export function setConfigHistory(history) {
    configEntries = (Array.isArray(history) ? history : [])
        .map(entry => ({ tsMs: Utils.parseTs(entry.ts), values: entry.values || {} }))
        .filter(entry => !isNaN(entry.tsMs))
        .sort((a, b) => a.tsMs - b.tsMs);
    const state = {};
    configStates = configEntries.map(entry => {
        Object.assign(state, entry.values);
        return { ...state };
    });
    periodicDays = configEntries
        .map(entry => entry.values['50249'])
        .filter(Boolean)
        .map(value => Math.round(Date.parse(`${value}T00:00:00Z`) / 86400000));
    clockCache.clear();
}

export function getConfigAt(tsMs) {
    if (!configEntries.length || tsMs < configEntries[0].tsMs) return null;
    let low = 0;
    let high = configEntries.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (configEntries[mid].tsMs <= tsMs) low = mid;
        else high = mid - 1;
    }
    return configStates[low];
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

function getWarsawDate(tsMs) {
    return getWarsawClock(tsMs).date;
}

// Periodic increase: the date comes from config history (50249, parsed from the parameter name),
// the start hour from 49909. It lasts from the first CWU charge (priority 20) after the start hour
// until the charge ends or BT6 reaches the stop temperature (47046).
const PRIORITY_DHW = 20;

const MS_PER_DAY = 86400000;

// 50249 holds the date of the NEXT increase. Every date ever recorded is an increase day;
// earlier days are extrapolated backwards by the configured period (47051, days).
function isPeriodicDay(date, period) {
    const target = Math.round(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
    return periodicDays.some(known => {
        const diff = known - target;
        if (diff === 0) return true;
        return Number.isFinite(period) && period > 0 && diff > 0 && diff % period === 0;
    });
}

// `run` (optional, mutated) remembers the ongoing/finished increase between consecutive samples.
function isPeriodicIncreaseRunning(sample, config, tsMs, run) {
    const clock = getWarsawClock(tsMs);
    const date = clock.date;
    const startHour = Number(config['49909']);
    const stopTemp = Number(config['47046']);
    const eligible = Number(config['47050']) === 1 && Number.isFinite(startHour) &&
        clock.seconds >= startHour * 3600 &&
        isPeriodicDay(date, Number(config['47051']));
    if (!eligible) {
        if (run && run.activeDate !== date) run.activeDate = null;
        return false;
    }
    if (run?.finishedDate === date) return false;

    const charging = Number(sample.priority) === PRIORITY_DHW;
    if (!charging) {
        if (run && run.activeDate === date) {
            run.activeDate = null;
            run.finishedDate = date;
        }
        return false;
    }
    if (run) run.activeDate = date;
    const load = sample.cwu_load == null ? NaN : Number(sample.cwu_load);
    if (Number.isFinite(stopTemp) && Number.isFinite(load) && load >= stopTemp) {
        if (run) {
            run.activeDate = null;
            run.finishedDate = date;
        }
        return true;
    }
    return true;
}
// Local Warsaw weekday (0 = Sunday), date (YYYY-MM-DD) and seconds since midnight, DST-aware.
export function getWarsawClock(tsMs) {
    const bucket = Math.floor(tsMs / 60000);
    let clock = clockCache.get(bucket);
    if (!clock) {
        const parts = warsawClockFormat.formatToParts(new Date(tsMs));
        const get = type => parts.find(p => p.type === type).value;
        clock = {
            day: WEEKDAY_INDEX[get('weekday')],
            date: `${get('year')}-${get('month')}-${get('day')}`,
            seconds: Number(get('hour')) * 3600 + Number(get('minute')) * 60
        };
        if (clockCache.size > 5000) clockCache.clear();
        clockCache.set(bucket, clock);
    }
    return clock;
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
export function getCwuMode(sample, run = null) {
    if (!sample) return null;
    const tsMs = sample.tsMs ?? Utils.parseTs(sample.ts);
    const config = getConfigAt(tsMs);
    if (!config) return null;
    const setpoint = sample.cwu_setpoint == null ? NaN : Number(sample.cwu_setpoint);
    const periodicStop = Number(config[STOP_PERIODIC_ID]);
    if (Number.isFinite(setpoint) && Number.isFinite(periodicStop) &&
        setpoint >= periodicStop + CHARGE_SETPOINT_OFFSET - 0.5) {
        return { mode: CWU_MODE.PERIODIC_INCREASE, source: 'setpoint' };
    }
    if (isPeriodicIncreaseRunning(sample, config, tsMs, run)) {
        return { mode: CWU_MODE.PERIODIC_INCREASE, source: 'periodic' };
    }
    if (Number(sample.hot_water_boost) === 1) return { mode: CWU_MODE.LUXURY, source: 'boost' };
    // Samples collected before 47041 was fetched have no demand; the user keeps it on Normal.
    const demand = sample.hot_water_demand == null ? CWU_MODE.NORMAL : Number(sample.hot_water_demand);
    if (demand === CWU_MODE.LUXURY) return { mode: CWU_MODE.LUXURY, source: 'demand' };

    const { day, seconds } = getWarsawClock(tsMs);
    for (const schedule of SCHEDULES) {
        const comfort = scheduleComfortAt(config, schedule, day, seconds);
        if (comfort !== null) return { mode: comfort, source: 'schedule' };
    }
    return Number.isFinite(demand) ? { mode: demand, source: 'demand' } : null;
}

// Target (stop) CWU temperature configured for the mode active at the sample time.
function getModeTemp(sample, cwuMode, ids) {
    if (!cwuMode) return null;
    const tsMs = sample.tsMs ?? Utils.parseTs(sample.ts);
    const value = Number(getConfigAt(tsMs)?.[ids[cwuMode.mode]]);
    return Number.isFinite(value) ? value : null;
}

export function getCwuTargetTemp(sample, cwuMode = getCwuMode(sample)) {
    return getModeTemp(sample, cwuMode, STOP_TEMP_ID);
}

// Start (minimum) CWU temperature for the mode active at the sample time.
export function getCwuStartTemp(sample, cwuMode = getCwuMode(sample)) {
    return getModeTemp(sample, cwuMode, START_TEMP_ID);
}
