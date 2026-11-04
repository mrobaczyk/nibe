import json
import os
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_HISTORY_FILE = os.path.join(BASE_DIR, 'data', 'config_history.json')

# Schedule layout (21 ids per schedule, one per day, Sunday first):
# activated, Start x7, Finish x7, Comfort mode x7.
# Comfort mode: 0 = economy, 1 = normal, 2 = luxury, -1 = disabled.
CWU_SCHEDULE_1_IDS = (
    47669,
    *range(47671, 47678), *range(47679, 47686), *range(47687, 47694),
)
CWU_SCHEDULE_2_IDS = (
    47635,
    *range(47637, 47644), *range(47645, 47652), *range(47653, 47660),
)
CWU_THRESHOLD_IDS = tuple(range(47043, 47050))  # start/stop temps per mode
OTHER_CONFIG_IDS = (
    47206,  # start_gm_level
    47377,  # filter_time
)

CONFIG_IDS = frozenset(
    str(pid) for pid in (
        *CWU_SCHEDULE_1_IDS, *CWU_SCHEDULE_2_IDS,
        *CWU_THRESHOLD_IDS, *OTHER_CONFIG_IDS,
    )
)


def extract_config_values(points):
    return {
        str(p['parameterId']): p.get('value')
        for p in points
        if str(p['parameterId']) in CONFIG_IDS and 'value' in p
    }


def reconstruct_state(history):
    state = {}
    for entry in history:
        state.update(entry['values'])
    return state


def build_history_entry(history, values, ts):
    """Returns a new entry holding only changed values (full baseline when history is empty)."""
    state = reconstruct_state(history)
    changed = {k: v for k, v in sorted(values.items(), key=lambda kv: int(kv[0])) if k not in state or state[k] != v}
    if not changed:
        return None
    return {'ts': ts, 'values': changed}


def load_history(filename=None):
    filename = filename or CONFIG_HISTORY_FILE
    if not os.path.exists(filename):
        return []
    with open(filename, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_history(history, filename=None):
    filename = filename or CONFIG_HISTORY_FILE
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    tmp = filename + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, filename)


def update_config_history(points, filename=None, now=None):
    """Appends changed config values to the history file. Returns the new entry or None."""
    values = extract_config_values(points)
    history = load_history(filename)
    ts = (now or datetime.now(timezone.utc)).strftime('%Y-%m-%d %H:%M')
    entry = build_history_entry(history, values, ts)
    if entry is None:
        return None
    history.append(entry)
    save_history(history, filename)
    return entry
