import { CONFIG } from './config.js';

// Zwraca nowe przesunięcie okna (ms względem "teraz") po kroku w danym kierunku.
export function computeNextOffset(activeFrame, liveOffset, type, direction, now = Date.now()) {
    const nav = CONFIG.NAVIGATION;
    // Tylko ramki godzinowe mają zdefiniowane "hrs" i kwalifikują się do krótkich kroków.
    // Ramki dzienne i miesięczne (oraz nieznane) świadomie dostają długie kroki.
    const frame = CONFIG.TIME_FRAMES[activeFrame] ?? {};
    const isShortRange = Number.isFinite(frame.hrs) && frame.hrs <= nav.SHORT_RANGE_MAX_HRS;
    const steps = isShortRange ? nav.SHORT_STEP_HRS : nav.LONG_STEP_HRS;
    const stepMs = steps[type === 'small' ? 'small' : 'large'] * CONFIG.DATA.MS_PER_HOUR;

    // Wyrównanie do pełnej godziny, żeby okno było "czyste" (np. 14:00-22:00)
    const aligned = new Date(now + liveOffset + stepMs * direction);
    aligned.setMinutes(0, 0, 0);
    const newOffset = aligned.getTime() - now;

    // Blokada przyszłości
    return newOffset > -nav.FUTURE_LOCK_MS ? 0 : newOffset;
}
