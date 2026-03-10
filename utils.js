// utils.js
export const Utils = {
    formatDate(ts, mode = 'tech') {
        // 1. Zabezpieczenie przed pustymi danymi
        if (!ts) return '--:--';

        // 2. Obsługa typu wejściowego (String z UTC vs Liczba z Chart.js)
        const date = typeof ts === 'number' ? new Date(ts) : new Date(ts + " UTC");

        // 3. Sprawdzenie poprawności daty
        if (isNaN(date.getTime())) return '--:--';

        // 4. Wybór formatu
        if (mode === 'friendly') {
            return date.toLocaleDateString('pl-PL', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            }).toUpperCase().replace('.', '');
        }

        // Format domyślny (tech): 2026-03-10 13:55
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
};