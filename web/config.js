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
            v: (s) => `${s.calculated.totalStarts} (${s.last.starts})`,
            u: (s) => `Śr: ${s.calculated.avgStarts}/d<br>${s.calculated.rangeLabel}: +${s.calculated.diffStarts}<br>${s.calculated.ratio} h/start`
        },
        {
            id: 'op_time', t: 'Czas pracy (h)', c: 'text-emerald-400',
            v: (s) => `${s.calculated.totalWorkHours} (${s.last.op_time_total})`,
            u: (s) => `Śr: ${s.calculated.avgWork}/d<br>${s.calculated.rangeLabel}: +${s.calculated.diffWork}<br>CWU: ${s.calculated.totalCwuHours} (${s.calculated.cwuPercentTime}%)`
        },
        {
            id: 'power', t: 'Szac. Pobór Mocy', c: 'text-yellow-400', targetChart: 'c-power',
            v: (s) => `${s.calculated.currentPowerKw} kW`,
            u: (s) => `Sprężarka: ${s.last.compressor_hz} Hz<br>Prędkość GP1: ${s.last.pump_speed}%<br>Temp. zew.: ${s.last.outdoor}°C`
        },
        {
            id: 'consumption', t: 'Szac. zużycie (kWh)', c: 'text-orange-400',
            v: (s) => s.calculated.totalConsKwh,
            u: (s) => `Śr: ${s.calculated.avgConsKwh}/d<br>${s.calculated.rangeLabel}: +${s.calculated.diffConsKwh}<br>CWU: ${s.calculated.cwuConsKwh} (${s.calculated.cwuConsPercent}%)`
        },
        {
            id: 'production', t: 'Produkcja (kWh)', c: 'text-yellow-400',
            v: (s) => `${s.calculated.totalKwh} (${s.last.kwh_produced_cwu + s.last.kwh_produced_heating})`,
            u: (s) => `Śr: ${s.calculated.avgKwh}/d<br>${s.calculated.rangeLabel}: +${s.calculated.diffKwh}<br>CWU: ${s.calculated.cwuKwh} (${s.calculated.cwuPercentKwh}%)`
        },
        {
            id: 'cop', t: `Szac. COP (od ${SYNC_LABEL})`, c: 'text-green-400',
            v: (s) => s.calculated.totalCop,
            u: (s) => `${s.calculated.rangeLabel}: ${s.calculated.rangeCop}`
        },
        {
            id: 'status', t: 'Statusy',
            v: (s) => CONFIG.getStatusValue(s),
            u: (s) => '',
            dynamicClass: (s) => CONFIG.getStatusClass(s)
        },
        {
            id: 'curve', t: 'Krzywa / Przesunięcie', c: 'text-yellow-400',
            v: (s) => `${s.last.heat_curve || 0} / ${s.last.heat_offset || 0}`,
            u: (s) => ''
        },
        {
            id: 'supply', t: 'Zasil. / Oblicz. (°C)', c: 'text-orange-400', targetChart: 'c-supply',
            v: (s) => `${s.last.bt25_temp} / ${s.last.calc_flow}`,
            u: (s) => `EB101 BT12: ${s.last.supply_line_eb101}<br>EB101 BT3: ${s.last.return_line_eb101}<br>Delta: ${(s.last.supply_line_eb101 - s.last.return_line_eb101).toFixed(1)}`
        },
        {
            id: 'cwu_mode', t: 'Tryb CWU', c: 'text-pink-400',
            v: (s) => CONFIG.cwuNames[s.last.current_hot_water_mode] || "Normalny",
            u: (s) => `Góra (BT7): ${s.last.cwu_upper || '--'}°C<br>Dół (BT6): ${s.last.cwu_load || '--'}°C`
        },
        {
            id: 'db_info', t: 'Status Bazy Danych', c: 'text-gray-400',
            v: (s) => s.totalCount,
            u: (s) => `Ostatnie ${s.calculated.rangeLabel}: <span class="text-emerald-500">+${s.dataCountRange}</span> 
            <span class="${s.calculated.dbHealth < 95 ? 'text-red-400' : 'text-slate-500'} font-mono">(${s.calculated.dbHealth}%)</span><br>
            Dni od startu: ${s.calculated.dbDaysFromStart}<br>Dni od synchronizacji: ${s.calculated.dbDaysFromSync}`
        },
    ],

    TRENDS: [
        {
            k: 'outdoor', t: 'Trend Zewn.', c: 'text-blue-400',
            display: (val, icon) => `${val}°C ${icon}`
        },
        {
            k: 'cwu_upper', t: 'Trend CWU', c: 'text-pink-500',
            display: (val, icon) => `${val}°C ${icon}`
        },
        {
            k: 'degree_minutes', t: 'Trend SM', c: 'text-yellow-400',
            display: (val, icon) => `${val} ${icon}`
        },
        {
            k: 'compressor_hz', t: 'Sprężarka', c: 'text-emerald-400',
            display: (val, icon) => `${val} Hz ${icon}`
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
                { k: 'liquid_line', l: 'EB101-BT15', c: '#a855f7', s: false, h: true, p: 1 }
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
