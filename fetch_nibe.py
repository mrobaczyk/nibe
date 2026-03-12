import requests
import json
import os
import time
from datetime import datetime, timedelta

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')
DATA_FILE = 'data.json'
DAILY_FILE = 'daily_stats.json'

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
    "44073": "op_time_hotwater",
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

def update_daily(history, new_entry):
    if not history: return
    
    d_hist = []
    if os.path.exists(DAILY_FILE):
        with open(DAILY_FILE, 'r') as f: 
            try: d_hist = json.load(f)
            except: d_hist = []
    
    today_date = datetime.now().strftime("%Y-%m-%d")
    # Pobieramy unikalne daty z historii, pomijając dzień dzisiejszy (statystyki zamykamy po północy)
    all_dates = sorted(list(set(h['timestamp'].split(' ')[0] for h in history)))
    
    for date_to_check in all_dates:
        if date_to_check == today_date: continue
        
        # Jeśli nie ma jeszcze tej daty w pliku statystyk dziennych
        if not any(d['date'] == date_to_check for d in d_hist):
            day_data = [h for h in history if h['timestamp'].startswith(date_to_check)]
            
            if len(day_data) >= 2:
                first, last = day_data[0], day_data[-1]
                
                try:
                    # 1. PRODUKCJA ENERGII (Różnica liczników z pompy - kWh)
                    prod_h = round(float(last.get('kwh_heating', 0) - first.get('kwh_heating', 0)), 1)
                    prod_c = round(float(last.get('kwh_cwu', 0) - first.get('kwh_cwu', 0)), 1)
                    
                    # 2. ZUŻYCIE ENERGII (Suma wyliczonych interwałów - kWh)
                    # Sumujemy wszystkie 5-minutowe kawałki zapisane w fetch_data
                    cons_h = round(sum(h.get('kwh_consumed_heating', 0) for h in day_data), 2)
                    cons_c = round(sum(h.get('kwh_consumed_cwu', 0) for h in day_data), 2)
                    
                    # 3. CZAS PRACY (Różnica liczników - godziny)
                    work_h = round(float(last.get('op_time_heating', 0) - first.get('op_time_heating', 0)), 1)
                    work_c = round(float(last.get('op_time_cwu', 0) - first.get('op_time_cwu', 0)), 1)
                    # Sam czas CO to różnica totalu i cwu
                    pure_heating_time = round(work_h - work_c, 1)
                    
                    # 4. OBLICZENIE COP (Produkcja / Zużycie)
                    cop_h = round(prod_h / cons_h, 2) if cons_h > 0 else 0
                    cop_c = round(prod_c / cons_c, 2) if cons_c > 0 else 0

                    summary = {
                        "date": date_to_check,
                        "starts": int(last.get('starts', 0) - first.get('starts', 0)),
                        "work_hours_heating": work_h,
                        "work_hours_cwu": work_c,
                        "kwh_produced_heating": prod_h,
                        "kwh_produced_cwu": prod_c,
                        "kwh_consumed_heating": cons_h,
                        "kwh_consumed_cwu": cons_c,
                        "cop_heating": cop_h,
                        "cop_cwu": cop_c,
                        "outdoor_avg": round(sum(h.get('outdoor', 0) for h in day_data) / len(day_data), 1)
                    }
                    
                    d_hist.append(summary)
                    print(f"Sukces: Agregacja za {date_to_check} (COP CO: {cop_h}, COP CWU: {cop_c})")
                except Exception as e:
                    print(f"Błąd przy obliczaniu {date_to_check}: {e}")

    # Zapis do pliku
    with open(DAILY_FILE, 'w') as f: 
        json.dump(d_hist, f, indent=4)

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
        
        # 5. Aktualizacja statystyk dziennych (agregacja)
        update_daily(history, new_entry)
        
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