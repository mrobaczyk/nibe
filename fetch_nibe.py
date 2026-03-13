import requests
import json
import os
import time
from datetime import datetime, timedelta

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')
DATA_FILE = 'data.json'
HOURLY_FILE = 'hourly_stats.json'

PARAMS_MAP = {
    "40004": "outdoor",
    "40008": "supply_line", #bt2
    "40012": "return_line", #bt3
    "40013": "cwu_upper", #bt7
    "40014": "cwu_load", #bt6
    "40033": "room_temperature", #bt50
    "40067": "outdoor_avg",
    "40071": "bt25_temp", #bt25
    "40941": "degree_minutes",
    "43009": "calc_flow",
    "43109": "current_hot_water_mode",
    "44055": "return_line_eb101", #eb101-bt3
    "44058": "supply_line_eb101", #eb101-bt12
    "44060": "liquid_line", #eb101-bt15
    "44069": "starts",
    "44071": "op_time_total",
    "44073": "op_time_cwu",
    "44298": "kwh_cwu",
    "44300": "kwh_heating",
    "44396": "pump_speed",
    "44701": "compressor_hz",
    "44702": "protection_mode_compressor",
    "44703": "defrosting",
    "47007": "heat_curve",
    "47011": "heat_offset",
    "47041": "hot_water_demand",
    "47050": "activated",
    "47051": "period",
    "47206": "start_gm_level",
    "47377": "filter_time",
    "48132": "hot_water_boost",
    "49909": "hot_water_boost_start_time",
    "50004": "temp_lux"
}

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    payload = {'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET}
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    response = requests.post(url, data=payload, headers=headers)
    response.raise_for_status()
    return response.json()['access_token']

def update_hourly(history, new_entry):
    """
    Agreguje dane surowe do statystyk godzinowych.
    Odporna na brakujące klucze w data.json oraz piki liczników na starcie.
    """
    if not history:
        return
    
    h_hist = []
    if os.path.exists(HOURLY_FILE):
        with open(HOURLY_FILE, 'r') as f: 
            try:
                h_hist = json.load(f)
            except:
                h_hist = []
    
    history = sorted(history, key=lambda x: x['timestamp'])
    current_hour_str = datetime.now().strftime("%Y-%m-%d %H:00")
    all_hours = sorted(list(set(h['timestamp'][:13] + ":00" for h in history)))
    
    data_changed = False
    prev_hour_last_entry = None

    for hour_to_check in all_hours:
        if hour_to_check == current_hour_str:
            continue
        
        hour_data = [h for h in history if h['timestamp'].startswith(hour_to_check[:13])]
        if not hour_data:
            continue

        current_last = hour_data[-1]

        existing_idx = next((i for i, d in enumerate(h_hist) if d['date'] == hour_to_check), None)
        if existing_idx is not None:
            prev_hour_last_entry = current_last
            continue

        def get_diff(key):
            if prev_hour_last_entry is None:
                return 0.0
            
            val_now = current_last.get(key)
            val_prev = prev_hour_last_entry.get(key)
            
            if val_now is None or val_prev is None:
                return 0.0
            
            try:
                diff = float(val_now) - float(val_prev)
                return max(0, diff)
            except (ValueError, TypeError):
                return 0.0

        diffs = {
            'starts': int(get_diff('starts')),
            'k_prod_h': get_diff('kwh_heating'),
            'k_prod_c': get_diff('kwh_cwu'),
            't_total': get_diff('op_time_total'),
            't_cwu': get_diff('op_time_cwu')
        }

        cons_h = round(sum(h.get('kwh_consumed_heating', 0) for h in hour_data), 3)
        cons_c = round(sum(h.get('kwh_consumed_cwu', 0) for h in hour_data), 3)

        work_h = round(max(0, diffs['t_total'] - diffs['t_cwu']), 2)
        work_c = round(diffs['t_cwu'], 2)
        cop_h = round(diffs['k_prod_h'] / cons_h, 2) if cons_h > 0.05 else 0
        cop_c = round(diffs['k_prod_c'] / cons_c, 2) if cons_c > 0.05 else 0

        summary = {
            "date": hour_to_check,
            "starts": diffs['starts'],
            "work_hours_heating": work_h,
            "work_hours_cwu": work_c,
            "kwh_produced_heating": round(diffs['k_prod_h'], 2),
            "kwh_produced_cwu": round(diffs['k_prod_c'], 2),
            "kwh_consumed_heating": cons_h,
            "kwh_consumed_cwu": cons_c,
            "cop_heating": cop_h,
            "cop_cwu": cop_c,
            "outdoor_avg": round(sum(h.get('outdoor', 0) for h in hour_data) / len(hour_data), 1)
        }

        h_hist.append(summary)
        data_changed = True
        
        prev_hour_last_entry = current_last

    if data_changed:
        h_hist = sorted(h_hist, key=lambda x: x['date'])[-18000:]
        with open(HOURLY_FILE, 'w') as f: 
            json.dump(h_hist, f, indent=4)

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        # Pobieranie punktów
        systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
        dev_id = systems['systems'][0]['devices'][0]['id']
        param_ids = ",".join(PARAMS_MAP.keys())
        url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={param_ids}"
        points = requests.get(url, headers=headers).json()
        
        new_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
        for p in points:
            p_id = str(p['parameterId'])
            if p_id in PARAMS_MAP: 
                new_entry[PARAMS_MAP[p_id]] = p['value']

        # Pobieranie historii do obliczenia różnic (delt)
        history = []
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r') as f:
                try: history = json.load(f)
                except: history = []

        delta_prod_h = 0.0
        delta_prod_c = 0.0
        if history:
            last_e = history[-1]
            # Obliczamy faktyczny przyrost liczników energii z pompy
            delta_prod_h = max(0, float(new_entry.get('kwh_heating', 0)) - float(last_e.get('kwh_heating', 0)))
            delta_prod_c = max(0, float(new_entry.get('kwh_cwu', 0)) - float(last_e.get('kwh_cwu', 0)))

        # Estymacja zużycia prądu
        est_kw = estimate_power_usage(new_entry.get('compressor_hz', 0), 
                                      new_entry.get('pump_speed', 0), 
                                      new_entry.get('outdoor', 10))
        interval_kwh_total = round(est_kw / 12, 4)

        # SPRAWIEDLIWY PODZIAŁ (To usuwa błąd 24.5 i 36.1)
        total_delta = delta_prod_h + delta_prod_c
        if total_delta > 0:
            new_entry['kwh_consumed_heating'] = round(interval_kwh_total * (delta_prod_h / total_delta), 4)
            new_entry['kwh_consumed_cwu'] = round(interval_kwh_total * (delta_prod_c / total_delta), 4)
        else:
            # Standby przypisujemy do ogrzewania
            new_entry['kwh_consumed_heating'] = interval_kwh_total
            new_entry['kwh_consumed_cwu'] = 0.0

        new_entry['estimated_power_kw'] = est_kw
        history.append(new_entry)
        update_hourly(history, new_entry)
        
        with open(DATA_FILE, 'w') as f: 
            json.dump(history[-50000:], f, indent=4)
            
    except Exception as e: 
        print(f"Error: {e}")

def estimate_power_usage(hz, pump_speed, temp_ext):
    """
    Oblicza sumaryczny pobór mocy przez pompę. 
    Nie musi już rozróżniać trybu, bo podziału dokonujemy na podstawie liczników ciepła.
    """
    if hz < 1:
        return 0.02  # Standby (elektronika)

    # Średni współczynnik (możesz go dostroić między 0.025 a 0.030)
    base_hz_coeff = 0.028 

    # Korekta temperaturowa (im zimniej na zewnątrz, tym wyższy pobór prądu przy tych samych Hz)
    temp_correction = 1.0
    if temp_ext < 10:
        temp_correction = 1.0 + (10 - temp_ext) * 0.008

    compressor_kw = hz * base_hz_coeff * temp_correction
    circ_pump_kw = 0.06 * (pump_speed / 100)
    
    return round(compressor_kw + circ_pump_kw, 3)

if __name__ == "__main__":
    fetch_data()