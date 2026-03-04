import requests
import json
import os
import time

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

# Mapowanie "inteligentne" na podstawie nazw technicznych z API
SMART_MAP = {
    "sh-outdoorTemp": "outdoor",
    "sh-supplyTemp": "flow",
    "sh-hwTemp": "cwu_upper",
    "sh-energyMetered": "output_power",
    "sh-returnTemp": "return_temp"
}

# Mapowanie po nazwach tekstowych (jeśli kategoria Smart Home jest pusta)
NAME_MAP = {
    "Częstotliwość sprężarki": "compressor_hz",
    "Compressor frequency": "compressor_hz",
    "Stopniominuty": "degree_minutes",
    "Degree minutes": "degree_minutes",
    "Obliczona temperatura zasilania": "calc_flow",
    "Calculated supply temp": "calc_flow"
}

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    payload = {'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET}
    response = requests.post(url, data=payload, headers={'Content-Type': 'application/x-www-form-urlencoded'})
    response.raise_for_status()
    return response.json()['access_token']

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        # Znajdź urządzenie
        systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
        dev_id = systems['systems'][0]['devices'][0]['id']

        # POBIERZ WSZYSTKIE PUNKTY (zgodnie ze Swaggerem)
        points = requests.get(f"https://api.myuplink.com/v2/devices/{dev_id}/points", headers=headers).json()
        
        new_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
        
        for p in points:
            val = p['value']
            cat = p.get('smartHomeCategory')
            name = p.get('parameterName', '')
            
            # Logika mapowania
            key = SMART_MAP.get(cat) or NAME_MAP.get(name)
            
            if key:
                # Korekta jednostek (W -> kW)
                if key in ['output_power'] and val > 100: val = round(val / 1000, 2)
                new_entry[key] = val
            
            # Dodatkowo zachowujemy surowe dane Hz i GM jeśli je znajdziemy po ID
            if p['parameterId'] == 43420: new_entry['compressor_hz'] = val
            if p['parameterId'] == 43005: new_entry['degree_minutes'] = val

        # Zapis do JSON
        filename = 'data.json'
        history = []
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                try: history = json.load(f)
                except: pass
        
        history.append(new_entry)
        history = history[-50000:]
        
        with open(filename, 'w') as f:
            json.dump(history, f, indent=4)
        
        print(f"Pobrano dane dla: {new_entry['timestamp']}")
        
    except Exception as e:
        print(f"Error: {e}"); exit(1)

if __name__ == "__main__":
    fetch_data()