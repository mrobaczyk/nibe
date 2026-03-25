const SYNC_DATE = new Date("2026-03-05T21:50:00"); // Data startu monitoringu prądu
const SYNC_LABEL = SYNC_DATE.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });

export const CONFIG = {
    refreshIntervalMs: 300000, //5 minutes
    get intervalMinutes() { return this.refreshIntervalMs / 60000; },
    startDate: new Date("2025-12-29T00:00:00Z"),
    cwuNames: { 0: "Oszczędny", 1: "Normalny", 2: "Luksusowy", 3: "Przegrzew" },
    syncTooltips: false,

    DATA: {
        RAW: 'data/data.json',
        HOURLY: 'data/hourly_stats.json',
        ONLINE_THRESHOLD_MS: 15 * 60 * 1000, //15 minutes
        MS_PER_DAY: 24 * 60 * 60 * 1000 //24 hours
    },

    OFFSETS: {
        cwu: 403.5,
        heating: 4817.1,
        starts: 1219,
        op_time_total: 1077.0,
        op_time_cwu: 67.0,
        date: SYNC_DATE,
        dateLabel: SYNC_LABEL
    },

    DEFAULTS: {
        ACTIVE_FRAME: '24h',
        LIVE_RANGE: 24,
        VIEW: 'live',
        STATS_TYPE: 'daily'
    },

    UI: {
        ALPHA_BAR: '80',
        ALPHA_ZONE: '33',
        BORDER_WIDTH: 2,
        POINT_RADIUS: 2,
        LINE_TENSION: 0.1
    },

    TIME_FRAMES: {
        '1h': { hrs: 1, unit: 'minute', agg: 'hourly' },
        '3h': { hrs: 3, unit: 'hour', agg: 'hourly' },
        '8h': { hrs: 8, unit: 'hour', agg: 'hourly' },
        '24h': { hrs: 24, unit: 'hour', agg: 'hourly' },
        '3d': { hrs: 72, unit: 'day', agg: 'daily' },
        '7d': { hrs: 168, unit: 'day', agg: 'daily' },
        '30d': { hrs: 720, unit: 'day', agg: 'daily' },
        //'12m': { hrs: 8760, unit: 'month', agg: 'monthly' }
    },

    KPIS: [
        {
            id: 'starts', t: 'Starty', c: 'text-blue-400',
            v: (s) => `${f(s.calculated?.totalStarts, 0)} (${f(s.last?.starts, 0)})`,
            u: (s) => `Śr: ${f(s.calculated?.avgStarts)}/d<br>${f(s.calculated?.rangeLabel)}: +${f(s.calculated?.diffStarts, 0)}<br>${f(s.calculated?.ratio, 2)} h/start`
        },
        {
            id: 'op_time', t: 'Czas pracy (h)', c: 'text-emerald-400',
            v: (s) => `${f(s.calculated?.totalWorkHours, 0)} (${f(s.last?.op_time_total, 0)})`,
            u: (s) => `Śr: ${f(s.calculated?.avgWork)}/d<br>${f(s.calculated?.rangeLabel)}: +${f(s.calculated?.diffWork, 0)}<br>CWU: ${f(s.calculated?.totalCwuHours, 0)} (${f(s.calculated?.cwuPercentTime)}%)`
        },
        {
            id: 'power', t: 'Szac. Pobór Mocy', c: 'text-yellow-400', targetChart: 'c-power',
            v: (s) => `${f(s.calculated?.currentPowerKw, 2)} kW`,
            u: (s) => ``
        },
        {
            id: 'consumption', t: 'Szac. zużycie (kWh)', c: 'text-orange-400',
            v: (s) => f(s.calculated?.totalConsKwh),
            u: (s) => `Śr: ${f(s.calculated?.avgConsKwh)}/d<br>${f(s.calculated?.rangeLabel)}: +${f(s.calculated?.diffConsKwh)}<br>CWU: ${f(s.calculated?.cwuConsKwh)} (${f(s.calculated?.cwuConsPercent)}%)`
        },
        {
            id: 'production', t: 'Produkcja (kWh)', c: 'text-yellow-400',
            v: (s) => {
                const sum = (s.last?.kwh_produced_cwu ?? 0) + (s.last?.kwh_produced_heating ?? 0);
                return `${f(s.calculated?.totalKwh)} (${f(sum)})`;
            },
            u: (s) => `Śr: ${f(s.calculated?.avgKwh)}/d<br>${f(s.calculated?.rangeLabel)}: +${f(s.calculated?.diffKwh)}<br>CWU: ${f(s.calculated?.cwuKwh)} (${f(s.calculated?.cwuPercentKwh)}%)`
        },
        {
            id: 'cop', t: `Szac. COP (od ${SYNC_LABEL})`, c: 'text-green-400',
            v: (s) => f(s.calculated?.totalCop, 2),
            u: (s) => `${f(s.calculated?.rangeLabel)}: ${f(s.calculated?.rangeCop, 2)}`
        },
        {
            id: 'status', t: 'Statusy',
            v: (s) => CONFIG.getStatusValue(s),
            u: (s) => '',
            dynamicClass: (s) => CONFIG.getStatusClass(s)
        },
        {
            id: 'curve', t: 'Krzywa / Przesunięcie', c: 'text-yellow-400',
            v: (s) => `${f(s.last?.heat_curve, 0)} / ${f(s.last?.heat_offset, 0)}`,
            u: (s) => ''
        },
        {
            id: 'supply', t: 'Zasil. / Oblicz. (°C)', c: 'text-orange-400', targetChart: 'c-supply',
            v: (s) => `${f(s.last?.bt25_temp)} / ${f(s.last?.calc_flow)}`,
            u: (s) => {
                const val12 = s.last?.supply_line_eb101;
                const val3 = s.last?.return_line_eb101;
                const deltaVal = (val12 !== undefined && val3 !== undefined) ? (val12 - val3) : undefined;
                const isWorking = (s.last?.compressor_hz ?? 0) > 0;
                const colorClass = (isWorking && deltaVal < 2.0) ? 'text-rose-500 animate-pulse font-black' : 'text-slate-400';

                return `EB101 BT12: ${f(val12)}<br>EB101 BT3: ${f(val3)}<br>
                    Delta: <span class="${colorClass}">${f(deltaVal)}</span>`;
            }
        },
        {
            id: 'cwu_mode', t: 'Tryb CWU', c: 'text-pink-400',
            trendKey: 'cwu_load',
            v: (s) => CONFIG.cwuNames[s.last?.current_hot_water_mode] || "Normalny",
            u: (s) => `Góra (BT7): ${f(s.last?.cwu_upper)}°C<br>Dół (BT6): ${f(s.last?.cwu_load)}°C`
        },
        {
            id: 'pressure', t: 'Ciśnienie (bar)', c: 'text-green-400',
            v: (s) => `${f(s.last?.high_pressure)} / ${f(s.last?.low_pressure)}`,
            u: (s) => `Delta: ${f(s.last?.high_pressure - s.last?.low_pressure)}`
        },
        {
            id: 'db_info', t: 'Status Bazy Danych', c: 'text-gray-400',
            v: (s) => f(s.totalCount, 0),
            u: (s) => {
                const health = s.calculated?.dbHealth;
                const healthClass = (health !== undefined && health < 95) ? 'text-red-400' : 'text-slate-500';
                return `Ostatnie ${f(s.calculated?.rangeLabel)}: <span class="text-emerald-500">+${f(s.dataCountRange, 0)}</span> 
                    <span class="${healthClass} font-mono">(${f(health, 0)}%)</span><br>
                    Dni od startu: ${f(s.calculated?.dbDaysFromStart, 0)}<br>Dni od synchro: ${f(s.calculated?.dbDaysFromSync, 0)}`;
            }
        },
        {
            id: 'temp_outdoor', t: 'Temp. Zewn.', c: 'text-blue-400',
            trendKey: 'outdoor',
            v: (s) => `${f(s.last?.outdoor)}°C`,
            u: (s) => `Średnia: ${f(s.last?.outdoor_avg)}°C<br>Czas obliczania: ${f(s.last?.filter_time, 0)}h`
        },
        {
            id: 'degree_minutes', t: 'Stopniominuty', c: 'text-yellow-400',
            trendKey: 'degree_minutes',
            v: (s) => f(s.last?.degree_minutes, 0),
            u: (s) => ``
        },
        {
            id: 'compressor_hz', t: 'Sprężarka', c: 'text-emerald-400',
            trendKey: 'compressor_hz',
            v: (s) => `${f(s.last?.compressor_hz, 0)}Hz`,
            u: (s) => `Prędkość GP1: ${f(s.last?.pump_speed, 0)}%`
        }
    ],

    CHART_CONFIG: [
        {
            id: 'c-stats',
            title: () => 'LICZBA STARTÓW I TRYBY PRACY',
            datasets: [
                { l: 'Praca CO', c: 'rgba(59, 130, 246, 0.2)', t: 'bar', yAxisID: 'y-work', isZone: 'yCO' },
                { l: 'Ciepła Woda', c: 'rgba(236, 72, 153, 0.2)', t: 'bar', yAxisID: 'y-work', isZone: 'yCWU' },
                { l: 'Defrost', c: 'rgba(251, 191, 36, 0.2)', t: 'bar', yAxisID: 'y-work', isZone: 'yDefrost' },
                { k: 'starts', l: 'Starty', c: '#fbbf24', s: true, h: false, p: 0 },
                { k: 'op_time_total', l: 'Czas pracy (h)', c: '#10b981', s: true, h: true, p: 0 }
            ]
        },
        {
            id: 'c-energy',
            title: () => 'ENERGIA WYPRODUKOWANA (kWh)',
            datasets: [
                {
                    l: 'Łącznie',
                    d: (m) => m('kwh_produced_heating') + m('kwh_produced_cwu'),
                    c: '#3b82f6', s: false, h: false, p: 1
                },
                { k: 'kwh_produced_heating', l: 'Ogrzewanie', c: '#eab308', s: false, h: true, p: 1 },
                { k: 'kwh_produced_cwu', l: 'CWU', c: '#ec4899', s: false, h: true, p: 1 }
            ]
        },
        {
            id: 'c-temp',
            title: (last) => `TEMP. ZEW. (°C) (CZAS OBL.: ${last.filter_time || '--'}h)`,
            datasets: [
                { k: 'outdoor', l: 'Chwilowa', c: '#3b82f6', s: false, p: 1 },
                { k: 'outdoor_avg', l: 'Średnia', c: '#93c5fd', s: false, p: 1 }
            ]
        },
        {
            id: 'c-curve',
            title: () => 'KRZYWA GRZEWCZA',
            options: { yMin: -10, yMax: 15 },
            datasets: [
                { k: 'heat_curve', l: 'Krzywa', c: '#fbbf24', s: true, p: 0 },
                { k: 'heat_offset', l: 'Przesunięcie', c: '#f87171', s: true, p: 0 }
            ]
        },
        {
            id: 'c-gm',
            title: () => 'STOPNIOMINUTY (SM)',
            datasets: [
                { k: 'degree_minutes', l: 'Stopniominuty', c: '#facc15', s: false, p: 0 },
                { k: 'start_gm_level', l: 'Start sprężarki', c: '#ef4444', s: true, p: 0 }
            ]
        },
        {
            id: 'c-hz',
            title: () => 'SPRĘŻARKA',
            datasets: [
                { k: 'compressor_hz', l: 'Sprężarka (Hz)', c: '#10b981', s: true, p: 0 },
                { k: 'pump_speed', l: 'Pompa GP1 (%)', c: '#6366f1', s: true, p: 0 }
            ]
        },
        {
            id: 'c-flow',
            title: () => 'ZASILANIE / OBLICZONA (°C)',
            datasets: [
                { k: 'calc_flow', l: 'Obliczona', c: '#eab308', s: true, p: 1 },
                { k: 'bt25_temp', l: 'Zasilanie (BT25)', c: '#f87171', s: false, p: 1 },
                { k: 'room_temperature', l: 'Pokój (BT50)', c: '#10b981', s: false, p: 1 },
                { k: 'supply_line', l: 'BT2', c: '#ef4444', s: false, h: true, p: 1 },
                { k: 'return_line', l: 'BT3', c: '#3b82f6', s: false, h: true, p: 1 },
                { k: 'supply_line_eb101', l: 'EB101-BT12', c: '#f97316', s: false, h: true, p: 1 },
                { k: 'return_line_eb101', l: 'EB101-BT3', c: '#6366f1', s: false, h: true, p: 1 },
                { k: 'liquid_line', l: 'Rura cieczowa (EB101-BT15)', c: '#a855f7', s: false, h: true, p: 1 },
                { k: 'evaporator', l: 'Parownik (EB101-BT16)', c: '#fb7185', s: false, h: true, p: 1 }
            ]
        },
        {
            id: 'c-pressure',
            title: () => 'CIŚNIENIE (BAR)',
            datasets: [
                { k: 'high_pressure', l: 'Wysokie (EB101-BP4)', c: '#eab308', s: true, p: 1 },
                { k: 'low_pressure', l: 'Niskie (EB101-BP8)', c: '#f87171', s: true, p: 1 },
            ]
        },
        {
            id: 'c-cwu-mode',
            title: () => 'TRYB PRACY CWU',
            options: { yMin: -1, yMax: 4 },
            datasets: [{ k: 'current_hot_water_mode', l: 'Tryb CWU', c: '#ec4899', s: true, p: 0 }]
        },
        {
            id: 'c-cwu',
            title: () => 'TEMP. CWU (°C)',
            datasets: [
                { k: 'cwu_upper', l: 'Góra BT7', c: '#ec4899', s: false, p: 1 },
                { k: 'cwu_load', l: 'Ładowanie BT6', c: '#fb7185', s: false, p: 1 }
            ]
        },
        {
            id: 'c-live-power',
            title: () => 'SZAC. POBÓR MOCY (kW)',
            options: { showZero: true },
            datasets: [
                { k: 'v_inst_power', l: 'Moc estymowana', c: '#10b981', s: true, p: 2 }
            ]
        },
        {
            id: 'c-daily-energy-prod',
            title: () => `ENERGIA WYPRODUKOWANA (kWh)`,
            stacked: true,
            datasets: [
                { k: 'kwh_produced_heating', l: 'Ogrzewanie', c: '#3b82f6', t: 'bar', p: 1 },
                { k: 'kwh_produced_cwu', l: 'CWU', c: '#ec4899', t: 'bar', p: 1 }
            ]
        },
        {
            id: 'c-daily-energy-cons',
            title: () => `SZAC. ENERGIA POBRANA (kWh)`,
            stacked: true,
            datasets: [
                { k: 'kwh_consumed_heating', l: 'Ogrzewanie', c: '#60a5fa', t: 'bar', p: 1 },
                { k: 'kwh_consumed_cwu', l: 'CWU', c: '#f472b6', t: 'bar', p: 1 }
            ]
        },
        {
            id: 'c-daily-cop',
            title: () => `SZAC. COP VS TEMP. ZEWNĘTRZNA`,
            stacked: false,
            datasets: [
                { k: 'cop_heating', l: 'COP Ogrzewanie', c: '#3b82f6', t: 'bar', yAxisID: 'y', p: 1 },
                { k: 'cop_cwu', l: 'COP CWU', c: '#ec4899', t: 'bar', yAxisID: 'y', p: 1 },
                { k: 'outdoor_avg', l: 'Temp. Średnia (°C)', c: '#94a3b8', t: 'line', yAxisID: 'y-temp', p: 1 }
            ]
        },
        {
            id: 'c-daily-starts',
            title: () => `STARTY SPRĘŻARKI`,
            datasets: [
                { l: 'Starty', k: 'starts', c: '#10b981', t: 'bar', p: 0 }
            ]
        },
        {
            id: 'c-daily-work',
            title: () => `CZAS PRACY (h)`,
            stacked: true,
            datasets: [
                { k: 'work_hours_heating', l: 'Ogrzewanie', c: 'rgba(59, 130, 246, 0.8)', t: 'bar', p: 1 },
                { k: 'work_hours_cwu', l: 'CWU', c: 'rgba(236, 72, 153, 0.8)', t: 'bar', p: 1 }
            ]
        }
    ],

    getStatusValue(s) {
        const state = app.getWorkState(s.last, s.prevLast);

        if (state.isDefrost) return 'DEFROST';
        if (s.last.current_hot_water_mode == 3) return 'GRZANIE CWU - PRZEGRZEW'
        if (s.last.temp_lux == 1) return 'GRZANIE CWU - TYMCZASOWY LUKSUS';
        if (state.isCWU) return 'GRZANIE CWU';
        if (state.isCO) return 'GRZANIE CO';

        return 'OK';
    },

    getStatusClass(s) {
        const state = app.getWorkState(s.last, s.prevLast);

        if (state.isDefrost) return 'text-yellow-500 font-black';
        if (s.last.current_hot_water_mode == 3 || s.last.temp_lux == 1 || state.isCWU) return 'text-red-500 font-black';
        if (state.isCO) return 'text-blue-600 font-black';

        return 'text-slate-500';
    }
};

const f = (val, p = 1, fallback = '--') => {
    if (val === undefined || val === null || val === '') return fallback;
    if (typeof val === 'string') return val;
    if (typeof val === 'number' && !isNaN(val)) return val.toFixed(p);
    return fallback;
};
