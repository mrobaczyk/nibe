import requests
import os
from datetime import datetime

# Pobieranie danych z Twoich zmiennych środowiskowych
CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    payload = {
        'grant_type': 'client_credentials', 
        'client_id': CLIENT_ID, 
        'client_secret': CLIENT_SECRET
    }
    response = requests.post(url, data=payload)
    response.raise_for_status()
    return response.json()['access_token']

def deep_scan():
    try:
        print(f"Aktualna data i godzina: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        # 1. Pobranie ID systemu i urządzenia
        print("--- ŁĄCZENIE Z API MYUPLINK ---")
        resp = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers)
        resp.raise_for_status()
        data = resp.json()
        
        system = data['systems'][0]
        dev_id = system['devices'][0]['id']
        print(f"System: {system['name']} | Urządzenie ID: {dev_id}\n")

        # 2. Pobranie wszystkich punktów zwracanych przez API
        print("Pobieranie listy parametrów...")
        resp = requests.get(f"https://api.myuplink.com/v2/devices/{dev_id}/points", headers=headers)
        resp.raise_for_status()
        points = resp.json()

        print("\n" + "="*125)
        print(f"{'ID':<7} | {'NAZWA PARAMETRU':<35} | {'WARTOŚĆ':<12} | {'MIN':<8} | {'MAX':<8} | {'STEP':<6} | {'SCALED'}")
        print("="*125)

        sorted_list = sorted(points, key=lambda x: int(x['parameterId']))

        for p in sorted_list:
            pid = p['parameterId']
            name = p.get('parameterName', '???')
            val = p.get('value', 'N/A')
            unit = p.get('parameterUnit', '')
            
            # Pobieranie nowych pól
            scale_val = str(p.get('scaleValue') if p.get('scaleValue') is not None else '--')
            min_val = str(p.get('minValue') if p.get('minValue') is not None else '--')
            max_val = str(p.get('maxValue') if p.get('maxValue') is not None else '--')
            step_val = str(p.get('stepValue') if p.get('stepValue') is not None else '--')
            
            print(f"{pid:<7} | {name[:35]:<35} | {val:>7} {unit:<4} | {min_val:<8} | {max_val:<8} | {step_val:<6} | {scale_val}")

        print(f"\nŁącznie parametrów: {len(sorted_list)}")

    except Exception as e:
        print(f"\nBŁĄD KRYTYCZNY: {str(e)}")

if __name__ == "__main__":
    deep_scan()