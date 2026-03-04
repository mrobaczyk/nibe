import requests
import json
import os
import time

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

# Twarde mapowanie ID, które sprawdziliśmy, że u Ciebie działają
# + Dodatkowe ID dla Twojego modelu F2040
PARAMS_MAP = {
    "40004": "outdoor",
    "40067": "outdoor_avg",
    "43009": "calc_flow",
    "40033": "flow",
    "40013": "cwu_upper",
    "40014": "cwu_load",
    "43420": "compressor_hz",
    "43005": "degree_minutes",
    "44300": "output_power",
    "44302": "input_power",
    "40032": "room_temp",
    "43437": "pump_speed"
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
        
        # Pobierz system i urządzenie
        systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
        dev_id = systems['systems'][0]['devices'][0]['id']

        # Pobierz wszystkie punkty
        points = requests.get(f"https://api.myuplink.com/v2/devices/{dev_id}/points", headers=headers).json()
        
        new_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
        
        for p in points:
            p_id = str(p['parameterId'])
            val = p['value']
            
            # Sprawdź czy ID jest w naszej mapie
            if p_id in PARAMS_MAP:
                key = PARAMS_MAP[p_id]
                
                # Korekta jednostek dla mocy (W -> kW)
                if key in ['output_power', 'input_power'] and val > 100:
                    val = round(val / 1000, 2)
                
                new_entry[key] = val

        # Dodatkowe zabezpieczenie: jeśli brakuje kluczowych danych, spróbuj kategorii
        if len(new_entry) < 5:
            cat_map = {"sh-outdoorTemp": "outdoor", "sh-supplyTemp": "flow", "sh-hwTemp": "cwu_upper"}
            for p in points:
                cat = p.get('smartHomeCategory')
                if cat in cat_map and cat_map[cat] not in new_entry:
                    new_entry[cat_map[cat]] = p['value']

        # Zapis do JSON
        filename = 'data.json'
        history = []
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                try: history = json.load(f)
                except: history = []
        
        history.append(new_entry)
        history = history[-50000:]
        
        with open(filename, 'w') as f:
            json.dump(history, f, indent=4)
        
        print(f"Sukces. Zapisano {len(new_entry)-1} parametrów.")
        
    except Exception as e:
        print(f"Error: {e}"); exit(1)

if __name__ == "__main__":
    fetch_data()