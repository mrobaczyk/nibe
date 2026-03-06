export const CONFIG = {
    cwuNames: { 0: "Oszczędny", 1: "Normalny", 2: "Luksus" },
    refreshInterval: 300000,
    
    getKPIs: (last, stats) => [
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
            t: 'Defrost', 
            v: last.defrosting == 1 ? 'AKTYWNY' : 'NIE', 
            u: '', 
            c: last.defrosting == 1 ? 'text-red-500 font-black' : 'text-slate-600'
        },
        {
            t: 'Tymczasowy luksus', 
            v: last.temp_lux == 1 ? 'ON' : 'OFF', 
            u: '', 
            c: last.temp_lux == 1 ? 'text-blue-400 font-black' : 'text-slate-600'
        }
    ]
};