import requests
import json
import os
import time
from datetime import datetime

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(BASE_DIR, 'data', 'data.json')
STREAM_FILE = os.path.join(BASE_DIR, 'data', 'data_stream.json')
HOURLY_FILE = os.path.join(BASE_DIR, 'data', 'hourly_stats.json')

GAP_THRESHOLD = 360  # sekundy

PARAMS_MAP = {
    "40004": "outdoor",
    "40008": "supply_line", #bt2
    "40012": "return_line", #bt3
    "40013": "cwu_upper", #bt7
    "40014": "cwu_load", #bt6
    "40033": "room_temperature", #bt50
    "40067": "out_avg",
    "40071": "bt25_temp", #bt25 - external supply line
    #"40072": "flow_sensor", #bf1
    #"40079": "current_3", #be3
    #"40081": "current_2", #be2
    #"40083": "current_1", #be1
    #"40145": "oil_temp_ep15", #ep15-bt29 
    #"40146": "oil_temp", #bt29 
    #"40782": "req_compressor_freq",
    #"40940": "degree_minutes_curr_value",
    "40941": "dm",
    "43009": "calc_flow",
    #"43081": "time_factor_add_heat",
    "43109": "current_hot_water_mode",
    #"43161": "external_adjustment",
    #"43239": "external_adjustment_hot_water",
    "44055": "return_line_eb101", #eb101-bt3
    "44058": "supply_line_eb101", #eb101-bt12
    #"44059": "discharge_hot_gas", #eb101-bt14
    "44060": "liquid_line", #eb101-bt15
    #"44061": "suction_gas", #eb101-bt17
    #"44064": "compressor_status",
    "44069": "starts",
    "44071": "op_time_total",
    "44073": "op_time_cwu",
    "44298": "kwh_p_cwu", #including additional heat
    "44300": "kwh_p_heat", #including additional heat
    #"44306": "kwh_p_cwu_compressor", #only compressor
    #"44308": "kwh_p_heat_compressor", #only compressor
    #"44362": "outdoor_eb101", #eb101-bt28
    "44363": "evaporator", #eb101-bt16
    "44396": "pump_speed", #gp1
    "44699": "high_pressure", #eb101-bp4
    "44700": "low_pressure", #eb101-bp8
    "44701": "compressor_hz",
    #"44702": "protection_mode_compressor",
    "44703": "defrosting",
    "47007": "heat_curve",
    "47011": "heat_offset",
    #"47015": "climate_system", 
    #"47041": "hot_water_demand",
    #"47050": "activated",
    #"47051": "period",
    #"47137": "op_mode", 
    "47206": "start_gm_level",
    #"47209": "diff_steps", 
    #"47212": "max_electrical_add", 
    #"47375": "stop_heating", 
    #"47376": "stop_additional_heat", 
    "47377": "filter_time",
    #"48072": "start_additional_heat", 
    "48132": "hot_water_boost",
    #"49909": "hot_water_boost_start_time",
    "50004": "temp_lux"
}

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    payload = {'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET}
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    response = requests.post(url, data=payload, headers=headers)
    response.raise_for_status()
    return response.json()['access_token']

def update_hourly(full_history):
    if not full_history: return
    
    h_hist = []
    history = sorted(full_history, key=lambda x: x['ts'])
    all_hours = sorted(list(set(h['ts'][:13] + ":00" for h in history)))
    
    last_known_state = {}

    for hour_to_check in all_hours:
        hour_points = [h for h in history if h['ts'].startswith(hour_to_check[:13])]
        if not hour_points: continue

        state_at_start_of_hour = last_known_state.copy()
        cons_h, cons_c = 0.0, 0.0
        out_sum, out_count = 0.0, 0

        for p in hour_points:
            prev_p_dict = last_known_state.copy()
            last_known_state.update(p) # Aktualizujemy globalny stan najnowszymi danymi
            
            if 'outdoor' in p:
                out_sum += float(p['outdoor'])
                out_count += 1
            
            hz = float(last_known_state.get('compressor_hz', 0))
            ps = float(last_known_state.get('pump_speed', 0))
            ot = float(last_known_state.get('outdoor', 0))
            step_kwh = estimate_power_usage(hz, ps, ot) / 12

            
            def get_instant_delta(key):
                if key in p and key in prev_p_dict:
                    return max(0, float(p[key]) - float(prev_p_dict[key]))
                return 0

            dp_h = get_instant_delta('kwh_p_heat')
            dp_c = get_instant_delta('kwh_p_cwu')
            
            if (dp_h + dp_c) > 0:
                cons_h += step_kwh * (dp_h / (dp_h + dp_c))
                cons_c += step_kwh * (dp_c / (dp_h + dp_c))
            else:
                if int(last_known_state.get('current_hot_water_mode', 0)) > 0 and hz > 0:
                    cons_c += step_kwh
                else:
                    cons_h += step_kwh

        def get_hour_delta(key):
            if key in last_known_state and key in state_at_start_of_hour:
                return max(0, float(last_known_state[key]) - float(state_at_start_of_hour[key]))
            return 0

        h_prod_h = round(get_hour_delta('kwh_p_heat'), 2)
        h_prod_c = round(get_hour_delta('kwh_p_cwu'), 2)
        h_starts = int(get_hour_delta('starts'))
        
        total_work = get_hour_delta('op_time_total')
        cwu_work = get_hour_delta('op_time_cwu')
        h_work_h = round(max(0, total_work - cwu_work), 2)
        h_work_c = round(cwu_work, 2)

        h_cop_h = round(h_prod_h / cons_h, 2) if cons_h > 0.05 else 0
        h_cop_c = round(h_prod_c / cons_c, 2) if cons_c > 0.05 else 0

        h_hist.append({
            "ts": hour_to_check,
            "starts": h_starts,
            "work_h_heat": h_work_h,
            "work_h_cwu": h_work_c,
            "kwh_p_heat": h_prod_h,
            "kwh_p_cwu": h_prod_c,
            "kwh_c_heat": round(cons_h, 3),
            "kwh_c_cwu": round(cons_c, 3),
            "cop_heat": h_cop_h,
            "cop_cwu": h_cop_c,
            "out_avg": round(out_sum / out_count, 1) if out_count > 0 else round(float(last_known_state.get('outdoor', 0)), 1)
        })

    save_json_data(HOURLY_FILE, h_hist[-18000:])

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
        dev_id = systems['systems'][0]['devices'][0]['id']
        
        param_ids = ",".join([k for k in PARAMS_MAP.keys()])
        url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={param_ids}"
        points = requests.get(url, headers=headers).json()
        
        new_full_entry = {"ts": time.strftime("%Y-%m-%d %H:%M")}
        for p in points:
            p_id = str(p['parameterId'])
            if p_id in PARAMS_MAP: 
                new_full_entry[PARAMS_MAP[p_id]] = p['value']

        # A. data.json
        full_history = load_json_data(DATA_FILE)
        full_history.append(new_full_entry)
        save_json_data(DATA_FILE, full_history[-50000:])

        # B. data_stream.json
        stream_history = load_json_data(STREAM_FILE)
        
        current_state = {}
        for entry in stream_history:
            current_state.update(entry)

        last_ts = stream_history[-1]['ts'] if stream_history else None
        delta, _ = process_delta(new_full_entry, current_state, last_ts)
        
        stream_history.append(delta)
        save_json_data(STREAM_FILE, stream_history[-50000:])

        # C. hourly_stats.json
        update_hourly(full_history)

        print(f"Sukces: {new_full_entry['ts']}")

    except Exception as e: 
        print(f"Błąd: {e}")

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


def create_delta_entry(new_full_entry, last_known_full_state):
    """Tworzy wpis typu 'delta' (tylko zmiany) względem pełnego stanu."""
    delta_entry = {"ts": new_full_entry["ts"]}
    for key, value in new_full_entry.items():
        if key == "ts":
            continue
        if key not in last_known_full_state or last_known_full_state[key] != value:
            delta_entry[key] = value
    return delta_entry

def process_delta(new_entry, current_state, last_timestamp_str=None):
    """
    Decyduje czy zresetować stan (dziura) i generuje deltę.
    Zwraca (delta_entry, updated_state)
    """
    state_to_use = current_state.copy()
    
    if last_timestamp_str:
        try:
            t_prev = datetime.strptime(last_timestamp_str, "%Y-%m-%d %H:%M")
            t_curr = datetime.strptime(new_entry['ts'], "%Y-%m-%d %H:%M")
            if (t_curr - t_prev).total_seconds() > GAP_THRESHOLD:
                # Wykryto dziurę - czyścimy stan, by wymusić pełny wpis
                state_to_use = {}
        except: pass

    delta = create_delta_entry(new_entry, state_to_use)
    # Aktualizujemy stan na podstawie nowego wpisu
    new_state = state_to_use.copy()
    new_state.update(new_entry)
    
    return delta, new_state

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

def load_json_data(filename):
    """Wczytuje dane niezależnie od tego, czy to standardowy JSON czy JSON Lines."""
    if not os.path.exists(filename):
        return []
    with open(filename, 'r', encoding='utf-8') as f:
        try:
            content = f.read().strip()
            if not content:
                return []
            # Sprawdzamy czy plik zaczyna się od [ (stary format)
            if content.startswith('['):
                return json.loads(content)
            else:
                # Format JSON Lines
                return [json.loads(line) for line in content.splitlines() if line.strip()]
        except Exception as e:
            print(f"Błąd odczytu {filename}: {e}")
            return []

def save_json_data(filename, data_list):
    """Zapisuje dane w formacie JSON Lines (jeden obiekt na linię, brak spacji)."""
    with open(filename, 'w', encoding='utf-8') as f:
        for entry in data_list:
            # separators=(',', ':') usuwa spacje po przecinkach i dwukropkach
            line = json.dumps(entry, separators=(',', ':'))
            f.write(line + '\n')

if __name__ == "__main__":
    fetch_data()