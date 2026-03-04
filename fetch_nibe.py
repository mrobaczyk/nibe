import requests
import json
import os
import time

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

# Mapa parametrów (ID: Nazwa w JSON)
PARAMS_MAP = {
    "40004": "outdoor",       # BT1
    "40067": "outdoor_avg",   # BT1 śr.
    "43009": "calc_flow",     # Obliczona
    "40033": "flow",          # BT2
    "40015": "liquid_line",   # BT17
    "40013": "cwu_upper",     # BT7 (Góra)
    "40014": "cwu_load",      # BT6 (Ładowanie)
    "40032": "room_temp",     # BT50
    "43420": "compressor_hz", # Hz
    "43005": "degree_minutes",# GM
    "43437": "pump_speed",    # GP1 (%)
    "43416": "starts_total",  # Licznik uruchomień
    "43414": "hours_total"    # Licznik godzin
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
    return response.json()['access_token']

def fetch_data():
    token = get_token()
    headers = {'Authorization': f'Bearer {token}'}
    
    systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
    sys_id = systems['systems'][0]['systemId']
    dev_id = systems['systems'][0]['devices'][0]['deviceId']
    
    ids_str = ",".join(PARAMS_MAP.keys())
    params_url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={ids_str}"
    points = requests.get(params_url, headers=headers).json()
    
    new_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
    
    for p in points:
        key = PARAMS_MAP.get(str(p['parameterId']))
        if key:
            new_entry[key] = p['value']
    
    try:
        with open('data.json', 'r') as f:
            history = json.load(f)
    except:
        history = []
        
    history.append(new_entry)
    history = history[-3000:] # Historia na ok. 2 miesiące
    
    with open('data.json', 'w') as f:
        json.dump(history, f, indent=4)

if __name__ == "__main__":
    fetch_data()