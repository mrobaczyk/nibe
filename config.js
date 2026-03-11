export const CONFIG = {
    refreshInterval: 300000,
    cwuNames: { 0: "Oszczędny", 1: "Normalny", 2: "Luksusowy" },

    getKPIs: (last, stats) => {
        const totalKwh = (Number(last.kwh_heating) + Number(last.kwh_cwu)).toFixed(0);
        const cwuFixed = Number(last.kwh_cwu).toFixed(0);
        const kwhCwuPercent = totalKwh > 0 ? ((last.kwh_cwu / (Number(last.kwh_heating) + Number(last.kwh_cwu))) * 100).toFixed(1) : 0;

        return [
            {
                t: 'Starty',
                v: last.starts,
                u: `Śr: ${stats.avgStarts}/d<br>${stats.rangeLabel}: +${stats.diffStarts}<br>${stats.ratio} h/start`,
                c: 'text-blue-400'
            },
            {
                t: 'Czas pracy (h)',
                v: `${last.op_time_total}`,
                u: `Śr: ${stats.avgWork}/d<br>${stats.rangeLabel}: +${stats.diffWork}<br>CWU: ${last.op_time_hotwater} (${stats.cwuPercent}%)`,
                c: 'text-emerald-400'
            },
            {
                t: 'Zużycie energii (kWh)',
                v: `${totalKwh}`,
                c: 'text-yellow-400',
                u: `Śr: ${stats.avgKwh}/d<br>${stats.rangeLabel}: +${stats.diffKwh}<br>CWU: ${cwuFixed} (${kwhCwuPercent}%)`
            },
            {
                t: 'Tryb CWU',
                v: CONFIG.cwuNames[last.current_hot_water_mode] || "Normalny",
                u: `Góra (BT7): ${last.cwu_upper || '--'}°C<br>Dół (BT6): ${last.cwu_load || '--'}°C`,
                c: 'text-pink-400'
            },
            {
                t: 'Krzywa / Przesunięcie',
                v: `${last.heat_curve || 0} / ${last.heat_offset || 0}`,
                u: '',
                c: 'text-yellow-400'
            },
            {
                t: 'Statusy',
                v: last.defrosting == 1 ? 'DEFROST' : (last.temp_lux == 1 ? 'LUKSUS' : 'OK'),
                c: last.defrosting == 1 ? 'text-red-500 font-black' : (last.temp_lux == 1 ? 'text-blue-400 font-black' : 'text-slate-500'),
                u: ''
            }
        ];
    },

    getTrendKPIs: (last, prev, getTrendIcon) => [
        { t: 'Trend Zewn.', v: last.outdoor + '°C' + getTrendIcon(last.outdoor, prev.outdoor), c: 'text-blue-400' },
        { t: 'Trend CWU', v: last.cwu_upper + '°C' + getTrendIcon(last.cwu_upper, prev.cwu_upper), c: 'text-pink-500' },
        { t: 'Trend SM', v: last.degree_minutes + getTrendIcon(last.degree_minutes, prev.degree_minutes), c: 'text-yellow-400' },
        { t: 'Sprężarka', v: last.compressor_hz + ' Hz' + getTrendIcon(last.compressor_hz, prev.compressor_hz), c: 'text-emerald-400' }
    ],

    CHART_CONFIG: [
        {
            id: 'c-temp',
            title: (last) => `TEMP. ZEW. (°C) (CZAS OBLICZANIA: ${last.filter_time || '--'}h)`,
            datasets: [
                { k: 'outdoor', l: 'Chwilowa', c: '#3b82f6', s: false },
                { k: 'outdoor_avg', l: 'Średnia', c: '#93c5fd', s: false }
            ]
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
            id: 'c-energy',
            title: () => 'ZUŻYCIE ENERGII (kWh)',
            datasets: [
                {
                    l: 'Łącznie',
                    d: (m) => m('kwh_heating') + m('kwh_cwu'),
                    c: '#3b82f6',
                    s: false,
                    h: false
                },
                { k: 'kwh_heating', l: 'Ogrzewanie', c: '#eab308', s: false, h: true },
                { k: 'kwh_cwu', l: 'CWU', c: '#ec4899', s: false, h: true }
            ]
        },
        {
            id: 'c-cwu-mode',
            title: () => 'TRYB PRACY CWU',
            options: { yMin: -1, yMax: 3 },
            datasets: [{ k: 'current_hot_water_mode', l: 'Tryb CWU', c: '#ec4899', s: true }]
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
        }
    ],

    DAILY_CONFIG: [
        {
            id: 'c-daily-energy',
            title: 'Zużycie Energii (kWh)',
            stacked: true,
            datasets: [
                { l: 'Ogrzewanie', k: (d) => (d.kwh_total - d.kwh_cwu).toFixed(1), c: '#3b82f6' },
                { l: 'CWU', k: (d) => d.kwh_cwu.toFixed(1), c: '#ec4899' }
            ]
        },
        {
            id: 'c-daily-starts',
            title: 'Starty sprężarki',
            datasets: [
                { l: 'Starty', k: 'starts', c: '#10b981' }
            ]
        },
        {
            id: 'c-daily-work',
            title: 'Czas pracy (h)',
            datasets: [
                { l: 'Godziny', k: 'work_hours', c: '#f59e0b' }
            ]
        }
    ]
};