// web/components/NavigationComponent.js

export const NavigationComponent = {
    /**
     * Generuje przycisk filtra czasowego (1h, 6h, 24h itd.)
     */
    filterBtn(key, isActive = false) {
        const activeClass = isActive
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800';

        return `
            <button 
                class="filter-btn h-full px-4 text-xs font-bold transition-all rounded-lg flex-shrink-0 snap-center ${activeClass}" 
                data-frame="${key}">
                ${key}
            </button>
        `;
    },

    /**
     * Generuje nawigator dat (strzałki lewo/prawo i etykiety)
     */
    dateNavigator(startLabel, endLabel, isLatest) {
        return `
            <div class="flex items-center bg-slate-900 rounded-xl border border-slate-800 h-14 overflow-hidden shadow-lg w-full min-w-0">
                <div class="flex h-full border-r border-slate-800/50 flex-shrink-0">
                    <button onclick="app.moveRange('big', -1)" class="px-2 md:px-3 h-full hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all border-r border-slate-800/30 flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
                    </button>
                    <button onclick="app.moveRange('small', -1)" class="px-2 md:px-3 h-full hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                </div>

                <div class="flex-[4_0_0] flex flex-col justify-center items-center min-w-0 text-center">
                    <div class="font-mono font-bold tracking-tighter leading-[1.1]">
                        <div class="whitespace-nowrap text-[12px] md:text-[14px] ${isLatest ? 'text-emerald-500' : 'text-blue-400'} uppercase">
                            OD ${startLabel}<br>DO ${endLabel}
                        </div>
                    </div>
                </div>

                <div class="flex h-full border-l border-slate-800/50 flex-shrink-0">
                    <button onclick="app.moveRange('small', 1)" ${isLatest ? 'disabled' : ''} 
                        class="px-2 md:px-3 h-full hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all disabled:opacity-20 disabled:hover:bg-transparent border-r border-slate-800/30 flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                    <button onclick="app.moveRange('big', 1)" ${isLatest ? 'disabled' : ''} 
                        class="px-2 md:px-3 h-full hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-all disabled:opacity-20 disabled:hover:bg-transparent flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 5 18 10 13 15"></polyline><polyline points="6 5 11 10 6 15"></polyline></svg>
                    </button>
                </div>

                <button onclick="app.resetRange()" class="px-3 md:px-4 h-full hover:bg-blue-600/10 text-slate-400 hover:text-blue-400 transition-all border-l border-slate-800 flex-shrink-0 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"></path><path d="M3 13a9 9 0 1 0 3-7.7L3 8"></path></svg>
                </button>
            </div>
        `;
    },

    /**
     * Zarządza widocznością ekranu ładowania (Loader)
     */
    toggleLoader(isLoading) {
        let loader = document.getElementById('ui-loader');
        const container = document.getElementById('app-container');

        if (isLoading) {
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'ui-loader';
                loader.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md transition-all duration-300';
                loader.innerHTML = `
                <div class="flex flex-col items-center p-10 bg-slate-900 border border-blue-500/20 rounded-3xl shadow-[0_0_50px_-12px_rgba(59,130,246,0.4)] animate-in zoom-in duration-300 min-w-[20rem]">
                    <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <div class="mt-6 text-white font-black tracking-widest uppercase text-sm">Przetwarzanie danych...</div>
                </div>
            `;
                document.body.appendChild(loader);
            }
            loader.classList.remove('hidden', 'opacity-0');
            container?.classList.add('pointer-events-none', 'opacity-30', 'blur-[4px]');
        } else {
            if (loader) loader.classList.add('hidden', 'opacity-0');
            container?.classList.remove('pointer-events-none', 'opacity-30', 'blur-[4px]');
        }
    }
};