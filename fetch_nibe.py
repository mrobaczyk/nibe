import requests
import json
import os
import time

# Dane z Secrets
CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

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
    
    # 1. Pobierz systemy
    systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
    sys_id = systems['systems'][0]['systemId']
    dev_id = systems['systems'][0]['devices'][0]['deviceId']
    
    # 2. Pobierz parametry (Outdoor: 40004, Flow: 40033)
    params_url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters=40004,40033"
    points = requests.get(params_url, headers=headers).json()
    
    # Przygotuj nowy wpis
    new_entry = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M"),
        "outdoor": next(p['value'] for p in points if p['parameterId'] == '40004'),
        "flow": next(p['value'] for p in points if p['parameterId'] == '40033')
    }
    
    # Wczytaj starą historię i dodaj nowy wpis
    try:
        with open('data.json', 'r') as f:
            history = json.load(f)
    except:
        history = []
        
    history.append(new_entry)
    # Trzymaj tylko ostatnie 100 pomiarów
    history = history[-100:]
    
    with open('data.json', 'w') as f:
        json.dump(history, f, indent=4)

if __name__ == "__main__":
    fetch_data()