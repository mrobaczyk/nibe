import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';

const chartMgr = new ChartManager();
let rawData = [];
let currentHrs = 6;

function getTrendIcon(current, previous) {
    const diff = current - previous;
    if (diff > 0.1) return '<span class="text-red-500 ml-1">↑</span>';
    if (diff < -0.1) return '<span class="text-blue-500 ml-1">↓</span>';
    return '<span class="text-slate-600 ml-1">→</span>';
}

async function load() {
    try {
        const r = await fetch('data.json?nocache=' + Date.now());
        rawData = await r.json();
        updateDashboard(currentHrs);
    } catch (e) { console.error("Błąd ładowania:", e); }
}

function updateDashboard(hrs) {
    currentHrs = hrs;
    if (!rawData.length) return;

    const last = rawData[rawData.length - 1];
    const filtered = rawData.filter(d => 
        new Date(d.timestamp + " UTC").getTime() >= 
        (new Date(last.timestamp + " UTC").getTime() - (hrs * 60 * 60 * 1000))
    );

    // Porównanie z punktem sprzed ok. 30 minut dla trendu
    const prev = rawData[Math.max(0, rawData.length - 12)] || rawData[0];

    const dayAgo = new Date(last.timestamp + " UTC").getTime() - (24 * 60 * 60 * 1000);
    const d24 = rawData.filter(d => new Date(d.timestamp + " UTC").getTime() >= dayAgo);
    const first24 = d24[0] || last;
    
    const stats = {
        starts24: last.starts - first24.starts,
        work24: (last.op_time_total - first24.op_time_total).toFixed(1),
        ratio: last.starts > 0 ? (last.op_time_total / last.starts).toFixed(2) : 0,
        cwuPercent: last.op_time_total > 0 ? ((last.op_time_hotwater / last.op_time_total) * 100).toFixed(1) : 0,
        dataCount24: d24.length
    };

    document.getElementById('update-info').innerHTML = 
        `OSTATNI ODCZYT: ${new Date(last.timestamp + " UTC").toLocaleString('pl-PL')}<br>` +
        `ODCZYTY 24H: ${stats.dataCount24}`;

    // RZĄD 1: ORYGINALNE KAFELKI
    const generalKpis = CONFIG.getKPIs(last, stats);
    document.getElementById('kpi-expert').innerHTML = generalKpis.map(k => `
        <div class="kpi-card border border-slate-800 shadow-sm bg-slate-900/50 p-3 rounded">
            <div class="text-[10px] uppercase font-black text-slate-500 mb-1 tracking-wider">${k.t}</div>
            <div class="text-xl font-mono font-black ${k.c}">${k.v}</div>
            <div class="text-[10px] text-slate-400 font-bold leading-tight">${k.u}</div>
        </div>
    `).join('');

    // RZĄD 2: TRENDY
    const trendKpis = [
        { t: 'Trend Zewn.', v: last.outdoor + '°C' + getTrendIcon(last.outdoor, prev.outdoor), c: 'text-blue-400' },
        { t: 'Trend CWU', v: last.cwu_upper + '°C' + getTrendIcon(last.cwu_upper, prev.cwu_upper), c: 'text-pink-500' },
        { t: 'Trend GM', v: last.degree_minutes + getTrendIcon(last.degree_minutes, prev.degree_minutes), c: 'text-yellow-400' },
        { t: 'Sprężarka', v: last.compressor_hz + ' Hz', c: 'text-emerald-400' }
    ];

    const trendsContainer = document.getElementById('kpi-trends');
    if (trendsContainer) {
        trendsContainer.innerHTML = trendKpis.map(k => `
            <div class="kpi-card border border-slate-800 bg-slate-900/30 p-2 rounded">
                <div class="text-[9px] uppercase text-slate-500 font-bold">${k.t}</div>
                <div class="text-md font-mono font-black ${k.c} flex items-center">${k.v}</div>
            </div>
        `).join('');
    }

    const m = (key, stepped = true) => chartMgr.mapData(filtered, key, stepped);
    const opt = (extra = {}) => ({ hrs, ...extra });

    // WYKRESY
    chartMgr.draw('c-temp', `TEMPERATURA ZEWNĘTRZNA (CZAS OBLICZANIA: ${last.filter_time || '--'}h)`, [
        {l:'Chwilowa', d: m('outdoor', false), c:'#3b82f6'}, 
        {l:'Średnia', d: m('outdoor_avg', false), c:'#93c5fd'}
    ], opt({ isStepped: false }));

    chartMgr.draw('c-cwu', 'TEMPERATURA CWU', [
        {l:'Góra BT7', d: m('cwu_upper', false), c:'#ec4899'}, 
        {l:'Ładowanie BT6', d: m('cwu_load', false), c:'#fb7185'}
    ], opt({ isStepped: false }));

    chartMgr.draw('c-flow', 'ZASILANIE / OBLICZONA (°C)', [
        {l:'Obliczona', d: m('calc_flow', false), c:'#eab308'}, 
        {l:'BT25 Zewn.', d: m('bt25_temp', false), c:'#f87171'}
    ], opt({ isStepped: false }));

    chartMgr.draw('c-cwu-mode', 'TRYB PRACY CWU (0:OSZCZ, 1:NORM, 2:LUKS)', [
        {l:'Tryb CWU', d: m('current_hot_water_mode'), c:'#ec4899'}
    ], opt({ yMin: -1, yMax: 3 }));

    chartMgr.draw('c-curve', 'USTAWIENIA: KRZYWA I PRZESUNIĘCIE', [
        {l:'Krzywa', d: m('heat_curve'), c:'#fbbf24'}, 
        {l:'Przesunięcie', d: m('heat_offset'), c:'#f87171'}
    ], opt({ yMin: -10, yMax: 15 }));

    chartMgr.draw('c-gm', 'STOPNIOMINUTY (GM)', [
        {l:'GM', d: m('degree_minutes'), c:'#facc15'}, 
        {l:'Start', d: m('start_gm_level'), c:'#ef4444'}
    ], opt({ showZero: true }));

    chartMgr.draw('c-hz', 'SPRĘŻARKA I POMPA GP1', [
        {l:'Sprężarka (Hz)', d: m('compressor_hz'), c:'#10b981'}, 
        {l:'Pompa GP1 (%)', d: m('pump_speed'), c:'#6366f1'}
    ], opt());

    chartMgr.draw('c-stats', 'LICZBA STARTÓW I CZAS PRACY', [
        {l:'Starty', d: m('starts'), c:'#3b82f6'}, 
        {l:'Czas pracy (h)', d: m('op_time_total'), c:'#10b981'}
    ], opt());
}

document.getElementById('filter-group').onclick = (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    document.querySelectorAll('#filter-group button').forEach(b => b.classList.remove('active-btn'));
    btn.classList.add('active-btn');
    updateDashboard(parseInt(btn.dataset.hrs));
};

load();
setInterval(load, CONFIG.refreshInterval);