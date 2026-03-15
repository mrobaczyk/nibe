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
        if (!hourlyData || !Array.isArray(hourlyData)) return [];

        const daily = {};

        hourlyData.forEach(h => {
            // Kluczowe: upewniamy się, że bierzemy tylko YYYY-MM-DD
            const date = h.date.split(' ')[0];

            if (!daily[date]) {
                daily[date] = {
                    date: date,
                    starts: 0, work_hours_heating: 0, work_hours_cwu: 0,
                    kwh_produced_heating: 0, kwh_produced_cwu: 0,
                    kwh_consumed_heating: 0, kwh_consumed_cwu: 0,
                    outdoor_sum: 0, count: 0
                };
            }

            // Używamy Number(), aby uniknąć sklejania stringów i upewniamy się, że dodajemy do czystego obiektu
            daily[date].starts += Number(h.starts || 0);
            daily[date].work_hours_heating += Number(h.work_hours_heating || 0);
            daily[date].work_hours_cwu += Number(h.work_hours_cwu || 0);
            daily[date].kwh_produced_heating += Number(h.kwh_produced_heating || 0);
            daily[date].kwh_produced_cwu += Number(h.kwh_produced_cwu || 0);
            daily[date].kwh_consumed_heating += Number(h.kwh_consumed_heating || 0);
            daily[date].kwh_consumed_cwu += Number(h.kwh_consumed_cwu || 0);
            daily[date].outdoor_sum += Number(h.outdoor_avg || 0);
            daily[date].count++;
        });

        return Object.values(daily).map(d => {
            // Liczymy COP na poziomie DNIA
            const copH = d.kwh_consumed_heating > 0 ? (d.kwh_produced_heating / d.kwh_consumed_heating) : 0;
            const copC = d.kwh_consumed_cwu > 0 ? (d.kwh_produced_cwu / d.kwh_consumed_cwu) : 0;

            return {
                ...d,
                outdoor_avg: d.count > 0 ? Number((d.outdoor_sum / d.count).toFixed(1)) : 0,
                cop_heating: Number(copH.toFixed(2)),
                cop_cwu: Number(copC.toFixed(2))
            };
        });
    },

    aggregateHourlyToMonthly(hourlyData) {
        const months = {};

        hourlyData.forEach(d => {
            // Klucz miesiąca w formacie YYYY-MM-01, aby Chart.js traktował to jako datę
            const mKey = d.date.substring(0, 7) + "-01";

            if (!months[mKey]) {
                months[mKey] = {
                    date: mKey,
                    prodH: 0, consH: 0,
                    prodC: 0, consC: 0,
                    starts: 0,
                    whH: 0, whC: 0,
                    tempSum: 0, count: 0
                };
            }

            const cHeating = Number(d.kwh_consumed_heating || 0);
            const cCWU = Number(d.kwh_consumed_cwu || 0);

            // Sumowanie liczników
            months[mKey].starts += Number(d.starts || 0);
            months[mKey].whH += Number(d.work_hours_heating || 0);
            months[mKey].whC += Number(d.work_hours_cwu || 0);

            // Produkcja i zużycie (zabezpieczenie przed błędami w danych)
            if (cHeating >= 0) {
                months[mKey].prodH += Number(d.kwh_produced_heating || 0);
                months[mKey].consH += cHeating;
            }

            if (cCWU >= 0) {
                months[mKey].prodC += Number(d.kwh_produced_cwu || 0);
                months[mKey].consC += cCWU;
            }

            // Dane do średniej temperatury (tylko jeśli wartość istnieje)
            if (d.outdoor_avg !== undefined) {
                months[mKey].tempSum += Number(d.outdoor_avg);
                months[mKey].count++;
            }
        });

        // Mapowanie na końcowy format obiektu, który rozumie CONFIG.CHART_CONFIG
        return Object.values(months).map(m => {
            const copH = m.consH > 0 ? (m.prodH / m.consH) : 0;
            const copC = m.consC > 0 ? (m.prodC / m.consC) : 0;

            return {
                date: m.date,
                kwh_produced_heating: Number(m.prodH.toFixed(1)),
                kwh_consumed_heating: Number(m.consH.toFixed(1)),
                kwh_produced_cwu: Number(m.prodC.toFixed(1)),
                kwh_consumed_cwu: Number(m.consC.toFixed(1)),
                starts: m.starts,
                work_hours_heating: Number(m.whH.toFixed(1)),
                work_hours_cwu: Number(m.whC.toFixed(1)),
                cop_heating: Number(copH.toFixed(2)),
                cop_cwu: Number(copC.toFixed(2)),
                outdoor_avg: m.count > 0 ? Number((m.tempSum / m.count).toFixed(1)) : 0
            };
        }).sort((a, b) => a.date.localeCompare(b.date));
    }
}

function round(val, prec) {
    return Number(Math.round(val + 'e' + prec) + 'e-' + prec);
}