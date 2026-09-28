import json
import os
import time
from datetime import datetime
from itertools import groupby

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(BASE_DIR, 'data', 'data.json')
STREAM_FILE = os.path.join(BASE_DIR, 'data', 'data_stream.json')
HOURLY_FILE = os.path.join(BASE_DIR, 'data', 'hourly_stats.json')
HOURLY_STATE_FILE = os.path.join(BASE_DIR, 'data', 'hourly_state.json')
HOURLY_STATE_KEYS = (
    'kwh_p_heat', 'kwh_p_cwu', 'starts', 'op_time_total', 'op_time_cwu',
    'compressor_hz', 'pump_speed', 'outdoor', 'current_hot_water_mode'
)

GAP_THRESHOLD = 360  # sekundy

def load_json_data(filename):
    if not os.path.exists(filename):
        return []
    with open(filename, 'r', encoding='utf-8') as f:
        try:
            content = f.read().strip()
            if not content:
                return []
            if content.startswith('['):
                return json.loads(content)
            else:
                return [json.loads(line) for line in content.splitlines() if line.strip()]
        except Exception as e:
            print(f"Błąd odczytu {filename}: {e}")
            return []

def save_json_data(filename, data_list):
    with open(filename, 'w', encoding='utf-8') as f:
        for entry in data_list:
            line = json.dumps(entry, separators=(',', ':'))
            f.write(line + '\n')

def estimate_power_usage(hz, pump_speed, temp_ext):
    if hz < 1:
        return 0.02  # Standby (elektronika)

    # Średni współczynnik (możesz go dostroić między 0.025 a 0.030)
    base_hz_coeff = 0.028 

    # Korekta temperaturowa (im zimniej na zewnątrz, tym wyższy pobór prądu przy tych samych Hz)
    temp_correction = 1.0
    if temp_ext < 10:
        temp_correction = 1.0 + (10 - temp_ext) * 0.008

    compressor_kw = hz * base_hz_coeff * temp_correction

    if temp_ext < 2.0:
        compressor_kw += 0.07 # Grzanie tacki ociekowej

    circ_pump_kw = 0.06 * (pump_speed / 100)
    
    return round(compressor_kw + circ_pump_kw, 3)

def process_delta(new_entry, current_state, last_timestamp_str=None):
    state_to_use = current_state.copy()
    
    if last_timestamp_str:
        try:
            t_prev = datetime.strptime(last_timestamp_str, "%Y-%m-%d %H:%M")
            t_curr = datetime.strptime(new_entry['ts'], "%Y-%m-%d %H:%M")
            if (t_curr - t_prev).total_seconds() > GAP_THRESHOLD:
                print(f"DATA GAP: {t_prev} - {t_curr}")
                state_to_use = {}
        except: pass

    delta = create_delta_entry(new_entry, state_to_use)
    new_state = state_to_use.copy()
    new_state.update(new_entry)
    
    return delta, new_state

def create_delta_entry(new_full_entry, last_known_full_state):
    """Tworzy wpis typu 'delta' (tylko zmiany) względem pełnego stanu."""
    delta_entry = {"ts": new_full_entry["ts"]}
    for key, value in new_full_entry.items():
        if key == "ts":
            continue
        if key not in last_known_full_state or last_known_full_state[key] != value:
            delta_entry[key] = value
    return delta_entry

def rebuild_data_stream(full_history):
    """Tworzy od zera plik data_stream.json używając process_delta."""
    stream_history = []
    current_state = {}
    sorted_history = sorted(full_history, key=lambda x: x['ts'])
    
    for i, entry in enumerate(sorted_history):
        last_ts = sorted_history[i-1]['ts'] if i > 0 else None
        
        delta, current_state = process_delta(entry, current_state, last_ts)
        stream_history.append(delta)
        
    save_json_data(STREAM_FILE, stream_history)
    return stream_history

def _aggregate_hour(hour_key, hour_points, start_state):
    state_at_start = start_state.copy()
    last_known_state = start_state.copy()
    cons_h, cons_c = 0.0, 0.0
    out_sum, out_count = 0.0, 0

    for point in hour_points:
        prev_state = last_known_state.copy()
        last_known_state.update(point)

        if 'outdoor' in point:
            out_sum += float(point['outdoor'])
            out_count += 1

        hz = float(last_known_state.get('compressor_hz', 0))
        pump_speed = float(last_known_state.get('pump_speed', 0))
        outdoor = float(last_known_state.get('outdoor', 0))
        step_kwh = estimate_power_usage(hz, pump_speed, outdoor) / 12

        def get_instant_delta(key):
            if key in point and key in prev_state:
                return max(0, float(point[key]) - float(prev_state[key]))
            return 0

        delta_heat = get_instant_delta('kwh_p_heat')
        delta_cwu = get_instant_delta('kwh_p_cwu')

        if delta_heat + delta_cwu > 0:
            cons_h += step_kwh * (delta_heat / (delta_heat + delta_cwu))
            cons_c += step_kwh * (delta_cwu / (delta_heat + delta_cwu))
        elif int(last_known_state.get('current_hot_water_mode', 0)) > 0 and hz > 0:
            cons_c += step_kwh
        else:
            cons_h += step_kwh

    def get_hour_delta(key):
        if key in last_known_state and key in state_at_start:
            return max(0, float(last_known_state[key]) - float(state_at_start[key]))
        return 0

    prod_heat = round(get_hour_delta('kwh_p_heat'), 2)
    prod_cwu = round(get_hour_delta('kwh_p_cwu'), 2)
    work_total = get_hour_delta('op_time_total')
    work_cwu = get_hour_delta('op_time_cwu')

    hourly_stats = {
        'ts': f'{hour_key}:00',
        'starts': int(get_hour_delta('starts')),
        'work_h_heat': round(max(0, work_total - work_cwu), 2),
        'work_h_cwu': round(work_cwu, 2),
        'kwh_p_heat': prod_heat,
        'kwh_p_cwu': prod_cwu,
        'kwh_c_heat': round(cons_h, 3),
        'kwh_c_cwu': round(cons_c, 3),
        'cop_heat': round(prod_heat / cons_h, 2) if cons_h > 0.05 else 0,
        'cop_cwu': round(prod_cwu / cons_c, 2) if cons_c > 0.05 else 0,
        'out_avg': round(out_sum / out_count, 1) if out_count > 0 else round(float(last_known_state.get('outdoor', 0)), 1)
    }
    return hourly_stats, state_at_start, last_known_state


def _checkpoint_state(state):
    return {key: state[key] for key in HOURLY_STATE_KEYS if key in state}


def _build_hourly(history):
    hourly_history = []
    last_known_state = {}
    checkpoint = None

    for hour_key, points in groupby(history, key=lambda entry: entry['ts'][:13]):
        hourly_stats, state_at_start, last_known_state = _aggregate_hour(hour_key, points, last_known_state)
        hourly_history.append(hourly_stats)
        checkpoint = {
            'hour': hour_key,
            'state_start': _checkpoint_state(state_at_start),
            'state_end': _checkpoint_state(last_known_state)
        }

    return hourly_history, checkpoint


def _save_hourly_checkpoint(checkpoint):
    temp_path = HOURLY_STATE_FILE + '.tmp'
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(checkpoint, f, separators=(',', ':'))
    os.replace(temp_path, HOURLY_STATE_FILE)


def _load_hourly_checkpoint():
    try:
        with open(HOURLY_STATE_FILE, 'r', encoding='utf-8') as f:
            checkpoint = json.load(f)
    except (OSError, ValueError):
        return None

    if (
        not isinstance(checkpoint, dict)
        or not isinstance(checkpoint.get('hour'), str)
        or not isinstance(checkpoint.get('state_start'), dict)
        or not isinstance(checkpoint.get('state_end'), dict)
    ):
        return None
    return checkpoint


def _rebuild_hourly(full_history):
    history = sorted(full_history, key=lambda entry: entry['ts'])
    hourly_history, checkpoint = _build_hourly(history)
    save_json_data(HOURLY_FILE, hourly_history[-18000:])
    if checkpoint:
        _save_hourly_checkpoint(checkpoint)


def update_hourly(full_history, *, full_rebuild=False):
    if not full_history:
        return

    if full_rebuild:
        _rebuild_hourly(full_history)
        return

    hourly_history = load_json_data(HOURLY_FILE)
    checkpoint = _load_hourly_checkpoint()
    if not hourly_history or not checkpoint:
        _rebuild_hourly(full_history)
        return

    latest_hour = full_history[-1]['ts'][:13]
    saved_hour = checkpoint['hour']
    if hourly_history[-1]['ts'][:13] != saved_hour or latest_hour < saved_hour:
        _rebuild_hourly(full_history)
        return

    if latest_hour == saved_hour:
        points = []
        for entry in reversed(full_history):
            if entry['ts'][:13] != latest_hour:
                break
            points.append(entry)
        points.reverse()
        if not points:
            _rebuild_hourly(full_history)
            return

        hourly_stats, state_at_start, state_end = _aggregate_hour(latest_hour, points, checkpoint['state_start'])
        hourly_history[-1] = hourly_stats
        checkpoint = {
            'hour': latest_hour,
            'state_start': _checkpoint_state(state_at_start),
            'state_end': _checkpoint_state(state_end)
        }
    else:
        new_points = []
        for entry in reversed(full_history):
            if entry['ts'][:13] <= saved_hour:
                break
            new_points.append(entry)
        new_points.reverse()
        if not new_points:
            _rebuild_hourly(full_history)
            return

        state = checkpoint['state_end']
        for hour_key, points in groupby(new_points, key=lambda entry: entry['ts'][:13]):
            hourly_stats, state_at_start, state = _aggregate_hour(hour_key, points, state)
            hourly_history.append(hourly_stats)
            checkpoint = {
                'hour': hour_key,
                'state_start': _checkpoint_state(state_at_start),
                'state_end': _checkpoint_state(state)
            }

    save_json_data(HOURLY_FILE, hourly_history[-18000:])
    _save_hourly_checkpoint(checkpoint)