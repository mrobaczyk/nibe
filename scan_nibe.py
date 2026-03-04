import requests
import os
import json

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    payload = {'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET}
    response = requests.post(url, data=payload)
    return response.json()['access_token']

def deep_scan():
    token = get_token()
    headers = {'Authorization': f'Bearer {token}'}
    
    # 1. Pobierz System ID
    systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
    system_id = systems['systems'][0]['id']
    dev_id = systems['systems'][0]['devices'][0]['id']
    
    print(f"System ID: {system_id} | Device ID: {dev_id}")
    
    # 2. Pobierz WSZYSTKIE dostępne punkty (Points)
    print("\n--- POBIERAM DOSTĘPNE PUNKTY (OPERACYJNE) ---")
    points = requests.get(f"https://api.myuplink.com/v2/devices/{dev_id}/points", headers=headers).json()
    
    # Sortujemy po ID dla łatwiejszego czytania
    points.sort(key=lambda x: x['parameterId'])
    
    for p in points:
        pid = p['parameterId']
        name = p.get('parameterName', 'N/A')
        val = p.get('value', 'N/A')
        unit = p.get('unit', '')
        print(f"ID: {pid} | {name}: {val} {unit}")

    # 3. Próba znalezienia "ukrytych" ustawień (Smart Home / Settings)
    # NIBE często trzyma temperatury stopu w innym miejscu niż temperatury bieżące
    print("\n--- PRÓBA ODCZYTU SPECJALNYCH PARAMETRÓW (CWU SETTINGS) ---")
    special_ids = [47041, 47043, 47044, 47045, 47046, 47047, 47048, 47049, 47051, 47053, 47134, 47135, 47387, 47669, 47687, 47679, 47671]
    ids_str = ",".join(map(str, special_ids))
    
    res = requests.get(f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={ids_str}", headers=headers).json()
    for r in res:
        print(f"SPECIAL -> ID: {r['parameterId']} | {r.get('parameterName', 'Settings')}: {r['value']}")

if __name__ == "__main__":
    deep_scan()