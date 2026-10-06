import { CONFIG } from './config.js';

// Zwraca nowe przesunięcie okna (ms względem "teraz") po kroku w danym kierunku.
export function computeNextOffset(activeFrame, liveOffset, type, direction, now = Date.now()) {
    const nav = CONFIG.NAVIGATION;
    const steps = CONFIG.TIME_FRAMES[activeFrame].hrs <= nav.SHORT_RANGE_MAX_HRS
        ? nav.SHORT_STEP_HRS
        : nav.LONG_STEP_HRS;
    const stepMs = steps[type === 'small' ? 'small' : 'large'] * CONFIG.DATA.MS_PER_HOUR;

    // Wyrównanie do pełnej godziny, żeby okno było "czyste" (np. 14:00-22:00)
    const aligned = new Date(now + liveOffset + stepMs * direction);
    aligned.setMinutes(0, 0, 0);
    const newOffset = aligned.getTime() - now;

    // Blokada przyszłości
    return newOffset > -nav.FUTURE_LOCK_MS ? 0 : newOffset;
}
