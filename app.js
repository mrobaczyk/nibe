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

    const prev = rawData[Math.max(0, rawData.length - 12)] || rawData[0];
    const dayAgo = new Date(last.timestamp + " UTC").getTime() - (24 * 60 * 60 * 1000);
    const d24 = rawData.filter(d => new Date(d.timestamp + " UTC").getTime() >= dayAgo);
    const first24 = d24.length > 0 ? d24[0] : last;
    
    const diffTotal = Number(last.op_time_total) - Number(first24.op_time_total);
    const diffCWU = Number(last.op_time_hotwater) - Number(first24.op_time_hotwater);

    const stats = {
        starts24: last.starts - first24.starts,
        
        ratio: last.starts > 0 
            ? (last.op_time_total / last.starts).toFixed(1) 
            : 0,

        work24: (last.op_time_total - first24.op_time_total).toFixed(1),
        
        cwuPercent: last.op_time_total > 0 
            ? Math.round((last.op_time_hotwater / last.op_time_total) * 100) 
            : 0,

        kwh_heating24: last.kwh_heating - first24.kwh_heating,
        kwh_cwu24: last.kwh_cwu - first24.kwh_cwu,
        
        dataCount24: d24.length,
        totalCount: rawData.length
    };

    const updateInfo = document.getElementById('update-info');
    if (updateInfo) {
        updateInfo.innerHTML = `
            OSTATNI ODCZYT: <span class="text-white">${last.timestamp}</span> | 
            ŁĄCZNIE: <span class="text-white">${stats.totalCount}</span> 
            (<span class="text-emerald-400">+${stats.dataCount24}</span> W 24H)
        `;
    }

    document.getElementById('kpi-expert').innerHTML = CONFIG.getKPIs(last, stats).map(k => `
        <div class="kpi-card border border-slate-800 shadow-sm bg-slate-900/50 p-3 rounded">
            <div class="text-[10px] uppercase font-black text-slate-500 mb-1 tracking-wider">${k.t}</div>
            <div class="text-xl font-mono font-black ${k.c}">${k.v}</div>
            <div class="text-[10px] text-slate-400 font-bold leading-tight mt-1">${k.u}</div>
        </div>
    `).join('');

    const trendsContainer = document.getElementById('kpi-trends');
    if (trendsContainer) {
        trendsContainer.innerHTML = CONFIG.getTrendKPIs(last, prev, getTrendIcon).map(k => `
            <div class="kpi-card border border-slate-800 bg-slate-900/30 p-2 rounded">
                <div class="text-[9px] uppercase text-slate-500 font-bold">${k.t}</div>
                <div class="text-md font-mono font-black ${k.c} flex items-center">${k.v}</div>
            </div>
        `).join('');
    }

    CONFIG.CHART_CONFIG.forEach(cfg => {
        const datasets = cfg.datasets.map(ds => {
            let data;
            if (typeof ds.d === 'function') {
                data = chartMgr.mapData(filtered, (item) => ds.d(key => item[key]), ds.s !== false);
            } else {
                data = chartMgr.mapData(filtered, ds.k, ds.s !== false);
            }
            return { l: ds.l, d: data, c: ds.c, h: ds.h, s: ds.s };
        });
        chartMgr.draw(cfg.id, cfg.title(last), datasets, { hrs, ...(cfg.options || {}) });
    });
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