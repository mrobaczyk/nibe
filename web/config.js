export const CONFIG = {
    refreshInterval: 300000, //5 minutes
    startDate: new Date("2025-12-29T00:00:00Z"),
    cwuNames: { 0: "Oszczędny", 1: "Normalny", 2: "Luksusowy" },

    DATA: {
        RAW: 'data/data.json',
        HOURLY: 'data/hourly_stats.json',
        ONLINE_THRESHOLD_MS: 15 * 60 * 1000, //15 minutes
        MS_PER_DAY: 24 * 60 * 60 * 1000 //24 hours
    },

    DEFAULTS: {
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
        '1h': { hrs: 1 },
        '6h': { hrs: 6 },
        '24h': { hrs: 24 },
        '3d': { hrs: 72 },
        '7d': { hrs: 168 },
        '30d': { hrs: 720 }
    },

    KPIS: [
        {
            id: 'starts', t: 'Starty', c: 'text-blue-400',
            v: (s) => s.last.starts,
            u: (s) => `Śr: ${s.calculated.avgStarts}/d<br>${s.calculated.rangeLabel}: +${s.calculated.diffStarts}<br>${s.calculated.ratio} h/start`
        },
        {
            id: 'op_time', t: 'Czas pracy (h)', c: 'text-emerald-400',
            v: (s) => s.last.op_time_total,
            u: (s) => `Śr: ${s.calculated.avgWork}/d<br>${s.calculated.rangeLabel}: +${s.calculated.diffWork}<br>CWU: ${s.last.op_time_cwu} (${s.calculated.cwuPercentTime}%)`
        },
        {
            id: 'production', t: 'Produkcja (kWh)', c: 'text-yellow-400',
            v: (s) => s.calculated.totalKwh,
            u: (s) => `Śr: ${s.calculated.avgKwh}/d<br>${s.calculated.rangeLabel}: +${s.calculated.diffKwh}<br>CWU: ${s.calculated.cwuKwh} (${s.calculated.cwuPercentKwh}%)`
        },
        {
            id: 'cwu_mode', t: 'Tryb CWU', c: 'text-pink-400',
            v: (s) => CONFIG.cwuNames[s.last.current_hot_water_mode] || "Normalny",
            u: (s) => `Góra (BT7): ${s.last.cwu_upper || '--'}°C<br>Dół (BT6): ${s.last.cwu_load || '--'}°C`
        },
        {
            id: 'curve', t: 'Krzywa / Przesunięcie', c: 'text-yellow-400',
            v: (s) => `${s.last.heat_curve || 0} / ${s.last.heat_offset || 0}`,
            u: (s) => ''
        },
        {
            id: 'status', t: 'Statusy',
            v: (s) => CONFIG.getStatusValue(s),
            u: (s) => '',
            dynamicClass: (s) => CONFIG.getStatusClass(s)
        },
        {
            id: 'supply', t: 'Zasil. / Oblicz. (°C)', c: 'text-orange-400', targetChart: 'c-supply',
            v: (s) => `${s.last.supply_line}°C / ${s.last.bt25_temp}°C`,
            u: (s) => `EB101 BT12: ${s.last.supply_line_eb101}°C<br>EB101 BT3: ${s.last.return_line_eb101}°C<br>Delta: ${(s.last.supply_line_eb101 - s.last.return_line_eb101).toFixed(1)}°C`
        },
        {
            id: 'power', t: 'Pobór Mocy', c: 'text-yellow-400', targetChart: 'c-power',
            v: (s) => `${s.last.estimated_power_kw} kW`,
            u: (s) => `Sprężarka: ${s.last.compressor_hz} Hz`
        }
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
                { l: 'Defrost', c: 'rgba(255, 255, 255, 0.25)', t: 'bar', yAxisID: 'y-work', isZone: 'yDefrost' },
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
            title: (last) => `TEMP. ZEW. (°C) (CZAS OBLICZANIA: ${last.filter_time || '--'}h)`,
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
            options: { yMin: -1, yMax: 3 },
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
            title: () => 'POBÓR MOCY CHWILOWEJ (kW)',
            options: { showZero: true },
            datasets: [
                { k: 'estimated_power_kw', l: 'Moc estymowana', c: '#10b981', s: true, p: 2 }
            ]
        }
    ],

    DAILY_CONFIG: [
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
            title: () => `ENERGIA POBRANA - PRĄD (kWh)`,
            stacked: true,
            datasets: [
                { k: 'kwh_consumed_heating', l: 'Ogrzewanie (prąd)', c: '#60a5fa', t: 'bar', p: 1 },
                { k: 'kwh_consumed_cwu', l: 'CWU (prąd)', c: '#f472b6', t: 'bar', p: 1 }
            ]
        },
        {
            id: 'c-daily-cop',
            title: () => `SPRAWNOŚĆ (COP) VS TEMP. ZEWNĘTRZNA`,
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
        if (s.last.temp_lux == 1) return 'GRZANIE CWU - TYMCZASOWY LUKSUS';
        if (state.isCWU) return 'GRZANIE CWU';
        if (state.isCO) return 'GRZANIE CO';

        return 'OK';
    },

    getStatusClass(s) {
        const state = app.getWorkState(s.last, s.prevLast);

        if (state.isDefrost) return 'text-yellow-500 font-black';
        if (s.last.temp_lux == 1 || state.isCWU) return 'text-red-500 font-black';
        if (state.isCO) return 'text-blue-600 font-black';

        return 'text-slate-500';
    }
};