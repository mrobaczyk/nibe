import { CONFIG } from './config.js';
import { getTimeConfig, getXScale, getYScale, getYTempScale } from './chartScales.js';
import { getPluginsConfig, verticalLinePlugin } from './chartPlugins.js';
import { prepareDatasets } from './chartData.js';

export class ChartManager {
    constructor() {
        this.charts = {};
        this.chartStates = {};
        if (typeof ChartDataLabels !== 'undefined') {
            Chart.register(ChartDataLabels);
        }

        if (!Chart.registry.plugins.get('verticalLine')) {
            Chart.register(verticalLinePlugin);
        }
    }

    _rememberLegendState(chartId, label, isVisible) {
        (this.chartStates[chartId] ??= {})[label] = isVisible;
    }

    draw(id, title, datasets, extraOptions = {}) {
        const configOptions = extraOptions.options || {};

        const {
            yMin = configOptions.yMin ?? null, // Szukamy wewnątrz options
            yMax = configOptions.yMax ?? null, // Szukamy wewnątrz options
            unit = extraOptions.unit || null,
            stacked = extraOptions.stacked || false,
            rawData = extraOptions.rawData || [],
            zones = extraOptions.zones || [],
            min = extraOptions.min || null,
            max = extraOptions.max || null
        } = extraOptions;

        const ctxEl = document.getElementById(id);
        if (!ctxEl) return;

        const chartType = extraOptions.type || 'line';
        const isBar = chartType === 'bar';
        const { timeUnit, tickLimitX } = getTimeConfig(isBar, unit);
        const finalMin = yMin ?? null;
        const finalMax = yMax ?? null;

        // 2. Przetwarzamy dataset-y (mapowanie danych i stylów)
        const processedDatasets = prepareDatasets(datasets, rawData, extraOptions, isBar, unit, id, this.chartStates);

        // 3. Opcje budujemy raz — służą i do aktualizacji, i do nowej instancji.
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 5, top: 5, left: -5, bottom: -5 } },
            interaction: { mode: 'index', axis: 'x', intersect: false },
            intersect: false,
            events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'touchend'],
            onHover: (event, elements, chart) => this._handleHover(event, elements, chart),
            plugins: getPluginsConfig(title, isBar, unit, chartType, (chartId, label, isVisible) => this._rememberLegendState(chartId, label, isVisible)),
            scales: {
                // Przekazujemy min/max do skali czasu
                x: getXScale(isBar, timeUnit, tickLimitX, stacked, min, max, extraOptions.aggType),
                y: getYScale(id, stacked, finalMin, finalMax, isBar),
                // Ukryta skala dla stref (0-1)
                'y-work': {
                    display: false,
                    min: 0,
                    max: 1,
                    position: 'right',
                    grid: { display: false }
                },
                'y-temp': getYTempScale(datasets)
            }
        };

        const existing = this.charts[id];
        if (existing && existing.config.type === chartType) {
            // Aktualizacja istniejącej instancji zamiast niszczenia i tworzenia od nowa:
            // oszczędza ~50 ms na renderze i nie miga canvasem.
            existing.data.datasets = processedDatasets;
            existing.options = options;
            existing.update('none');
            return;
        }

        // Zmiana typu (line <-> bar) wymaga nowej instancji — Chart.js nie zmienia type in-place.
        if (existing) existing.destroy();
        this.charts[id] = new Chart(ctxEl, {
            type: chartType,
            data: { datasets: processedDatasets },
            options
        });
    }

    syncCharts(timestamp) {
        if (!CONFIG.syncTooltips && timestamp !== null) {
            return;
        }

        Object.values(this.charts).forEach(chart => {
            const prevTimestamp = chart.activeTimestamp;

            if (!timestamp) {
                chart.activeTimestamp = null;
                chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            } else {
                chart.activeTimestamp = timestamp;
                // Szukamy indeksu w danych - używamy x, który jest u nas timestampem (ms)
                const index = chart.data.datasets[0].data.findIndex(d => d.x === timestamp);

                if (index !== -1) {
                    const meta = chart.getDatasetMeta(0);
                    if (meta.data[index]) {
                        chart.tooltip.setActiveElements([
                            { datasetIndex: 0, index: index }
                        ], {
                            x: meta.data[index].x,
                            y: meta.data[index].y
                        });
                    }
                }
            }

            if (prevTimestamp !== chart.activeTimestamp) {
                chart.render();
            }
        });
    }

    _handleHover(event, elements, chart) {
        // Blokada scrolla na dotyku podczas interakcji z wykresem
        //if (event.native && event.type.startsWith('touch')) {
        //    event.native.preventDefault();
        //}

        // Obsługa wyjścia kursora/palca
        if (event.type === 'mouseout' || event.type === 'touchend') {
            this.syncCharts(null);
            return;
        }

        // Synchronizacja po znalezieniu punktu
        if (elements && elements.length > 0) {
            const dataIndex = elements[0].index;
            const timestamp = chart.data.datasets[0]?.data?.[dataIndex]?.x;

            if (timestamp && chart.activeTimestamp !== timestamp) {
                if (CONFIG.syncTooltips) {
                    this.syncCharts(timestamp);
                } else {
                    this.syncCharts(null);
                }
            }
        }
    }

    toggleLegend(chartId) {
        // 1. Znajdź instancję wykresu (zakładam, że trzymasz je w obiekcie this.charts)
        const chart = this.charts[chartId];
        if (!chart) return;

        // 2. Przełącz stan widoczności
        const current = chart.options.plugins.legend.display;
        chart.options.plugins.legend.display = !current;

        // 3. Odśwież wykres, żeby zajął zwolnione/nowe miejsce
        chart.update();
    }
}
