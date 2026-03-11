import requests
import os

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

def get_data():
    # Token
    auth_res = requests.post("https://api.myuplink.com/oauth/token", 
        data={'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET})
    token = auth_res.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}

    # ID Urządzenia
    sys_resp = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers)
    dev_id = sys_resp.json()['systems'][0]['devices'][0]['id']

    # --- KLUCZOWY TEST: ENDPOINT STATYSTYK ---
    # To tutaj Nibe trzyma dane o energii pobranej/wyprodukowanej, których nie ma w "Points"
    print(f"\n--- SPRAWDZANIE STATYSTYK AGREGOWANYCH DLA: {dev_id} ---")
    
    # Próbujemy pobrać dane o energii (zazwyczaj parametr energy-data)
    # Formaty: 'daily', 'monthly', 'yearly'
    stats_url = f"https://api.myuplink.com/v2/devices/{dev_id}/statistics?unit=monthly"
    
    try:
        stats_res = requests.get(stats_url, headers=headers)
        if stats_res.status_code == 200:
            print(json.dumps(stats_res.json(), indent=2))
        else:
            print(f"Błąd statystyk: {stats_res.status_code}")
            # Jeśli nie działa standardowy, sprawdzamy endpoint 'energy-report'
            report_url = f"https://api.myuplink.com/v2/devices/{dev_id}/energy-report"
            report_res = requests.get(report_url, headers=headers)
            print("Raport Energii:", report_res.json())
    except Exception as e:
        print(f"Błąd: {e}")

if __name__ == "__main__":
    import json
    get_data()