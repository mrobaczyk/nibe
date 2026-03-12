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

    aggregateHourlyToDaily(hourlyData) {
        const daily = {};

        hourlyData.forEach(h => {
            const date = h.date.split(' ')[0]; // Wyciąga YYYY-MM-DD
            if (!daily[date]) {
                daily[date] = {
                    date: date,
                    starts: 0, work_hours_heating: 0, work_hours_cwu: 0,
                    kwh_produced_heating: 0, kwh_produced_cwu: 0,
                    kwh_consumed_heating: 0, kwh_consumed_cwu: 0,
                    outdoor_sum: 0, count: 0
                };
            }

            daily[date].starts += h.starts || 0;
            daily[date].work_hours_heating += h.work_hours_heating || 0;
            daily[date].work_hours_cwu += h.work_hours_cwu || 0;
            daily[date].kwh_produced_heating += h.kwh_produced_heating || 0;
            daily[date].kwh_produced_cwu += h.kwh_produced_cwu || 0;
            daily[date].kwh_consumed_heating += h.kwh_consumed_heating || 0;
            daily[date].kwh_consumed_cwu += h.kwh_consumed_cwu || 0;
            daily[date].outdoor_sum += h.outdoor_avg || 0;
            daily[date].count++;
        });

        return Object.values(daily).map(d => ({
            ...d,
            outdoor_avg: d.count > 0 ? round(d.outdoor_sum / d.count, 1) : 0,
            cop_heating: d.kwh_consumed_heating > 0 ? round(d.kwh_produced_heating / d.kwh_consumed_heating, 2) : 0,
            cop_cwu: d.kwh_consumed_cwu > 0 ? round(d.kwh_produced_cwu / d.kwh_consumed_cwu, 2) : 0
        }));
    },
}

function round(val, prec) {
    return Number(Math.round(val + 'e' + prec) + 'e-' + prec);
}