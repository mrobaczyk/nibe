import requests
import json
import os
import time
from datetime import datetime, timedelta

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(BASE_DIR, 'data', 'data.json')
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
    #"44699": "high_pressure", #eb101-bp4
    #"44700": "low_pressure", #eb101-bp8
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
    Liczy zużycie prądu w locie na podstawie Hz i temperatur.
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
    
    # Sortujemy historię chronologicznie
    history = sorted(history, key=lambda x: x['timestamp'])
    current_hour_str = datetime.now().strftime("%Y-%m-%d %H:00")
    
    # Wyciągamy unikalne godziny obecne w danych
    all_hours = sorted(list(set(h['timestamp'][:13] + ":00" for h in history)))
    
    data_changed = False
    prev_hour_last_entry = None

    for hour_to_check in all_hours:
        # Nie procesujemy bieżącej godziny (czekamy, aż się zakończy)
        if hour_to_check == current_hour_str:
            continue
        
        # Sprawdzamy, czy ta godzina już istnieje w hourly_stats.json
        existing_idx = next((i for i, d in enumerate(h_hist) if d['date'] == hour_to_check), None)
        
        # Filtrujemy dane tylko dla tej konkretnej godziny
        hour_data = [h for h in history if h['timestamp'].startswith(hour_to_check[:13])]
        if not hour_data:
            continue

        current_last = hour_data[-1]

        # Jeśli godzina już jest w pliku, zapamiętujemy jej ostatni wpis i idziemy dalej
        if existing_idx is not None:
            prev_hour_last_entry = current_last
            continue

        # --- OBLICZENIA DLA NOWEJ GODZINY ---
        total_hour_cons_h = 0.0
        total_hour_cons_c = 0.0
        
        # Przechodzimy przez każdy wpis w danej godzinie, by policzyć zużycie
        for i, h in enumerate(hour_data):
            # Ustalamy punkt odniesienia do obliczenia delty produkcji
            # Dla pierwszego wpisu w godzinie bierzemy ostatni wpis z poprzedniej godziny
            prev_point = hour_data[i-1] if i > 0 else prev_hour_last_entry
            
            # 1. Estymacja poboru mocy (kW) i zużycia w interwale (kWh)
            est_kw = estimate_power_usage(
                h.get('compressor_hz', 0), 
                h.get('pump_speed', 0), 
                h.get('outdoor', 10)
            )
            step_kwh = est_kw / 12  # 5 minut = 1/12 godziny

            # 2. Podział na Ogrzewanie / CWU na podstawie przyrostu produkcji energii
            delta_prod_h = 0.0
            delta_prod_c = 0.0
            
            if prev_point:
                delta_prod_h = max(0, float(h.get('kwh_produced_heating', 0)) - float(prev_point.get('kwh_produced_heating', 0)))
                delta_prod_c = max(0, float(h.get('kwh_produced_cwu', 0)) - float(prev_point.get('kwh_produced_cwu', 0)))

            total_delta = delta_prod_h + delta_prod_c

            if total_delta > 0:
                # Proporcjonalny podział zużytego prądu
                total_hour_cons_h += step_kwh * (delta_prod_h / total_delta)
                total_hour_cons_c += step_kwh * (delta_prod_c / total_delta)
            else:
                # Jeśli brak produkcji energii (np. standby lub start sprężarki), 
                # patrzymy na tryb pracy i Hz
                is_cwu_mode = h.get('current_hot_water_mode', 0) > 0
                if is_cwu_mode and h.get('compressor_hz', 0) > 0:
                    total_hour_cons_c += step_kwh
                else:
                    total_hour_cons_h += step_kwh

        # 3. Obliczenie różnic (delt) dla pozostałych liczników (Starts, OpTime, Production)
        def get_diff(key):
            if prev_hour_last_entry is None:
                return 0.0
            val_now = current_last.get(key)
            val_prev = prev_hour_last_entry.get(key)
            if val_now is None or val_prev is None:
                return 0.0
            return max(0, float(val_now) - float(val_prev))

        diff_prod_h = get_diff('kwh_produced_heating')
        diff_prod_c = get_diff('kwh_produced_cwu')
        
        # 4. Przygotowanie rekordu podsumowującego godzinę
        summary = {
            "date": hour_to_check,
            "starts": int(get_diff('starts')),
            "work_hours_heating": round(max(0, get_diff('op_time_total') - get_diff('op_time_cwu')), 2),
            "work_hours_cwu": round(get_diff('op_time_cwu'), 2),
            "kwh_produced_heating": round(diff_prod_h, 2),
            "kwh_produced_cwu": round(diff_prod_c, 2),
            "kwh_consumed_heating": round(total_hour_cons_h, 3),
            "kwh_consumed_cwu": round(total_hour_cons_c, 3),
            "cop_heating": round(diff_prod_h / total_hour_cons_h, 2) if total_hour_cons_h > 0.05 else 0,
            "cop_cwu": round(diff_prod_c / total_hour_cons_c, 2) if total_hour_cons_c > 0.05 else 0,
            "outdoor_avg": round(sum(h.get('outdoor', 0) for h in hour_data) / len(hour_data), 1)
        }

        h_hist.append(summary)
        data_changed = True
        prev_hour_last_entry = current_last

    # Zapisujemy zmiany, jeśli doszła nowa pełna godzina
    if data_changed:
        # Sortujemy i ograniczamy historię (np. do ~2 lat danych godzinowych)
        h_hist = sorted(h_hist, key=lambda x: x['date'])[-18000:]
        with open(HOURLY_FILE, 'w') as f: 
            json.dump(h_hist, f, indent=4)

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        # Pobieranie punktów (bez zmian)
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

        # Pobieranie historii
        history = []
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r') as f:
                try: history = json.load(f)
                except: history = []

        # WAŻNE: Nie dodajemy już kwh_consumed do new_entry! 
        # Zapisujemy do data.json tylko "czyste" dane z pompy.
        history.append(new_entry)
        
        # Przekazujemy historię do update_hourly - tam wyliczymy zużycie dla godzin
        update_hourly(history)
        
        # Zapisujemy czysty plik danych
        with open(DATA_FILE, 'w') as f: 
            json.dump(history[-50000:], f, indent=4)
            
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