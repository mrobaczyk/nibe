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
        
        # 1. Pobranie ID urządzenia
        systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
        dev_id = systems['systems'][0]['devices'][0]['id']
        
        # 2. Pobranie punktów z API
        param_ids = ",".join(PARAMS_MAP.keys())
        url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={param_ids}"
        points = requests.get(url, headers=headers).json()
        
        # 3. Przygotowanie nowego wpisu
        new_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
        for p in points:
            p_id = str(p['parameterId'])
            if p_id in PARAMS_MAP: 
                new_entry[PARAMS_MAP[p_id]] = p['value']
        
        # --- LOGIKA ESTYMACJI ENERGII ---
        
        # Pobieramy niezbędne wartości do obliczeń (z domyślnymi zerami)
        hz = new_entry.get('compressor_hz', 0)
        pump = new_entry.get('pump_speed', 0)
        out_temp = new_entry.get('outdoor', 10)
        bt12_temp = new_entry.get('supply_line_eb101', 0)  # Zasilanie bt12
        bt6_temp = new_entry.get('cwu_load', 0)     # Ładowanie zasobnika
        
        # A. Wykrywanie trybu pracy (CO vs CWU)
        # Nawet jeśli mode_cwu jest 0, sprawdzamy fizycznie po temperaturach
        is_actually_cwu = False
        if hz > 0:
            # Jeśli temperatura zasilania jest blisko temp. zasobnika i jest wysoka
            # to znaczy, że zawór trójdrożny przekierował czynnik na wężownicę CWU
            if abs(bt12_temp - bt6_temp) < 5 and bt12_temp > 32:
                is_actually_cwu = True

        # B. Obliczenie mocy chwilowej (kW) przy użyciu odpowiedniego wzoru
        est_kw = estimate_power_usage(hz, pump, out_temp, is_cwu=is_actually_cwu)
        
        # Dodajemy moc chwilową do wpisu (przydatne do wykresu Live)
        new_entry['estimated_power_kw'] = est_kw
        
        # C. Obliczenie zużycia w kWh dla interwału 5 min (1/12 godziny)
        interval_kwh = round(est_kw / 12, 4)
        
        # D. Rozdzielenie energii do odpowiednich "szufladek"
        if hz > 0:
            if is_actually_cwu:
                new_entry['kwh_consumed_cwu'] = interval_kwh
                new_entry['kwh_consumed_heating'] = 0
            else:
                new_entry['kwh_consumed_cwu'] = 0
                new_entry['kwh_consumed_heating'] = interval_kwh
        else:
            # Standby (20W) przypisujemy do ogrzewania domu
            new_entry['kwh_consumed_cwu'] = 0
            new_entry['kwh_consumed_heating'] = interval_kwh

        # 4. Zarządzanie historią w data.json
        history = []
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r') as f:
                try: history = json.load(f)
                except: history = []

        history.append(new_entry)
        
        # 5. Aktualizacja statystyk godzinowych (agregacja)
        update_hourly(history, new_entry)
        
        # Ograniczenie rozmiaru pliku (np. ostatnie 50k wpisów)
        history = history[-50000:]
        with open(DATA_FILE, 'w') as f: 
            json.dump(history, f, indent=4)
            
        print(f"Fetch sukces: {new_entry['timestamp']} | Moc: {est_kw}kW | CWU: {is_actually_cwu}")
            
    except Exception as e: 
        print(f"Error w fetch_data: {e}")
        exit(1)

def estimate_power_usage(hz, pump_speed, temp_ext, is_cwu=False):
    if hz < 1:
        return 0.02  # Standby (elektronika)

    # TWOJA KALIBRACJA: 42.5Hz CWU = 1.27kW (Współczynnik ~0.030)
    # Dla CO (podłogówka) współczynnik będzie niższy, ok. 0.024 - 0.026
    # bo opory tłoczenia czynnika są mniejsze.
    
    if is_cwu:
        base_hz_power = 0.030  # Współczynnik dla CWU (z Twojego testu)
    else:
        base_hz_power = 0.025  # Współczynnik dla CO (estymowany dla niskiego parametru)

    # Korekta temperaturowa (im mroźniej, tym ciężej)
    temp_correction = 1.0
    if temp_ext < 10:
        # Zwiększamy pobór o 0.8% na każdy stopień poniżej 10°C
        temp_correction = 1.0 + (10 - temp_ext) * 0.008

    compressor_kw = hz * base_hz_power * temp_correction
    
    # Pompa obiegowa: przy CWU zazwyczaj pracuje na wyższym biegu (GP1)
    circ_pump_kw = 0.06 * (pump_speed / 100)
    
    return round(compressor_kw + circ_pump_kw, 3)

if __name__ == "__main__":
    fetch_data()