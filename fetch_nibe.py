import requests
import json
import os
import time

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

# PEŁNA MAPA PARAMETRÓW (Aktywne + Rezerwowe)
PARAMS_MAP = {
    # --- TWOJE AKTUALNE WYKRESY ---
    "40004": "outdoor",        # BT1
    "40067": "outdoor_avg",    # BT1 śr.
    "43009": "calc_flow",      # Obliczona zasilania
    "40033": "flow",           # BT2 Zasilanie CO
    "40015": "liquid_line",    # BT17 Rura cieczowa
    "40013": "cwu_upper",      # BT7 CWU Góra
    "40014": "cwu_load",       # BT6 CWU Ładowanie
    "40032": "room_temp",      # BT50 Pokój
    "43420": "compress"hz",    # Sprężarka Hz
    "43005": "degree_minutes", # Stopniominuty
    "43437": "pump_speed",     # GP1 %
    "43416": "starts_total",   # Licznik startów
    "43414": "hours_total",    # Licznik godzin

    # --- PARAMETRY REZERWOWE (Możesz użyć w przyszłości) ---
    "40012": "cwu_lower",      # BT 6 - CWU dół / środek
    "40008": "return_temp",    # BT 3 - Powrót CO
    "40022": "suction_gas",    # BT 14 - Temp. gazu ssawnego
    "40025": "evaporator",     # BT 16 - Parownik
    "40026": "condenser_out",  # BT 12 - Skraplacz wylot
    "40771": "external_flow",  # BT 25 - Temp. za sprzęgłem
    "43103": "brine_in",       # BT 10 - Dolne źródło wejście
    "43104": "brine_out",      # BT 11 - Dolne źródło wyjście
    "43439": "brine_pump_spd", # GP 2 - Prędkość pompy dolnego źródła (%)
    "44270": "power_cons_kw",  # Aktualny pobór mocy (jeśli pompa ma licznik)
    "44362": "energy_prod_kwh",# Wyprodukowana energia (łącznie)
    "43424": "fan_speed",      # Prędkość wentylatora (dla pomp powietrznych)
    "40017": "hot_gas",        # BT 14 - Gorący gaz (ważne diagnostycznie!)
    "40071": "outdoor_raw"     # BT 1 - Surowy odczyt temp. zewn.
}

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    data = {
        'grant_type': 'client_credentials',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'scope': 'publicapi'
    }
    response = requests.post(url, data=data)
    response.raise_for_status()
    return response.json()['access_token']

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        systems_resp = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers)
        systems_resp.raise_for_status()
        systems_data = systems_resp.json()
        
        sys_id = systems_data['systems'][0]['systemId']
        dev_id = systems_data['systems'][0]['devices'][0]['deviceId']
        
        # Budujemy listę ID do zapytania (wszystkie z mapy)
        ids_str = ",".join(PARAMS_MAP.keys())
        params_url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={ids_str}"
        points_resp = requests.get(params_url, headers=headers)
        points_resp.raise_for_status()
        points = points_resp.json()
        
        new_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
        
        # Pobieramy dane i wrzucamy do JSONA tylko te, które zwróciło API
        for p in points:
            param_id = str(p['parameterId'])
            if param_id in PARAMS_MAP:
                key = PARAMS_MAP[param_id]
                new_entry[key] = p['value']
        
        filename = 'data.json'
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                try:
                    history = json.load(f)
                except:
                    history = []
        else:
            history = []
            
        history.append(new_entry)
        history = history[-52000:]
        
        with open(filename, 'w') as f:
            json.dump(history, f, indent=4)
            
        print(f"Dane zaktualizowane: {new_entry['timestamp']}")

    except Exception as e:
        print(f"Błąd: {e}")
        exit(1)

if __name__ == "__main__":
    fetch_data()