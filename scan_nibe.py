import requests
import os

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    payload = {'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET}
    response = requests.post(url, data=payload, headers={'Content-Type': 'application/x-www-form-urlencoded'})
    response.raise_for_status()
    return response.json()['access_token']

def scan():
    token = get_token()
    headers = {'Authorization': f'Bearer {token}'}
    systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
    dev_id = systems['systems'][0]['devices'][0]['id']
    
    # Pobieramy absolutnie wszystko co wystawia urządzenie
    points = requests.get(f"https://api.myuplink.com/v2/devices/{dev_id}/points", headers=headers).json()
    
    print(f"--- LISTA DOSTĘPNYCH PARAMETRÓW DLA {dev_id} ---")
    for p in points:
        # Wyświetlamy ID, Nazwę i aktualną wartość
        print(f"ID: {p['parameterId']} | Nazwa: {p['parameterName']} | Wartość: {p['value']} {p['parameterUnit']}")

if __name__ == "__main__":
    scan()