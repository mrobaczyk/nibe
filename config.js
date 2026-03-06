export const CONFIG = {
    refreshInterval: 300000,
    cwuNames: { 0: "Oszczędny", 1: "Normalny", 2: "Luksusowy" },
    
    getKPIs: (last, stats) => {
        const totalKwh = (last.kwh_heating + last.kwh_cwu).toFixed(1);
        const diffKwh = (Number(stats.kwh_heating24) + Number(stats.kwh_cwu24)).toFixed(1);
        const kwhCwuPercent = totalKwh > 0 ? ((last.kwh_cwu / (last.kwh_heating + last.kwh_cwu)) * 100).toFixed(1) : 0;

        return [
            {
                t: 'Starty', 
                v: last.starts, 
                u: `W ciągu 24h: +${stats.starts24}<br>${stats.ratio} h/start`, 
                c: 'text-blue-400'
            },
            {
                t: 'Czas pracy (CWU)', 
                v: `${last.op_time_total}h (${last.op_time_hotwater}h)`, 
                u: `W ciągu 24h: +${stats.work24}h<br>${stats.cwuPercent}% CWU`, 
                c: 'text-emerald-400'
            },
            { 
                t: 'Zużycie Energii', 
                v: `${totalKwh} <span class="text-xs text-slate-500">kWh</span>`, 
                c: 'text-yellow-400', 
                u: `W ciągu 24h: +${diffKwh} kWh<br>${kwhCwuPercent}% CWU` 
            },
            {
                t: 'Tryb CWU', 
                v: CONFIG.cwuNames[last.current_hot_water_mode] || "Normalny", 
                u: `Góra (BT7): ${last.cwu_upper || '--'}°<br>Ładow. (BT6): ${last.cwu_load || '--'}°`, 
                c: 'text-pink-400'
            },
            {
                t: 'Krzywa / Przesunięcie', 
                v: `${last.heat_curve || 0} / ${last.heat_offset || 0}`, 
                u: 'parametry grzania', 
                c: 'text-yellow-400'
            },
            { 
                t: 'Statusy', 
                v: last.defrosting == 1 ? 'DEFROST' : (last.temp_lux == 1 ? 'LUKSUS' : 'OK'), 
                c: last.defrosting == 1 ? 'text-red-500 font-black' : (last.temp_lux == 1 ? 'text-blue-400 font-black' : 'text-slate-600'),
                u: 'Tryb pracy' 
            }
        ];
    },

    getTrendKPIs: (last, prev, getTrendIcon) => [
        { t: 'Trend Zewn.', v: last.outdoor + '°C' + getTrendIcon(last.outdoor, prev.outdoor), c: 'text-blue-400' },
        { t: 'Trend CWU', v: last.cwu_upper + '°C' + getTrendIcon(last.cwu_upper, prev.cwu_upper), c: 'text-pink-500' },
        { t: 'Trend GM', v: last.degree_minutes + getTrendIcon(last.degree_minutes, prev.degree_minutes), c: 'text-yellow-400' },
        { t: 'Sprężarka', v: last.compressor_hz + ' Hz', c: 'text-emerald-400' }
    ],

    CHART_CONFIG: [
        {
            id: 'c-temp',
            title: (last) => `TEMPERATURA ZEWNĘTRZNA (CZAS OBLICZANIA: ${last.filter_time || '--'}h)`,
            datasets: [
                { k: 'outdoor', l: 'Chwilowa', c: '#3b82f6', s: false },
                { k: 'outdoor_avg', l: 'Średnia', c: '#93c5fd', s: false }
            ]
        },
        {
            id: 'c-cwu',
            title: () => 'TEMPERATURA CWU',
            datasets: [
                { k: 'cwu_upper', l: 'Góra BT7', c: '#ec4899', s: false },
                { k: 'cwu_load', l: 'Ładowanie BT6', c: '#fb7185', s: false }
            ]
        },
        {
            id: 'c-flow',
            title: () => 'ZASILANIE / OBLICZONA / POWRÓT (°C)',
            datasets: [
                { k: 'calc_flow', l: 'Obliczona', c: '#eab308', s: true }, 
                { k: 'bt25_temp', l: 'Zewn. rurociąg zasilający (B25)', c: '#f87171', s: false },
                { k: 'room_temperature', l: 'Temp. pomieszczenia (BT50)', c: '#10b981', s: false },
                { k: 'supply_line', l: 'Zasilanie (BT2)', c: '#ef4444', s: false, h: true },
                { k: 'return_line', l: 'Powrót (BT3)', c: '#3b82f6', s: false, h: true },
                { k: 'supply_line_eb101', l: 'Rurociąg zasilający (EB101-BT12)', c: '#f97316', s: false, h: true },
                { k: 'return_line_eb101', l: 'Rurociąg powrotny (EB101-BT3)', c: '#6366f1', s: false, h: true },
                { k: 'liquid_line', l: 'Rura cieczowa (EB101-BT15)', c: '#a855f7', s: false, h: true }
            ]
        },
        {
            id: 'c-energy',
            title: () => 'ZUŻYCIE ENERGII (kWh)',
            datasets: [
                { k: 'kwh_heating', l: 'Ogrzewanie', c: '#eab308', s: false },
                { k: 'kwh_cwu', l: 'CWU', c: '#ec4899', s: false }
            ]
        },
        {
            id: 'c-cwu-mode',
            title: () => 'TRYB PRACY CWU (0:OSZCZ, 1:NORM, 2:LUKS)',
            options: { yMin: -1, yMax: 3 },
            datasets: [{ k: 'current_hot_water_mode', l: 'Tryb CWU', c: '#ec4899', s: true }]
        },
        {
            id: 'c-curve',
            title: () => 'USTAWIENIA: KRZYWA I PRZESUNIĘCIE',
            options: { yMin: -10, yMax: 15 },
            datasets: [
                { k: 'heat_curve', l: 'Krzywa', c: '#fbbf24', s: true },
                { k: 'heat_offset', l: 'Przesunięcie', c: '#f87171', s: true }
            ]
        },
        {
            id: 'c-gm',
            title: () => 'STOPNIOMINUTY (GM)',
            options: { showZero: true },
            datasets: [
                { k: 'degree_minutes', l: 'GM', c: '#facc15', s: true },
                { k: 'start_gm_level', l: 'Start', c: '#ef4444', s: true }
            ]
        },
        {
            id: 'c-hz',
            title: () => 'SPRĘŻARKA I POMPA GP1',
            datasets: [
                { k: 'compressor_hz', l: 'Sprężarka (Hz)', c: '#10b981', s: true }, 
                { k: 'pump_speed', l: 'Pompa GP1 (%)', c: '#6366f1', s: true }
            ]
        },
        {
            id: 'c-stats',
            title: () => 'LICZBA STARTÓW I CZAS PRACY',
            datasets: [
                { k: 'starts', l: 'Starty', c: '#3b82f6', s: true }, 
                { k: 'op_time_total', l: 'Czas pracy (h)', c: '#10b981', s: true }
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
    ]
};