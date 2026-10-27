/** @type {import('tailwindcss').Config} */
module.exports = {
    // Skanujemy źródła frontendu. Klasy składane w locie (np. hover:bg-${color}-600)
    // są niewidzialne dla skanera - kompletuje je safelist poniżej.
    content: [
        'index.html',
        'web/**/*.js'
    ],
    safelist: [
        // ChartComponent._btn: hover:bg-${color}-600 dla color w {emerald, slate, blue}
        'hover:bg-emerald-600',
        'hover:bg-slate-600',
        'hover:bg-blue-600',
        // KpiComponent: stan karty i przycisków zależny od preferencji/dostępności
        'opacity-50',
        'grayscale',
        'cursor-pointer',
        'cursor-not-allowed',
        'pointer-events-none',
        'pr-8',
        // NavigationComponent.filterBtn: stan aktywnego filtra
        'bg-blue-600',
        'shadow-blue-900/20',
        'text-slate-400',
        'text-slate-200',
        'text-white',
        'hover:bg-slate-800',
        // NavigationComponent.dateNavigator: kolor etykiety zależny od isLatest
        'text-emerald-500',
        'text-blue-400',
        // templateManager.statusInfo: kolor kropki i daty zależny od isOnline
        'bg-emerald-500',
        { pattern: new RegExp('^shadow-\\[0_0_8px_#10b981\\]$') },
        'bg-red-500',
        'text-red-400',
        // config.getStatusClass (dynamicClass KPI Statusy)
        'text-yellow-500',
        'text-teal-500',
        'text-red-500',
        'text-blue-600',
        'font-black',
        'font-bold',
        'text-slate-500',
        // config.js KPI: healthClass i colorClass (Status Bazy Danych, Zasilanie)
        'text-red-400',
        'text-rose-500',
        'animate-pulse',
        'font-mono',
        'text-slate-400',
        'text-emerald-500',
        // config.getCycleMetrics / getDegreeMinutesStatus (stringi HTML w KPI)
        // (klasy font-mono, text-emerald-500, text-red-400 już wyżej)
        // utils.getTrendIcon
        'text-slate-600',
        'text-md',
        // Klasa pomocnicza z styles.css (fullscreen grid) - nie jest w content skanie,
        // bo występuje wyłącznie w selektorze CSS, nie w HTML/JS.
        'max-w-[1600px]'
    ],
    theme: {
        extend: {}
    },
    corePlugins: {
        // Preflight wchodzi domyślnie; styles.css nadpisuje to, co musi.
        preflight: true
    },
    plugins: []
};
