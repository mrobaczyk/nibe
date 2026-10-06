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
POWER_MODEL_FILE = os.path.join(BASE_DIR, 'data', 'power_model.json')
INGEST_STATE_FILE = os.path.join(BASE_DIR, 'data', 'ingest_state.json')
MAX_HISTORY_RECORDS = 150000
PRUNE_HISTORY_TO = 149000
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


def save_json_data_atomic(filename, data_list):
    temp_path = filename + '.tmp'
    with open(temp_path, 'w', encoding='utf-8') as f:
        for entry in data_list:
            f.write(json.dumps(entry, separators=(',', ':')) + '\n')
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp_path, filename)


def ensure_jsonl_file(filename):
    if not os.path.exists(filename):
        return 0

    with open(filename, 'r+b') as f:
        is_array = f.read(4096).lstrip()[:1] == b'['
        if not is_array:
            return _repair_jsonl_tail_open(f)

    save_json_data(filename, load_json_data(filename))
    return _repair_jsonl_tail(filename)


def _repair_jsonl_tail(filename):
    if not os.path.exists(filename):
        return 0

    with open(filename, 'r+b') as f:
        return _repair_jsonl_tail_open(f)


def _repair_jsonl_tail_open(f):
    f.seek(0, os.SEEK_END)
    size = f.tell()
    if size == 0:
        return 0

    f.seek(size - 1)
    if f.read(1) == b'\n':
        return size

    position = size
    line_start = 0
    while position > 0:
        block_start = max(0, position - 8192)
        f.seek(block_start)
        block = f.read(position - block_start)
        newline_index = block.rfind(b'\n')
        if newline_index >= 0:
            line_start = block_start + newline_index + 1
            break
        position = block_start

    f.seek(line_start)
    trailing_line = f.read(size - line_start)
    try:
        json.loads(trailing_line)
    except (UnicodeDecodeError, json.JSONDecodeError):
        f.truncate(line_start)
        f.flush()
        os.fsync(f.fileno())
        return line_start

    f.seek(0, os.SEEK_END)
    f.write(b'\n')
    f.flush()
    os.fsync(f.fileno())
    return size + 1


def iter_jsonl_reverse(filename):
    _repair_jsonl_tail(filename)
    with open(filename, 'rb') as f:
        position = f.seek(0, os.SEEK_END)
        remainder = b''

        while position > 0:
            block_start = max(0, position - 8192)
            f.seek(block_start)
            block = f.read(position - block_start) + remainder
            lines = block.split(b'\n')
            remainder = lines[0]
            for line in reversed(lines[1:]):
                if line.strip():
                    yield json.loads(line)
            position = block_start

        if remainder.strip():
            yield json.loads(remainder)


def read_last_jsonl_record(filename):
    return next(iter_jsonl_reverse(filename), None) if os.path.exists(filename) else None


def append_jsonl_record(filename, entry):
    ensure_jsonl_file(filename)
    line = (json.dumps(entry, separators=(',', ':')) + '\n').encode('utf-8')
    with open(filename, 'ab') as f:
        f.write(line)
        f.flush()
        os.fsync(f.fileno())
        return f.tell()


def read_jsonl_from_offset(filename, offset):
    ensure_jsonl_file(filename)
    with open(filename, 'rb') as f:
        f.seek(0, os.SEEK_END)
        size = f.tell()
        if offset < 0 or offset > size:
            raise ValueError(f'Offset poza plikiem {filename}: {offset}')
        if offset:
            f.seek(offset - 1)
            if f.read(1) != b'\n':
                raise ValueError(f'Offset nie wskazuje granicy rekordu w {filename}: {offset}')

        f.seek(offset)
        return [json.loads(line) for line in f if line.strip()]


def load_jsonl_since_hour(filename, hour):
    records = []
    for entry in iter_jsonl_reverse(filename):
        if entry['ts'][:13] < hour:
            break
        records.append(entry)
    records.reverse()
    return records


def count_jsonl_records(filename):
    ensure_jsonl_file(filename)
    if not os.path.exists(filename):
        return 0
    with open(filename, 'rb') as f:
        return sum(1 for line in f if line.strip())


def load_ingest_checkpoint():
    try:
        with open(INGEST_STATE_FILE, 'r', encoding='utf-8') as f:
            checkpoint = json.load(f)
    except (OSError, ValueError):
        return None

    required = ('last_ts', 'state', 'data_offset', 'stream_offset', 'record_count')
    if (
        not isinstance(checkpoint, dict)
        or not all(key in checkpoint for key in required)
        or (checkpoint['last_ts'] is not None and not isinstance(checkpoint['last_ts'], str))
        or not isinstance(checkpoint['state'], dict)
        or not all(isinstance(checkpoint[key], int) and checkpoint[key] >= 0 for key in required[2:])
    ):
        return None
    return checkpoint


def save_ingest_checkpoint(checkpoint):
    temp_path = INGEST_STATE_FILE + '.tmp'
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(checkpoint, f, separators=(',', ':'))
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp_path, INGEST_STATE_FILE)


def write_ingest_checkpoint(full_history, current_state=None):
    history = sorted(full_history, key=lambda entry: entry['ts'])
    last_entry = history[-1] if history else None
    ensure_jsonl_file(DATA_FILE)
    ensure_jsonl_file(STREAM_FILE)
    checkpoint = {
        'last_ts': last_entry['ts'] if last_entry else None,
        'state': current_state.copy() if current_state is not None else (last_entry.copy() if last_entry else {}),
        'data_offset': os.path.getsize(DATA_FILE) if os.path.exists(DATA_FILE) else 0,
        'stream_offset': os.path.getsize(STREAM_FILE) if os.path.exists(STREAM_FILE) else 0,
        'record_count': count_jsonl_records(STREAM_FILE)
    }
    save_ingest_checkpoint(checkpoint)
    return checkpoint

def load_power_model():
    with open(POWER_MODEL_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


POWER_MODEL = load_power_model()


def estimate_power_usage(hz, pump_speed, temp_ext, model=None):
    # Parametry modelu są wspólne z frontendem (data/power_model.json).
    model = model or POWER_MODEL
    if hz < 1:
        return model['standby_kw']

    # Brak odczytu temperatury zewnętrznej -> wartość domyślna z modelu.
    if temp_ext is None:
        temp_ext = model['default_outdoor_c']

    temp_correction = 1.0
    if temp_ext < model['cold_below_c']:
        temp_correction = 1.0 + (model['cold_below_c'] - temp_ext) * model['cold_correction_per_c']

    compressor_kw = hz * model['hz_coeff_kw'] * temp_correction

    if temp_ext < model['tray_heater_below_c']:
        compressor_kw += model['tray_heater_kw']

    circ_pump_kw = model['circ_pump_kw'] * (pump_speed / 100)

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


def ingest_checkpoint_offsets_valid(checkpoint):
    for filename, key in ((DATA_FILE, 'data_offset'), (STREAM_FILE, 'stream_offset')):
        ensure_jsonl_file(filename)
        size = os.path.getsize(filename) if os.path.exists(filename) else 0
        offset = checkpoint[key]
        if offset > size:
            return False
        if offset:
            with open(filename, 'rb') as f:
                f.seek(offset - 1)
                if f.read(1) != b'\n':
                    return False
    return True


def rebuild_ingest_checkpoint():
    history = load_json_data(DATA_FILE)
    rebuild_data_stream(history)
    return load_ingest_checkpoint()


def initialize_ingest_checkpoint():
    ensure_jsonl_file(DATA_FILE)
    ensure_jsonl_file(STREAM_FILE)
    last_data = read_last_jsonl_record(DATA_FILE)
    last_stream = read_last_jsonl_record(STREAM_FILE)

    if (last_data or {}).get('ts') != (last_stream or {}).get('ts'):
        return rebuild_ingest_checkpoint()

    checkpoint = {
        'last_ts': (last_data or {}).get('ts'),
        'state': last_data.copy() if last_data else {},
        'data_offset': os.path.getsize(DATA_FILE) if os.path.exists(DATA_FILE) else 0,
        'stream_offset': os.path.getsize(STREAM_FILE) if os.path.exists(STREAM_FILE) else 0,
        'record_count': count_jsonl_records(STREAM_FILE)
    }
    save_ingest_checkpoint(checkpoint)
    return checkpoint


def recover_ingest_tail(checkpoint):
    try:
        raw_tail = read_jsonl_from_offset(DATA_FILE, checkpoint['data_offset'])
        stream_tail = read_jsonl_from_offset(STREAM_FILE, checkpoint['stream_offset'])
    except (OSError, ValueError, json.JSONDecodeError):
        return rebuild_ingest_checkpoint()

    stream_timestamps = [entry['ts'] for entry in stream_tail]
    raw_timestamps = [entry['ts'] for entry in raw_tail]
    if stream_timestamps != raw_timestamps[:len(stream_timestamps)]:
        return rebuild_ingest_checkpoint()

    current_state = checkpoint['state'].copy()
    last_ts = checkpoint['last_ts']
    for index, entry in enumerate(raw_tail):
        if last_ts is not None and entry['ts'] <= last_ts:
            return rebuild_ingest_checkpoint()
        delta, current_state = process_delta(entry, current_state, last_ts)
        if index >= len(stream_tail):
            append_jsonl_record(STREAM_FILE, delta)
        last_ts = entry['ts']

    if raw_tail:
        checkpoint = {
            'last_ts': last_ts,
            'state': current_state,
            'data_offset': os.path.getsize(DATA_FILE),
            'stream_offset': os.path.getsize(STREAM_FILE),
            'record_count': checkpoint['record_count'] + len(raw_tail)
        }
        save_ingest_checkpoint(checkpoint)
    return checkpoint


def append_ingest_record(entry, checkpoint):
    if checkpoint['last_ts'] is not None and entry['ts'] <= checkpoint['last_ts']:
        return checkpoint, False

    append_jsonl_record(DATA_FILE, entry)
    delta, current_state = process_delta(entry, checkpoint['state'], checkpoint['last_ts'])
    append_jsonl_record(STREAM_FILE, delta)
    checkpoint = {
        'last_ts': entry['ts'],
        'state': current_state,
        'data_offset': os.path.getsize(DATA_FILE),
        'stream_offset': os.path.getsize(STREAM_FILE),
        'record_count': checkpoint['record_count'] + 1
    }
    save_ingest_checkpoint(checkpoint)
    return checkpoint, True


def load_hourly_input(filename=None):
    filename = filename or DATA_FILE
    checkpoint = _load_hourly_checkpoint()
    if not checkpoint:
        return load_json_data(filename)
    records = load_jsonl_since_hour(filename, checkpoint['hour'])
    return records or load_json_data(filename)

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
    write_ingest_checkpoint(sorted_history, current_state)
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
        outdoor = last_known_state.get('outdoor')
        step_kwh = estimate_power_usage(hz, pump_speed, None if outdoor is None else float(outdoor)) / 12

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