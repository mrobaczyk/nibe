// utils.js
export const Utils = {
    // Metoda 1: Formatowanie daty
    formatDate(ts, mode = 'tech') {
        if (!ts) return '--:--';

        const date = typeof ts === 'number' ? new Date(ts) : new Date(ts + " UTC");

        if (isNaN(date.getTime())) return '--:--';

        if (mode === 'friendly') {
            return date.toLocaleDateString('pl-PL', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            }).toUpperCase().replace('.', '');
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}`;
    },
};