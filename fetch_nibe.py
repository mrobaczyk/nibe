import requests
import json
import os
import time

# Poświadczenia z GitHub Secrets
CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

# Mapa parametrów
PARAMS_MAP = {
    "40004": "outdoor",        # BT1 Temp. zewn.
    "40067": "outdoor_avg",    # BT1 Średnia 24h
    "43009": "calc_flow",      # Temp. obliczona
    "40033": "flow",           # BT2 Zasilanie CO
    "40015": "liquid_line",    # BT17 Rura cieczowa
    "40013": "cwu_upper",      # BT7 CWU Góra
    "40014": "cwu_load",       # BT6 CWU Ładowanie
    "40032": "room_temp",      # BT50 Pokój
    "43420": "compressor_hz",  # Sprężarka Hz
    "43005": "degree_minutes", # Stopniominuty
    "43437": "pump_speed",     # GP1 Prędkość pompy (%)
    "44300": "output_power",   # EMK: Moc oddawana (kW)
    "44302": "input_power",    # EMK: Moc pobierana (kW)
    "43416": "starts_total",   # Licznik startów
    "43414": "hours_total"     # Licznik godzin
}

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    payload = {
        'grant_type': 'client_credentials',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET
    }
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    
    response = requests.post(url, data=payload, headers=headers)
    
    if response.status_code != 200:
        print(f"BŁĄD SERWERA NIBE: {response.status_code}")
        print(f"TREŚĆ BŁĘDU: {response.text}")
        response.raise_for_status()
        
    return response.json()['access_token']

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        # 1. Pobierz systemy
        systems_resp = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers)
        systems_resp.raise_for_status()
        systems_data = systems_resp.json()
        
        if not systems_data.get('systems'):
            print("BŁĄD: Nie znaleziono żadnych systemów!")
            return

        sys_id = None
        dev_id = None
        
        for system in systems_data['systems']:
            if system.get('devices'):
                sys_id = system['systemId']
                dev_id = system['devices'][0]['deviceId']
                break
        
        if not dev_id:
            print("BŁĄD: Brak urządzeń w systemach!")
            return

        print(f"Połączono: Sys {sys_id}, Dev {dev_id}")

        # 2. Pobierz parametry
        ids_str = ",".join(PARAMS_MAP.keys())
        params_url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={ids_str}"
        points_resp = requests.get(params_url, headers=headers)
        points_resp.raise_for_status()
        points = points_resp.json()
        
        new_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
        for p in points:
            key = PARAMS_MAP.get(str(p['parameterId']))
            if key:
                new_entry[key] = p['value']
        
        # 3. Zapis do pliku
        filename = 'data.json'
        history = []
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                try:
                    history = json.load(f)
                except:
                    history = []
            
        history.append(new_entry)
        history = history[-52000:] # Pół roku historii
        
        with open(filename, 'w') as f:
            json.dump(history, f, indent=4)
            
        print(f"Sukces! Dodano wpis z {new_entry['timestamp']}")

    except Exception as e:
        print(f"Wystąpił błąd podczas pobierania danych: {e}")
        exit(1)

if __name__ == "__main__":
    fetch_data()