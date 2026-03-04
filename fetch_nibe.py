import requests
import json
import os
import time

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

# Zaktualizowana mapa dla układu VVM + F2040
PARAMS_MAP = {
    "40004": "outdoor",        
    "40067": "outdoor_avg",    
    "43009": "calc_flow",      
    "40033": "flow",           
    "40013": "cwu_upper",      
    "40014": "cwu_load",       
    "40032": "room_temp",      
    "43420": "compressor_hz",  # Częstotliwość dla serii S/VVM
    "43005": "degree_minutes", # Stopniominuty
    "43437": "pump_speed",     
    "44300": "output_power",   
    "44302": "input_power"
}

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    payload = {'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET}
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    response = requests.post(url, data=payload, headers=headers)
    response.raise_for_status()
    return response.json()['access_token']

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
        
        dev_id = None
        for s in systems.get('systems', []):
            devices = s.get('devices', [])
            if devices:
                dev_id = devices[0].get('id')
                break
        
        if not dev_id: return

        ids_str = ",".join(PARAMS_MAP.keys())
        params_url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={ids_str}"
        points = requests.get(params_url, headers=headers).json()
        
        new_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
        for p in points:
            key = PARAMS_MAP.get(str(p['parameterId']))
            if key:
                val = p['value']
                # Korekta jednostek: jeśli moc > 100, to prawdopodobnie Waty -> zamień na kW
                if key in ['output_power', 'input_power'] and val > 100:
                    val = round(val / 1000, 2)
                new_entry[key] = val
        
        filename = 'data.json'
        history = []
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                try: history = json.load(f)
                except: pass
            
        history.append(new_entry)
        history = history[-52000:]
        
        with open(filename, 'w') as f:
            json.dump(history, f, indent=4)
        print(f"Zapisano: {new_entry['timestamp']}")
    except Exception as e:
        print(f"Błąd: {e}"); exit(1)

if __name__ == "__main__":
    fetch_data()