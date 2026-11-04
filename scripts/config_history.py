import json
import os
import re
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
    47050,  # periodic increase activated
    47051,  # periodic increase period (days)
    49909,  # periodic increase start time (hour)
    47206,  # start_gm_level
    47377,  # filter_time
    47375,  # stop heating (outdoor temp, °C)
    47015,  # climate system
    47209,  # diff. between additional steps (DM)
    47212,  # set max electrical add.
    47376,  # stop additional heat (°C)
    47378,  # max diff compressor (°C)
    47379,  # max diff addition (°C)
    47544,  # start delta-T (heating medium pump)
    47545,  # stop delta-T (heating medium pump)
    48072,  # start diff additional heat (DM)
    48440,  # speed in wait mode (%)
    48642,  # start delta-T
    48643,  # stop delta-T
)

# The date of the next periodic increase exists only inside the parameter name
# (e.g. 'Next periodic increase: 03 . 11 . 2026', possibly truncated by the API).
PERIODIC_INCREASE_DATE_ID = '50249'
_DATE_RE = re.compile(r'(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,4})?')

CONFIG_IDS = frozenset(
    str(pid) for pid in (
        *CWU_SCHEDULE_1_IDS, *CWU_SCHEDULE_2_IDS,
        *CWU_THRESHOLD_IDS, *OTHER_CONFIG_IDS,
    )
) | {PERIODIC_INCREASE_DATE_ID}


def parse_periodic_increase_date(name, now):
    """Returns YYYY-MM-DD from the parameter name; a missing or truncated year is inferred from now."""
    match = _DATE_RE.search(name or '')
    if not match:
        return None
    day, month = int(match.group(1)), int(match.group(2))
    candidates = []
    for year in (now.year - 1, now.year, now.year + 1):
        try:
            candidates.append(datetime(year, month, day, tzinfo=timezone.utc))
        except ValueError:
            continue
    if not candidates:
        return None
    year_text = match.group(3)
    if year_text and len(year_text) == 4:
        candidates = [c for c in candidates if c.year == int(year_text)] or candidates
    best = min(candidates, key=lambda c: abs((c - now).total_seconds()))
    return best.strftime('%Y-%m-%d')


def extract_config_values(points, now=None):
    now = now or datetime.now(timezone.utc)
    values = {
        str(p['parameterId']): p.get('value')
        for p in points
        if str(p['parameterId']) in CONFIG_IDS and 'value' in p
    }
    for p in points:
        if str(p['parameterId']) == PERIODIC_INCREASE_DATE_ID:
            date = parse_periodic_increase_date(p.get('parameterName'), now)
            if date:
                values[PERIODIC_INCREASE_DATE_ID] = date
    return values


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
    now = now or datetime.now(timezone.utc)
    values = extract_config_values(points, now)
    history = load_history(filename)
    ts = now.strftime('%Y-%m-%d %H:%M')
    entry = build_history_entry(history, values, ts)
    if entry is None:
        return None
    history.append(entry)
    save_history(history, filename)
    return entry
