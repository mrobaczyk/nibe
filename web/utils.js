// utils.js
export const Utils = {
    // Surowe znaczniki czasu ("YYYY-MM-DD HH:mm") są w UTC. Zwraca ms lub NaN.
    parseTs(ts) {
        if (ts instanceof Date) return ts.getTime();
        if (typeof ts === 'number') return ts;
        const str = String(ts);
        if (str.endsWith('Z') || str.includes('UTC') || str.includes('+')) return new Date(str).getTime();
        return new Date(str.replace(/-/g, '/') + ' UTC').getTime();
    },

    // Czas rekordu w ms; używa wartości policzonej wcześniej (tsMs), jeśli jest.
    recordTime(record) {
        return record.tsMs ?? Utils.parseTs(record.ts);
    },

    formatDate(ts, mode = 'tech', unit = 'hour') {
        if (!ts) return '--:--';
        const date = new Date(Utils.parseTs(ts));
        if (isNaN(date.getTime())) return '--:--';

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        // To jest Twój nienaruszalny standard
        const fullTech = `${year}-${month}-${day} ${hours}:${minutes}`;

        if (mode === 'chart') {
            if (unit === 'month') return `${year}-${month}`;
            if (unit === 'day') return `${year}-${month}-${day}`;
        }

        // Dla mode='tech' oraz dla linii zawsze wróci to:
        return fullTech;
    },

    formatTime(totalMinutes) {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return hours > 0
            ? `${hours}:${minutes.toString().padStart(2, '0')}h`
            : `${minutes} min`;
    },

    getTrendDelta(data, current, key, windowMs, maxGapMs) {
        if (!Array.isArray(data) || !current?.ts || !Number.isFinite(windowMs) || windowMs <= 0) {
            return undefined;
        }

        const currentTs = Utils.recordTime(current);
        if (!Number.isFinite(currentTs)) return undefined;

        const startTs = currentTs - windowMs;
        const points = [];
        for (let index = data.length - 1; index >= 0; index--) {
            const source = data[index];
            const ts = Utils.recordTime(source);
            if (!Number.isFinite(ts) || ts > currentTs) continue;
            if (ts < startTs) break;

            const value = Number(source[key]);
            if (Number.isFinite(value)) points.push({ ts, value });
        }
        points.reverse();

        if (points.length < 4) return undefined;

        const firstTs = points[0].ts;
        const lastTs = points[points.length - 1].ts;
        if (lastTs - firstTs < windowMs * 0.6) return undefined;

        for (let index = 1; index < points.length; index++) {
            if (points[index].ts - points[index - 1].ts > maxGapMs) return undefined;
        }

        const xMean = points.reduce((sum, point) => sum + (point.ts - currentTs), 0) / points.length;
        const yMean = points.reduce((sum, point) => sum + point.value, 0) / points.length;
        let covariance = 0;
        let variance = 0;

        for (const point of points) {
            const x = point.ts - currentTs - xMean;
            covariance += x * (point.value - yMean);
            variance += x * x;
        }

        if (variance === 0) return undefined;

        const slopePerMs = covariance / variance;
        return slopePerMs * windowMs;
    },

    aggregateHourlyToDaily(hourlyData) {
        if (!hourlyData || !Array.isArray(hourlyData)) return [];

        const daily = {};

        hourlyData.forEach(h => {
            if (!h.ts) return;

            const dLocal = new Date(Utils.parseTs(h.ts));

            // 2. Pobieramy YYYY-MM-DD na podstawie czasu LOKALNEGO
            const year = dLocal.getFullYear();
            const month = String(dLocal.getMonth() + 1).padStart(2, '0');
            const day = String(dLocal.getDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`;

            if (!daily[dateKey]) {
                daily[dateKey] = {
                    ts: dateKey,
                    starts: 0, work_h_heat: 0, work_h_cwu: 0,
                    kwh_p_heat: 0, kwh_p_cwu: 0,
                    kwh_c_heat: 0, kwh_c_cwu: 0,
                    outdoor_sum: 0, count: 0
                };
            }

            // Agregacja danych
            daily[dateKey].starts += Number(h.starts || 0);
            daily[dateKey].work_h_heat += Number(h.work_h_heat || 0);
            daily[dateKey].work_h_cwu += Number(h.work_h_cwu || 0);
            daily[dateKey].kwh_p_heat += Number(h.kwh_p_heat || 0);
            daily[dateKey].kwh_p_cwu += Number(h.kwh_p_cwu || 0);
            daily[dateKey].kwh_c_heat += Number(h.kwh_c_heat || 0);
            daily[dateKey].kwh_c_cwu += Number(h.kwh_c_cwu || 0);
            daily[dateKey].outdoor_sum += Number(h.out_avg || 0);
            daily[dateKey].count++;
        });

        return Object.values(daily).map(d => {
            const copH = d.kwh_c_heat > 0 ? (d.kwh_p_heat / d.kwh_c_heat) : 0;
            const copC = d.kwh_c_cwu > 0 ? (d.kwh_p_cwu / d.kwh_c_cwu) : 0;

            return {
                ...d,
                date: new Date(d.ts.replace(/-/g, '/')),
                out_avg: d.count > 0 ? Number((d.outdoor_sum / d.count).toFixed(1)) : 0,
                cop_heat: Number(copH.toFixed(2)),
                cop_cwu: Number(copC.toFixed(2))
            };
        });
    },

    aggregateHourlyToMonthly(hourlyData) {
        const months = {};

        hourlyData.forEach(d => {
            if (!d.ts) return;

            const dateObj = new Date(Utils.parseTs(d.ts));

            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const mKey = `${year}-${month}-01`;

            if (!months[mKey]) {
                months[mKey] = {
                    ts: mKey,
                    prodH: 0, consH: 0, prodC: 0, consC: 0,
                    starts: 0, whH: 0, whC: 0, tempSum: 0, count: 0
                };
            }

            const cHeating = Number(d.kwh_c_heat || 0);
            const cCWU = Number(d.kwh_c_cwu || 0);
            months[mKey].starts += Number(d.starts || 0);
            months[mKey].whH += Number(d.work_h_heat || 0);
            months[mKey].whC += Number(d.work_h_cwu || 0);

            if (cHeating >= 0) {
                months[mKey].prodH += Number(d.kwh_p_heat || 0);
                months[mKey].consH += cHeating;
            }

            if (cCWU >= 0) {
                months[mKey].prodC += Number(d.kwh_p_cwu || 0);
                months[mKey].consC += cCWU;
            }

            if (d.out_avg !== undefined) {
                months[mKey].tempSum += Number(d.out_avg);
                months[mKey].count++;
            }
        });

        return Object.values(months).sort((a, b) => a.ts.localeCompare(b.ts)).map(m => {
            const copH = m.consH > 0 ? (m.prodH / m.consH) : 0;
            const copC = m.consC > 0 ? (m.prodC / m.consC) : 0;
            return {
                ts: m.ts,
                kwh_p_heat: Number(m.prodH.toFixed(1)),
                kwh_c_heat: Number(m.consH.toFixed(1)),
                kwh_p_cwu: Number(m.prodC.toFixed(1)),
                kwh_c_cwu: Number(m.consC.toFixed(1)),
                starts: m.starts,
                work_h_heat: Number(m.whH.toFixed(1)),
                work_h_cwu: Number(m.whC.toFixed(1)),
                cop_heat: Number(copH.toFixed(2)),
                cop_cwu: Number(copC.toFixed(2)),
                out_avg: m.count > 0 ? Number((m.tempSum / m.count).toFixed(1)) : 0
            };
        });
    },

    getTrendIcon(curr, prev, threshold = 0.01) {
        if (!Number.isFinite(curr) || !Number.isFinite(prev)) {
            return '';
        }

        const diff = curr - prev;
        if (Math.abs(diff) < threshold) return '<span class="text-slate-600 font-black text-md">＝</span>';

        // Używamy strzałek o pełnej szerokości (np. ▲ ▼) lub standardowych ↑ ↓
        if (diff > 0) return '<span class="text-emerald-500">▲</span>';
        return '<span class="text-rose-500">▼</span>';
    }
}

function round(val, prec) {
    return Number(Math.round(val + 'e' + prec) + 'e-' + prec);
}