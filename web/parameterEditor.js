// parameterEditor.js
// Builds and wires the "edit NIBE parameter" <dialog> and submits changes
// through the Cloudflare Worker gateway.
import { CONFIG } from './config.js';

export function openParameterEditorDialog(kpi, lastStats, onSubmit) {
    document.getElementById('nibe-settings-dialog')?.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'nibe-settings-dialog';
    dialog.className = 'w-[calc(100%-2rem)] max-w-md rounded-lg border border-slate-700 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-black/70';

    const form = document.createElement('form');
    form.className = 'flex flex-col gap-4 p-5';

    const heading = document.createElement('h2');
    heading.className = 'pr-8 text-base font-bold text-white';
    heading.textContent = `Edytuj: ${kpi.t}`;
    form.appendChild(heading);

    const inputById = new Map();
    for (const parameter of kpi.editableParameters) {
        const label = document.createElement('label');
        label.className = 'flex flex-col gap-1.5 text-sm text-slate-300';
        label.textContent = parameter.label;

        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.required = true;
        input.name = parameter.parameterId;
        input.className = 'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30';
        const currentValue = lastStats.absoluteLast[parameter.field];
        input.value = currentValue === undefined || currentValue === null ? '' : String(currentValue);
        inputById.set(parameter.parameterId, { input, currentValue });
        label.appendChild(input);
        form.appendChild(label);
    }

    const status = document.createElement('p');
    status.className = 'min-h-5 text-sm text-slate-400';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);

    const actions = document.createElement('div');
    actions.className = 'flex justify-end gap-2';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800';
    cancelButton.textContent = 'Anuluj';
    cancelButton.addEventListener('click', () => dialog.close());

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60';
    submitButton.textContent = 'Wyślij zmianę';
    actions.append(cancelButton, submitButton);
    form.appendChild(actions);

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const values = {};
        for (const [parameterId, entry] of inputById) {
            const value = entry.input.value.trim();
            if (!value || !Number.isFinite(Number(value))) {
                entry.input.focus();
                status.textContent = `Podaj poprawną liczbę dla parametru ${parameterId}.`;
                return;
            }
            if (Number(value) !== Number(entry.currentValue)) values[parameterId] = value;
        }

        if (Object.keys(values).length === 0) {
            status.textContent = 'Wartości nie zostały zmienione.';
            return;
        }

        submitButton.disabled = true;
        cancelButton.disabled = true;
        status.textContent = 'Wysyłanie zmiany do GitHub Actions...';
        try {
            const result = await onSubmit(values, status);
            submitButton.textContent = result ? 'Zapisano' : 'Sprawdź status';
            cancelButton.disabled = false;
            if (result) setTimeout(() => dialog.close(), 1800);
        } catch (error) {
            status.textContent = error.message;
            submitButton.disabled = false;
            cancelButton.disabled = false;
        }
    });

    let backdropMouseDown = false;
    dialog.addEventListener('mousedown', event => {
        backdropMouseDown = event.target === dialog;
    });
    dialog.addEventListener('click', event => {
        if (event.target === dialog && backdropMouseDown) dialog.close();
        backdropMouseDown = false;
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.appendChild(form);
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('input')?.focus();
}

export async function submitParameterUpdate(values, statusElement, apiUrl = CONFIG.SETTINGS_API_URL) {
    const cleanApiUrl = (apiUrl || '').replace(/\/$/, '');
    if (!cleanApiUrl) throw new Error('Skonfiguruj SETTINGS_API_URL w web/config.js po wdrożeniu Workera.');

    const response = await fetch(`${cleanApiUrl}/api/settings`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
    });
    const request = await response.json().catch(() => ({}));
    if (!response.ok || !request.requestId) {
        throw new Error(request.error || `Nie udało się zlecić zmiany (HTTP ${response.status}).`);
    }

    for (let attempt = 0; attempt < 45; attempt++) {
        statusElement.textContent = 'Żądanie w kolejce. Czekam na wynik GitHub Actions...';
        await new Promise(resolve => setTimeout(resolve, 2000));
        const statusResponse = await fetch(`${cleanApiUrl}/api/requests/${request.requestId}`, {
            credentials: 'include'
        });
        const run = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(run.error || 'Nie udało się sprawdzić statusu zapisu.');

        if (run.status === 'completed') {
            if (run.conclusion === 'success') {
                statusElement.textContent = 'myUplink przyjął zmianę. Dashboard odświeży odczyt przy następnym pobraniu danych.';
                return true;
            }
            throw new Error('Aktualizacja nie powiodła się. Sprawdź log workflow „Set NIBE Parameters” w GitHub Actions.');
        }
    }

    throw new Error(`Workflow nadal działa. ID żądania: ${request.requestId}. Sprawdź jego status w GitHub Actions przed ponowną wysyłką.`);
}
