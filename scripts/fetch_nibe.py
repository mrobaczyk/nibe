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

PARAMS_MAP = {
    "40004": "outdoor",
    "40008": "supply_line", #bt2
    "40012": "return_line", #bt3
    "40013": "cwu_upper", #bt7
    "40014": "cwu_load", #bt6
    "40033": "room_temperature", #bt50
    "40067": "outdoor_avg",
    "40071": "bt25_temp", #bt25 - external supply line
    #"40072": "flow_sensor", #bf1
    #"40079": "current_3", #be3
    #"40081": "current_2", #be2
    #"40083": "current_1", #be1
    #"40145": "oil_temp_ep15", #ep15-bt29 
    #"40146": "oil_temp", #bt29 
    #"40782": "req_compressor_freq",
    #"40940": "degree_minutes_curr_value",
    "40941": "degree_minutes",
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
    "44298": "kwh_produced_cwu", #including additional heat
    "44300": "kwh_produced_heating", #including additional heat
    #"44306": "kwh_produced_cwu_compressor", #only compressor
    #"44308": "kwh_produced_heating_compressor", #only compressor
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
    if os.path.exists(HOURLY_FILE):
        with open(HOURLY_FILE, 'r') as f:
            try: h_hist = json.load(f)
            except: h_hist = []

    history = sorted(full_history, key=lambda x: x['timestamp'])
    current_hour_str = datetime.now().strftime("%Y-%m-%d %H:00")
    all_hours = sorted(list(set(h['timestamp'][:13] + ":00" for h in history)))
    
    active_state = {}
    data_changed = False

    for hour_to_check in all_hours:
        if hour_to_check == current_hour_str: break
        
        existing_idx = next((i for i, d in enumerate(h_hist) if d['date'] == hour_to_check), None)
        hour_points = [h for h in history if h['timestamp'].startswith(hour_to_check[:13])]
        if not hour_points: continue

        if existing_idx is not None:
            for p in hour_points: active_state.update(p)
            continue

        state_at_start = active_state.copy()
        cons_h, cons_c = 0.0, 0.0
        out_sum, out_count = 0.0, 0

        for p in hour_points:
            prev_p_state = active_state.copy()
            active_state.update(p)
            
            if 'outdoor' in p:
                out_sum += float(p['outdoor'])
                out_count += 1
            
            hz = active_state.get('compressor_hz', 0)
            ps = active_state.get('pump_speed', 0)
            ot = active_state.get('outdoor', 0)
            step_kwh = estimate_power_usage(hz, ps, ot) / 12

            dp_h = max(0, float(active_state.get('kwh_produced_heating', 0)) - float(prev_p_state.get('kwh_produced_heating', 0)))
            dp_c = max(0, float(active_state.get('kwh_produced_cwu', 0)) - float(prev_p_state.get('kwh_produced_cwu', 0)))
            
            if (dp_h + dp_c) > 0:
                cons_h += step_kwh * (dp_h / (dp_h + dp_c))
                cons_c += step_kwh * (dp_c / (dp_h + dp_c))
            else:
                if active_state.get('current_hot_water_mode', 0) > 0 and hz > 0: cons_c += step_kwh
                else: cons_h += step_kwh

        diff = lambda key: max(0, float(active_state.get(key, 0)) - float(state_at_start.get(key, 0)))
        
        h_hist.append({
            "date": hour_to_check,
            "starts": int(diff('starts')),
            "work_hours_heating": round(max(0, diff('op_time_total') - diff('op_time_cwu')), 2),
            "work_hours_cwu": round(diff('op_time_cwu'), 2),
            "kwh_produced_heating": round(diff('kwh_produced_heating'), 2),
            "kwh_produced_cwu": round(diff('kwh_produced_cwu'), 2),
            "kwh_consumed_heating": round(cons_h, 3),
            "kwh_consumed_cwu": round(cons_c, 3),
            "cop_heating": round(diff('kwh_produced_heating') / cons_h, 2) if cons_h > 0.05 else 0,
            "cop_cwu": round(diff('kwh_produced_cwu') / cons_c, 2) if cons_c > 0.05 else 0,
            "outdoor_avg": round(out_sum / out_count, 1) if out_count > 0 else round(active_state.get('outdoor', 0), 1)
        })
        data_changed = True

    if data_changed:
        with open(HOURLY_FILE, 'w') as f:
            json.dump(sorted(h_hist, key=lambda x: x['date'])[-18000:], f, indent=4)

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
        dev_id = systems['systems'][0]['devices'][0]['id']
        
        param_ids = ",".join([k for k in PARAMS_MAP.keys()])
        url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={param_ids}"
        points = requests.get(url, headers=headers).json()
        
        new_full_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
        for p in points:
            p_id = str(p['parameterId'])
            if p_id in PARAMS_MAP: 
                new_full_entry[PARAMS_MAP[p_id]] = p['value']

        # A. data.json
        full_history = []
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r') as f:
                try: full_history = json.load(f)
                except: full_history = []
        
        full_history.append(new_full_entry)
        with open(DATA_FILE, 'w') as f:
            json.dump(full_history[-50000:], f, indent=4)

        # B. data_stream.json
        stream_history = []
        if os.path.exists(STREAM_FILE):
            with open(STREAM_FILE, 'r') as f:
                try: stream_history = json.load(f)
                except: stream_history = []
        
        last_known_full_state = {}
        for entry in stream_history[-100:]:
            last_known_full_state.update(entry)
            
        delta_entry = create_delta_entry(new_full_entry, last_known_full_state)
        stream_history.append(delta_entry)
        
        with open(STREAM_FILE, 'w') as f:
            json.dump(stream_history[-50000:], f, indent=4)

        # C. hourly_stats.json
        update_hourly(full_history)
            
        print(f"Sukces: {new_full_entry['timestamp']}")

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
    delta_entry = {"timestamp": new_full_entry["timestamp"]}
    for key, value in new_full_entry.items():
        if key == "timestamp":
            continue
        if key not in last_known_full_state or last_known_full_state[key] != value:
            delta_entry[key] = value
    return delta_entry

def rebuild_data_stream(full_history):
    """Tworzy od zera plik data_stream.json na podstawie pełnej historii."""
    stream_history = []
    current_full_state = {}
    
    sorted_history = sorted(full_history, key=lambda x: x['timestamp'])
    
    for i, entry in enumerate(sorted_history):
        if i > 0:
            t_prev = datetime.strptime(sorted_history[i-1]['timestamp'], "%Y-%m-%d %H:%M")
            t_curr = datetime.strptime(entry['timestamp'], "%Y-%m-%d %H:%M")
            if (t_curr - t_prev).total_seconds() > 360:  # więcej niż 6 minut
                print(f"Dziura w danych: {sorted_history[i-1]['timestamp']} -> {entry['timestamp']}")
                current_full_state = {} # Reset stanu wymusi pełny zapis kolejnego punktu

        delta = create_delta_entry(entry, current_full_state)
        stream_history.append(delta)
        current_full_state.update(entry)
        
    with open(STREAM_FILE, 'w', encoding='utf-8') as f:
        json.dump(stream_history, f, indent=4)
    return stream_history

if __name__ == "__main__":
    fetch_data()