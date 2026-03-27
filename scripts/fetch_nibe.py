import requests
import json
import os
import time
from datetime import datetime, timedelta

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

def update_hourly(history):
    """
    Agreguje dane surowe do statystyk godzinowych.
    Oblicza precyzyjną średnią temperaturę zewnętrzną oraz statystyki pracy.
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
    
    # 1. Sortujemy historię chronologicznie
    history = sorted(history, key=lambda x: x['timestamp'])
    current_hour_str = datetime.now().strftime("%Y-%m-%d %H:00")
    
    # Wyciągamy unikalne godziny obecne w danych
    all_hours = sorted(list(set(h['timestamp'][:13] + ":00" for h in history)))
    
    data_changed = False
    
    # Hydrator - trzyma ostatnie znane wartości każdego parametru
    active_state = {}

    for hour_to_check in all_hours:
        # Nie procesujemy bieżącej godziny (czekamy aż się skończy)
        if hour_to_check == current_hour_str:
            break 
        
        # Sprawdzamy, czy ta godzina już istnieje
        existing_idx = next((i for i, d in enumerate(h_hist) if d['date'] == hour_to_check), None)
        
        # Filtrujemy dane dla tej godziny
        hour_data = [h for h in history if h['timestamp'].startswith(hour_to_check[:13])]
        if not hour_data:
            continue

        # Aktualizacja stanu dla już istniejących godzin
        if existing_idx is not None:
            for h in hour_data:
                active_state.update(h)
            continue

        # --- OBLICZENIA DLA NOWEJ GODZINY ---
        state_at_start_of_hour = active_state.copy()
        
        total_hour_cons_h = 0.0
        total_hour_cons_c = 0.0
        
        # Zmienne do obliczenia precyzyjnej średniej temperatury
        outdoor_sum = 0.0
        outdoor_points = 0

        for h in hour_data:
            # Punkt odniesienia dla delty produkcji
            prev_point_state = active_state.copy()
            
            # AKTUALIZACJA STANU
            active_state.update(h)
            
            # Pobieramy wartości z aktywnego stanu
            hz = active_state.get('compressor_hz', 0)
            p_speed = active_state.get('pump_speed', 0)
            out_temp = active_state.get('outdoor', 0) # Tutaj 0 jako fallback, ale active_state powinien mieć już dane
            
            # --- ZBIERANIE DANYCH DO ŚREDNIEJ ---
            outdoor_sum += float(out_temp)
            outdoor_points += 1
            
            # 1. Estymacja poboru mocy
            est_kw = estimate_power_usage(hz, p_speed, out_temp)
            step_kwh = est_kw / 12  # 5 min = 1/12h

            # 2. Podział na Ogrzewanie / CWU
            d_prod_h = max(0, float(active_state.get('kwh_produced_heating', 0)) - 
                             float(prev_point_state.get('kwh_produced_heating', 0)))
            d_prod_c = max(0, float(active_state.get('kwh_produced_cwu', 0)) - 
                             float(prev_point_state.get('kwh_produced_cwu', 0)))

            total_delta = d_prod_h + d_prod_c

            if total_delta > 0:
                total_hour_cons_h += step_kwh * (d_prod_h / total_delta)
                total_hour_cons_c += step_kwh * (d_prod_c / total_delta)
            else:
                is_cwu = active_state.get('current_hot_water_mode', 0) > 0
                if is_cwu and hz > 0:
                    total_hour_cons_c += step_kwh
                else:
                    total_hour_cons_h += step_kwh

        # 3. Obliczenie różnic (delt) dla całej godziny
        def get_hour_diff(key):
            val_now = float(active_state.get(key, 0))
            val_prev = float(state_at_start_of_hour.get(key, 0))
            return max(0, val_now - val_prev)

        diff_prod_h = get_hour_diff('kwh_produced_heating')
        diff_prod_c = get_hour_diff('kwh_produced_cwu')
        
        # --- OBLICZENIE ŚREDNIEJ TEMPERATURY ---
        avg_temp = round(outdoor_sum / outdoor_points, 1) if outdoor_points > 0 else 0.0

        # 4. Rekord podsumowujący
        summary = {
            "date": hour_to_check,
            "starts": int(get_hour_diff('starts')),
            "work_hours_heating": round(max(0, get_hour_diff('op_time_total') - get_hour_diff('op_time_cwu')), 2),
            "work_hours_cwu": round(get_hour_diff('op_time_cwu'), 2),
            "kwh_produced_heating": round(diff_prod_h, 2),
            "kwh_produced_cwu": round(diff_prod_c, 2),
            "kwh_consumed_heating": round(total_hour_cons_h, 3),
            "kwh_consumed_cwu": round(total_hour_cons_c, 3),
            "cop_heating": round(diff_prod_h / total_hour_cons_h, 2) if total_hour_cons_h > 0.05 else 0,
            "cop_cwu": round(diff_prod_c / total_hour_cons_c, 2) if total_hour_cons_c > 0.05 else 0,
            "outdoor_avg": avg_temp
        }

        h_hist.append(summary)
        data_changed = True

    if data_changed:
        h_hist = sorted(h_hist, key=lambda x: x['date'])[-18000:]
        with open(HOURLY_FILE, 'w') as f: 
            json.dump(h_hist, f, indent=4)

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        # 1. Pobieranie danych z API myUplink
        systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
        dev_id = systems['systems'][0]['devices'][0]['id']
        param_ids = ",".join(PARAMS_MAP.keys())
        url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={param_ids}"
        points = requests.get(url, headers=headers).json()
        
        # 1. Tworzymy świeży snapshot z API
        new_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
        for p in points:
            p_id = str(p['parameterId'])
            if p_id in PARAMS_MAP: 
                new_entry[PARAMS_MAP[p_id]] = p['value']

        # --- SEKCJA DATA_STREAM (ODCHUDZANIE) ---
        stream_file = "data_stream.json"
        stream_history = []
        if os.path.exists(stream_file):
            with open(stream_file, 'r', encoding='utf-8') as f:
                try: stream_history = json.load(f)
                except: stream_history = []

        # LOGIKA PAMIĘCI: Odtwarzamy ostatni znany stan pompy z całej historii streamu
        last_full_state = {}
        for entry in stream_history:
            for key, value in entry.items():
                if key != "timestamp":
                    last_full_state[key] = value

        # Przygotowujemy wpis do zapisu
        entry_to_save = {"timestamp": new_entry["timestamp"]}
        
        # Porównujemy KAŻDY parametr z naszą "pamięcią" (last_full_state)
        for key, value in new_entry.items():
            if key == "timestamp": continue
            
            # ZAPISUJEMY TYLKO JEŚLI:
            # a) Parametru nigdy nie było w pliku
            # b) Wartość się zmieniła względem ostatniego zapisu
            if key not in last_full_state or last_full_state[key] != value:
                entry_to_save[key] = value

        # Dodajemy odchudzony wpis do historii streamu
        stream_history.append(entry_to_save)

        # Zapisujemy (z indentacją dla Twojej wygody)
        with open(stream_file, 'w', encoding='utf-8') as f:
            json.dump(stream_history[-50000:], f, indent=4)


        # --- SEKCJA DATA.JSON (PEŁNY BACKUP) ---
        full_history = []
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                try: full_history = json.load(f)
                except: full_history = []
        
        full_history.append(new_entry)
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(full_history[-50000:], f, indent=4)

        # Aktualizacja godzinowych (zawsze na pełnych danych!)
        update_hourly(full_history)
            
        print(f"Sukces: Zapisano odchudzony wpis o {new_entry['timestamp']}")

    except Exception as e: 
        print(f"Error: {e}")

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

if __name__ == "__main__":
    fetch_data()