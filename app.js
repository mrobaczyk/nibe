import { CONFIG } from './config.js';
import { ChartManager } from './charts.js';

const chartMgr = new ChartManager();
let rawData = [];
let currentDailyData = []; // Przeniesione tutaj, by było dostępne dla loadDaily
let currentHrs = 6;
let dailyChartsInitialized = false; 

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

function aggregateByMonth(dailyData) {
    const months = {};
    dailyData.forEach(d => {
        const month = d.date.substring(0, 7);
        if (!months[month]) {
            months[month] = { date: month, starts: 0, work_hours: 0, kwh_total: 0, kwh_cwu: 0 };
        }
        months[month].starts += d.starts;
        months[month].work_hours += d.work_hours;
        months[month].kwh_total += d.kwh_total;
        months[month].kwh_cwu += d.kwh_cwu;
    });

    return Object.values(months).map(m => ({
        ...m,
        work_hours: Number(m.work_hours.toFixed(1)),
        kwh_total: Number(m.kwh_total.toFixed(1)),
        kwh_cwu: Number(m.kwh_cwu.toFixed(1))
    }));
}

// POPRAWIONA FUNKCJA loadDaily
async function loadDaily(mode = 'daily') {
    try {
        if (currentDailyData.length === 0) {
            const r = await fetch('daily_stats.json?nocache=' + Date.now());
            currentDailyData = await r.json();
        }

        const dataToRender = mode === 'monthly' ? aggregateByMonth(currentDailyData) : currentDailyData;

        CONFIG.DAILY_CONFIG.forEach(cfg => {
            const datasets = cfg.datasets.map(ds => ({
                l: ds.l,
                d: dataToRender.map(d => ({
                    x: d.date, 
                    y: typeof ds.k === 'function' ? ds.k(d) : d[ds.k]
                })),
                c: ds.c
            }));

            chartMgr.draw(cfg.id, cfg.title, datasets, { 
                type: 'bar', 
                stacked: cfg.stacked 
            });
        });
    } catch (e) { console.error("Błąd daily:", e); }
}

function updateDashboard(hrs) {
    currentHrs = hrs;
    if (!rawData.length) return;

    const last = rawData[rawData.length - 1];
    
    const lastDate = new Date(last.timestamp + " UTC");
    const localTime = lastDate.toLocaleString('pl-PL');
    const lastTs = lastDate.getTime();

	const startDate = new Date("2025-12-28T00:00:00Z");
	const daysSinceStart = Math.max(1, Math.floor((lastDate - startDate) / (1000 * 60 * 60 * 24)));

    const filtered = rawData.filter(d => 
        new Date(d.timestamp + " UTC").getTime() >= (lastTs - (hrs * 60 * 60 * 1000))
    );

    const prev = rawData[Math.max(0, rawData.length - 3)] || rawData[0];
    const dayAgo = lastTs - (24 * 60 * 60 * 1000);
    const d24 = rawData.filter(d => new Date(d.timestamp + " UTC").getTime() >= dayAgo);
    const first24 = d24.length > 0 ? d24[0] : last;

    const now = new Date();
    const diffMs = now - lastDate;
    const isLive = diffMs < (15 * 60 * 1000);
    
    const statusIcon = isLive 
        ? '<span class="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full mr-2 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse"></span>'
        : '<span class="inline-block w-2.5 h-2.5 bg-slate-600 rounded-full mr-2"></span>';
    
    const stats = {
        starts24: last.starts - first24.starts,
        ratio: last.starts > 0 ? (last.op_time_total / last.starts).toFixed(2) : 0,
        work24: (last.op_time_total - first24.op_time_total).toFixed(0),
        cwuPercent: last.op_time_total > 0 ? ((last.op_time_hotwater / last.op_time_total) * 100).toFixed(1) : 0,
        kwh_heating24: last.kwh_heating - first24.kwh_heating,
        kwh_cwu24: last.kwh_cwu - first24.kwh_cwu,
        dataCount24: d24.length,
        totalCount: rawData.length,
		avgStarts: (last.starts / daysSinceStart).toFixed(1),
		avgWork: (last.op_time_total / daysSinceStart).toFixed(1),
		avgKwh: (last.kwh_heating / daysSinceStart).toFixed(1),
		daysTotal: daysSinceStart
    };

	const updateInfo = document.getElementById('update-info');
	if (updateInfo) {
		const labelClass = isLive ? 'text-slate-400' : 'text-red-500 font-black uppercase';
		const timeClass = isLive ? 'text-white' : 'text-red-400';
	
		updateInfo.innerHTML = `
			<div class="flex flex-col gap-0.5">
				<div class="flex items-center gap-2">
					<div class="leading-none whitespace-nowrap">
						<span class="${labelClass}">OSTATNI ODCZYT:</span> 
						<span class="${timeClass} font-mono">${localTime}</span>
					</div>
					<div class="flex-shrink-0 h-3 w-3 flex items-center justify-center">
						${statusIcon}
					</div>
				</div>
	
				<div class="text-[9px] text-slate-500 leading-tight uppercase tracking-tight">
					DANE: <span class="text-slate-300">${stats.totalCount}</span> 
					<span class="mx-1 opacity-30">|</span> 
					24h: <span class="text-emerald-500">+${stats.dataCount24}</span>
				</div>
			</div>
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

document.getElementById('view-selector').onclick = (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    document.querySelectorAll('#view-selector button').forEach(b => b.classList.remove('active-btn'));
    btn.classList.add('active-btn');
    
    const view = btn.dataset.view;
    document.getElementById('live-view').classList.toggle('hidden', view !== 'live');
    document.getElementById('stats-view').classList.toggle('hidden', view !== 'stats');
    document.getElementById('filter-group').classList.toggle('hidden', view !== 'live');

    if (view === 'stats' && !dailyChartsInitialized) {
        loadDaily();
        dailyChartsInitialized = true;
    }
};

document.getElementById('filter-group').onclick = (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    document.querySelectorAll('#filter-group button').forEach(b => b.classList.remove('active-btn'));
    btn.classList.add('active-btn');
    updateDashboard(parseInt(btn.dataset.hrs));
};

document.getElementById('aggregation-selector').onclick = (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    document.querySelectorAll('#aggregation-selector button').forEach(b => {
        b.classList.remove('active-btn');
        b.classList.add('text-slate-500');
    });
    btn.classList.add('active-btn');
    btn.classList.remove('text-slate-500');
    
    loadDaily(btn.dataset.type);
};

load();
setInterval(load, CONFIG.refreshInterval);