import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';

const chartMgr = new ChartManager();
let rawData = [];
let currentHrs = 6;

async function load() {
    try {
        const r = await fetch('data.json?nocache=' + Date.now());
        rawData = await r.json();
        updateDashboard(currentHrs);
    } catch (e) { console.error("B³¹d ³adowania:", e); }
}

function updateDashboard(hrs) {
    currentHrs = hrs;
    if (!rawData.length) return;

    const lastDataPoint = rawData[rawData.length - 1];
    const filtered = rawData.filter(d => 
        new Date(d.timestamp + " UTC").getTime() >= 
        (new Date(lastDataPoint.timestamp + " UTC").getTime() - (hrs * 60 * 60 * 1000))
    );
    const last = filtered[filtered.length - 1];

    // Obliczenia statystyk
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

    // Header i KPI
    document.getElementById('update-info').innerHTML = 
        `OSTATNI ODCZYT: ${new Date(last.timestamp + " UTC").toLocaleString('pl-PL')}<br>` +
        `ODCZYTY 24H: ${stats.dataCount24}`;

    const kpis = CONFIG.getKPIs(last, stats);
    document.getElementById('kpi-expert').innerHTML = kpis.map(k => `
        <div class="kpi-card border border-slate-800 shadow-sm">
            <div class="text-[10px] uppercase font-black text-slate-500 mb-1 tracking-wider">${k.t}</div>
            <div class="text-lg font-mono font-black ${k.c}">${k.v}</div>
            <div class="text-[10px] text-slate-400 font-bold">${k.u}</div>
        </div>
    `).join('');

    // Rysowanie wykresów
    const m = (key, changes) => chartMgr.mapData(filtered, key, changes);
    const opt = (extra = {}) => ({ hrs, ...extra });

    chartMgr.draw('c-temp', `ZEWNÊTRZNA (Cel: ${last.filter_time || '--'}h)`, [
        {l:'Chwilowa', d: m('outdoor'), c:'#3b82f6'}, 
        {l:'Œrednia', d: m('outdoor_avg'), c:'#93c5fd'}
    ], opt());

    chartMgr.draw('c-cwu', 'CIEP£A WODA (°C)', [
        {l:'Góra BT7', d: m('cwu_upper'), c:'#ec4899'}, 
        {l:'£adowanie BT6', d: m('cwu_load'), c:'#fb7185'}
    ], opt());

    chartMgr.draw('c-curve', 'USTAWIENIA: KRZYWA I PRZESUNIÊCIE', [
        {l:'Krzywa', d: m('heat_curve', true), c:'#fbbf24'}, 
        {l:'Przesuniêcie', d: m('heat_offset', true), c:'#f87171'}
    ], opt({ yMin: -10, yMax: 15, isStepped: true }));

    chartMgr.draw('c-flow', 'ZASILANIE / OBLICZONA (°C)', [
        {l:'Obliczona', d: m('calc_flow'), c:'#eab308'}, 
        {l:'BT25 Zewn.', d: m('bt25_temp'), c:'#f87171'}
    ], opt());

    chartMgr.draw('c-gm', 'STOPNIOMINUTY (GM)', [
        {l:'GM', d: m('degree_minutes'), c:'#facc15', fill:true}, 
        {l:'Start', d: m('start_gm_level', true), c:'#ef4444'}
    ], opt({ showZero: true, isStepped: true }));

    chartMgr.draw('c-hz', 'SPRÊ¯ARKA I POMPA GP1', [
        {l:'Sprê¿arka (Hz)', d: m('compressor_hz'), c:'#10b981'}, 
        {l:'Pompa GP1 (%)', d: m('pump_speed'), c:'#6366f1'}
    ], opt());

    chartMgr.draw('c-stats', 'LICZBA STARTÓW I CZAS PRACY', [
        {l:'Starty', d: m('starts', true), c:'#3b82f6'}, 
        {l:'Czas pracy (h)', d: m('op_time_total'), c:'#10b981'}
    ], opt({ isStepped: true }));
}

// Obs³uga filtrów
document.getElementById('filter-group').onclick = (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    document.querySelectorAll('#filter-group button').forEach(b => b.classList.remove('active-btn'));
    btn.classList.add('active-btn');
    updateDashboard(parseInt(btn.dataset.hrs));
};

load();
setInterval(load, CONFIG.refreshInterval);