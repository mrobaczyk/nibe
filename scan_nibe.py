import requests
import os
import json

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    payload = {'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET}
    response = requests.post(url, data=payload)
    response.raise_for_status()
    return response.json()['access_token']

def deep_scan():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        # 1. Pobranie ID urządzenia
        resp = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers)
        data = resp.json()
        dev_id = data['systems'][0]['devices'][0]['id']
        
        print(f"--- SKANOWANIE URZĄDZENIA: {dev_id} ---\n")

        # 2. POBIERANIE WSZYSTKICH DOSTĘPNYCH PUNKTÓW (POINTS)
        print("[LISTA WSZYSTKICH PUNKTÓW ZWRACANYCH PRZEZ API]")
        all_points = requests.get(f"https://api.myuplink.com/v2/devices/{dev_id}/points", headers=headers).json()
        all_points.sort(key=lambda x: int(x['parameterId']))
        
        found_ids = []
        for p in all_points:
            pid = p['parameterId']
            found_ids.append(pid)
            print(f"ID: {pid} | {p.get('parameterName', '???')}: {p.get('value', 'N/A')} {p.get('unit', '')}")

        # 3. SPRAWDZANIE TWOJEJ LISTY (WYMUSZONE)
        print("\n" + "="*60)
        print("[SPRAWDZANIE TWOJEJ LISTY ID (W TYM UKRYTYCH)]")
        print("="*60)
        
        target_ids = [
            47041, 47043, 47044, 47045, 47046, 47047, 47048, 47049, 
            47051, 47053, 47134, 47135, 47387, 47669, 47687, 47679, 47671
        ]
        
        ids_str = ",".join(map(str, target_ids))
        forced_url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={ids_str}"
        forced_res = requests.get(forced_url, headers=headers).json()
        
        forced_res.sort(key=lambda x: x['parameterId'])
        for r in forced_res:
            status = "STALNY" if r['parameterId'] in found_ids else "UKRYTY/WYMUSZONY"
            print(f"ID: {r['parameterId']} | {r.get('parameterName', '???')} | WARTOŚĆ: {r['value']} | STATUS: {status}")

    except Exception as e:
        print(f"BŁĄD: {str(e)}")

if __name__ == "__main__":
    deep_scan()