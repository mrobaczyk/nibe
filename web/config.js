export const CONFIG = {
    refreshInterval: 300000,
    startDate: new Date("2025-12-29T00:00:00Z"),
    cwuNames: { 0: "Oszczędny", 1: "Normalny", 2: "Luksusowy" },

    UI: {
        ALPHA_BAR: '80', // Przezroczystość słupków (HEX)
        ALPHA_ZONE: '33', // Przezroczystość stref tła (ok 20%)
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
        { id: 'starts', t: 'Starty', c: 'text-blue-400' },
        { id: 'op_time', t: 'Czas pracy (h)', c: 'text-emerald-400' },
        { id: 'production', t: 'Produkcja (kWh)', c: 'text-yellow-400' },
        { id: 'cwu_mode', t: 'Tryb CWU', c: 'text-pink-400' },
        { id: 'curve', t: 'Krzywa / Przesunięcie', c: 'text-yellow-400' },
        { id: 'status', t: 'Statusy' },
        { id: 'supply', t: 'Zasilanie / Obliczona (°C)', c: 'text-orange-400', targetChart: 'c-supply' },
        { id: 'power', t: 'Pobór Mocy', c: 'text-yellow-400', targetChart: 'c-power' }
    ],

    TRENDS: [
        { k: 'outdoor', t: 'Trend Zewn.', c: 'text-blue-400', unit: '°C' },
        { k: 'cwu_upper', t: 'Trend CWU', c: 'text-pink-500', unit: '°C' },
        { k: 'degree_minutes', t: 'Trend SM', c: 'text-yellow-400', unit: '' },
        { k: 'compressor_hz', t: 'Sprężarka', c: 'text-emerald-400', unit: ' Hz' }
    ],

    CHART_CONFIG: [
        {
            id: 'c-stats',
            title: () => 'LICZBA STARTÓW I TRYBY PRACY',
            datasets: [
                // TŁA (idą na początek tablicy, żeby były pod liniami)
                { l: 'Praca CO', c: 'rgba(59, 130, 246, 0.2)', t: 'bar', yAxisID: 'y-work', isZone: 'yCO' },
                { l: 'Ciepła Woda', c: 'rgba(236, 72, 153, 0.2)', t: 'bar', yAxisID: 'y-work', isZone: 'yCWU' },
                { l: 'Defrost', c: 'rgba(255, 255, 255, 0.25)', t: 'bar', yAxisID: 'y-work', isZone: 'yDefrost' },

                // LINIE
                { k: 'starts', l: 'Starty', c: '#fbbf24', s: true, h: false }, // Domyślnie widoczne
                { k: 'op_time_total', l: 'Czas pracy (h)', c: '#10b981', s: true, h: true } // Domyślnie ukryte
            ]
        },
        {
            id: 'c-energy',
            title: () => 'ENERGIA WYPRODUKOWANA (kWh)',
            datasets: [
                {
                    l: 'Łącznie',
                    d: (m) => m('kwh_produced_heating') + m('kwh_produced_cwu'),
                    c: '#3b82f6',
                    s: false,
                    h: false
                },
                { k: 'kwh_produced_heating', l: 'Ogrzewanie', c: '#eab308', s: false, h: true },
                { k: 'kwh_produced_cwu', l: 'CWU', c: '#ec4899', s: false, h: true }
            ]
        },
        {
            id: 'c-temp',
            title: (last) => `TEMP. ZEW. (°C) (CZAS OBLICZANIA: ${last.filter_time || '--'}h)`,
            datasets: [
                { k: 'outdoor', l: 'Chwilowa', c: '#3b82f6', s: false },
                { k: 'outdoor_avg', l: 'Średnia', c: '#93c5fd', s: false }
            ]
        },
        {
            id: 'c-curve',
            title: () => 'KRZYWA GRZEWCZA',
            options: { yMin: -10, yMax: 15 },
            datasets: [
                { k: 'heat_curve', l: 'Krzywa', c: '#fbbf24', s: true },
                { k: 'heat_offset', l: 'Przesunięcie', c: '#f87171', s: true }
            ]
        },
        {
            id: 'c-gm',
            title: () => 'STOPNIOMINUTY (SM)',
            options: { showZero: true },
            datasets: [
                { k: 'degree_minutes', l: 'Stopniominuty', c: '#facc15', s: false },
                { k: 'start_gm_level', l: 'Start sprężarki', c: '#ef4444', s: true }
            ]
        },
        {
            id: 'c-hz',
            title: () => 'SPRĘŻARKA',
            datasets: [
                { k: 'compressor_hz', l: 'Sprężarka (Hz)', c: '#10b981', s: true },
                { k: 'pump_speed', l: 'Pompa GP1 (%)', c: '#6366f1', s: true }
            ]
        },
        {
            id: 'c-flow',
            title: () => 'ZASILANIE / OBLICZONA (°C)',
            datasets: [
                { k: 'calc_flow', l: 'Obliczona', c: '#eab308', s: true },
                { k: 'bt25_temp', l: 'Zasilanie (BT25)', c: '#f87171', s: false },
                { k: 'room_temperature', l: 'Pokój (BT50)', c: '#10b981', s: false },
                { k: 'supply_line', l: 'BT2', c: '#ef4444', s: false, h: true },
                { k: 'return_line', l: 'BT3', c: '#3b82f6', s: false, h: true },
                { k: 'supply_line_eb101', l: 'EB101-BT12', c: '#f97316', s: false, h: true },
                { k: 'return_line_eb101', l: 'EB101-BT3', c: '#6366f1', s: false, h: true },
                { k: 'liquid_line', l: 'EB101-BT15', c: '#a855f7', s: false, h: true }
            ]
        },
        {
            id: 'c-cwu-mode',
            title: () => 'TRYB PRACY CWU',
            options: { yMin: -1, yMax: 3 },
            datasets: [{ k: 'current_hot_water_mode', l: 'Tryb CWU', c: '#ec4899', s: true }]
        },
        {
            id: 'c-cwu',
            title: () => 'TEMP. CWU (°C)',
            datasets: [
                { k: 'cwu_upper', l: 'Góra BT7', c: '#ec4899', s: false },
                { k: 'cwu_load', l: 'Ładowanie BT6', c: '#fb7185', s: false }
            ]
        },
        {
            id: 'c-live-power',
            title: () => 'POBÓR MOCY CHWILOWEJ (kW)',
            datasets: [
                { k: 'estimated_power_kw', l: 'Moc estymowana', c: '#10b981', s: true }
            ]
        },
    ],

    DAILY_CONFIG: [
        {
            id: 'c-daily-energy-prod',
            title: () => `ENERGIA WYPRODUKOWANA (kWh)`,
            stacked: true,
            datasets: [
                { k: 'kwh_produced_heating', l: 'Ogrzewanie', c: '#3b82f6', t: 'bar' },
                { k: 'kwh_produced_cwu', l: 'CWU', c: '#ec4899', t: 'bar' }
            ]
        },
        {
            id: 'c-daily-energy-cons',
            title: () => `ENERGIA POBRANA - PRĄD (kWh)`,
            stacked: true,
            datasets: [
                { k: 'kwh_consumed_heating', l: 'Ogrzewanie (prąd)', c: '#60a5fa', t: 'bar' },
                { k: 'kwh_consumed_cwu', l: 'CWU (prąd)', c: '#f472b6', t: 'bar' }
            ]
        },
        {
            id: 'c-daily-cop',
            title: () => `SPRAWNOŚĆ (COP) VS TEMP. ZEWNĘTRZNA`,
            stacked: false,
            datasets: [
                { k: 'cop_heating', l: 'COP Ogrzewanie', c: '#3b82f6', t: 'bar', yAxisID: 'y' },
                { k: 'cop_cwu', l: 'COP CWU', c: '#ec4899', t: 'bar', yAxisID: 'y' },
                { k: 'outdoor_avg', l: 'Temp. Średnia (°C)', c: '#94a3b8', t: 'line', yAxisID: 'y-temp' }
            ]
        },
        {
            id: 'c-daily-starts',
            title: () => `STARTY SPRĘŻARKI`,
            datasets: [
                { l: 'Starty', k: 'starts', c: '#10b981', t: 'bar' }
            ]
        },
        {
            id: 'c-daily-work',
            title: () => `CZAS PRACY (h)`,
            stacked: true,
            datasets: [
                { k: 'work_hours_heating', l: 'Ogrzewanie', c: 'rgba(59, 130, 246, 0.8)', t: 'bar' },
                { k: 'work_hours_cwu', l: 'CWU', c: 'rgba(236, 72, 153, 0.8)', t: 'bar' }
            ]
        }
    ]
};