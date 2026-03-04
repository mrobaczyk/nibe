import requests
import json
import os
import time

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

PARAMS_MAP = {
    "40004": "outdoor",
    "40013": "cwu_upper",
    "40014": "cwu_load",
    "40033": "flow",
    "40067": "outdoor_avg",
    "40071": "bt25_temp",
    "40941": "degree_minutes",
    "43009": "calc_flow",
    "44069": "starts",
    "44071": "op_time_total",
    "44073": "op_time_hotwater",
    "44396": "pump_speed",
    "44701": "compressor_hz",
    "44703": "defrosting",
    "47007": "heat_curve",
    "47011": "heat_offset",
    "47041": "cwu_mode_current",
    "47206": "start_gm_level",
    "47377": "filter_time",
    "50004": "temp_lux"
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
        dev_id = systems['systems'][0]['devices'][0]['id']
        
        # Wymuszamy pobranie konkretnych parametrów
        param_ids = ",".join(PARAMS_MAP.keys())
        url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={param_ids}"
        points = requests.get(url, headers=headers).json()
        
        new_entry = {"timestamp": time.strftime("%Y-%m-%d %H:%M")}
        for p in points:
            p_id = str(p['parameterId'])
            if p_id in PARAMS_MAP:
                new_entry[PARAMS_MAP[p_id]] = p['value']

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
    except Exception as e:
        print(f"Error: {e}"); exit(1)

if __name__ == "__main__":
    fetch_data()