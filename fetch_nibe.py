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
    "40008": "supply_line",
    "40012": "return_line",
    "40013": "cwu_upper",
    "40014": "cwu_load",
    "40033": "room_temperature",
    "40067": "outdoor_avg",
    "40071": "bt25_temp",
    "40941": "degree_minutes",
    "43009": "calc_flow",
    "43109": "current_hot_water_mode",
    "44055": "return_line_eb101",
    "44058": "supply_line_eb101",
    "44060": "liquid_line",
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
    
    curr_dt = datetime.strptime(new_entry['timestamp'], "%Y-%m-%d %H:%M")
    yesterday_date = (curr_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    
    d_hist = []
    if os.path.exists(DAILY_FILE):
        with open(DAILY_FILE, 'r') as f: 
            try: d_hist = json.load(f)
            except: d_hist = []
    
    if not any(d['date'] == yesterday_date for d in d_hist):
        day_data = [h for h in history if h['timestamp'].startswith(yesterday_date)]
        
        if len(day_data) >= 2:
            first, last = day_data[0], day_data[-1]
            summary = {
                "date": yesterday_date,
                "starts": int(last.get('starts', 0) - first.get('starts', 0)),
                "work_hours": round(float(last.get('op_time_total', 0) - first.get('op_time_total', 0)), 1),
                "kwh_total": round(float((last.get('kwh_heating', 0) + last.get('kwh_cwu', 0)) - 
                                       (first.get('kwh_heating', 0) + first.get('kwh_cwu', 0))), 1),
                "kwh_cwu": round(float(last.get('kwh_cwu', 0) - first.get('kwh_cwu', 0)), 1)
            }
            d_hist.append(summary)
            with open(DAILY_FILE, 'w') as f: 
                json.dump(d_hist, f, indent=4)
            print(f"Sukces: Dodano statystyki za {yesterday_date}")

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
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
        
        history = []
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r') as f:
                try: history = json.load(f)
                except: history = []
        
        update_daily(history, new_entry)
        
        history.append(new_entry)
        history = history[-50000:]
        with open(DATA_FILE, 'w') as f: 
            json.dump(history, f, indent=4)
            
    except Exception as e: 
        print(f"Error: {e}")
        exit(1)

if __name__ == "__main__":
    fetch_data()