export const CONFIG = {
    refreshInterval: 300000, // 5 minut
    
    // Oryginalne kafelki
    getKPIs: (last, stats) => [
        { t: 'Zewnętrzna', v: last.outdoor + '°C', c: 'text-blue-400', u: 'Chwilowa' },
        { t: 'Zasilanie', v: last.bt25_temp + '°C', c: 'text-orange-400', u: 'BT25' },
        { t: 'CWU Góra', v: last.cwu_upper + '°C', c: 'text-pink-500', u: 'BT7' },
        { t: 'Stopniominuty', v: last.degree_minutes, c: 'text-yellow-400', u: 'GM' },
        { t: 'Sprężarka', v: last.compressor_hz + ' Hz', c: 'text-emerald-400', u: 'Praca' },
        { t: 'Starty 24h', v: stats.starts24, c: 'text-slate-300', u: 'Liczba' }
    ],

    // Nowe kafelki trendów
    getTrendKPIs: (last, prev, getTrendIcon) => [
        { t: 'Trend Zewn.', v: last.outdoor + '°C' + getTrendIcon(last.outdoor, prev.outdoor), c: 'text-blue-400' },
        { t: 'Trend CWU', v: last.cwu_upper + '°C' + getTrendIcon(last.cwu_upper, prev.cwu_upper), c: 'text-pink-500' },
        { t: 'Trend GM', v: last.degree_minutes + getTrendIcon(last.degree_minutes, prev.degree_minutes), c: 'text-yellow-400' },
        { t: 'Sprężarka', v: last.compressor_hz + ' Hz', c: 'text-emerald-400' }
    ],

    // Konfiguracja wszystkich wykresów
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
            id: 'c-cwu-mode',
            title: () => 'TRYB PRACY CWU (0:OSZCZ, 1:NORM, 2:LUKS)',
            options: { yMin: -1, yMax: 3 },
            datasets: [{ k: 'current_hot_water_mode', l: 'Tryb CWU', c: '#ec4899' }]
        },
        {
            id: 'c-curve',
            title: () => 'USTAWIENIA: KRZYWA I PRZESUNIĘCIE',
            options: { yMin: -10, yMax: 15 },
            datasets: [
                { k: 'heat_curve', l: 'Krzywa', c: '#fbbf24' },
                { k: 'heat_offset', l: 'Przesunięcie', c: '#f87171' }
            ]
        },
        {
            id: 'c-gm',
            title: () => 'STOPNIOMINUTY (GM)',
            options: { showZero: true },
            datasets: [
                { k: 'degree_minutes', l: 'GM', c: '#facc15' },
                { k: 'start_gm_level', l: 'Start', c: '#ef4444' }
            ]
        },
        {
            id: 'c-hz',
            title: () => 'SPRĘŻARKA I POMPA GP1',
            datasets: [
                { k: 'compressor_hz', l: 'Sprężarka (Hz)', c: '#10b981' },
                { k: 'pump_speed', l: 'Pompa GP1 (%)', c: '#6366f1' }
            ]
        },
        {
            id: 'c-stats',
            title: () => 'LICZBA STARTÓW I CZAS PRACY',
            datasets: [
                { k: 'starts', l: 'Starty', c: '#3b82f6' },
                { k: 'op_time_total', l: 'Czas pracy (h)', c: '#10b981' }
            ]
        }
    ]
};