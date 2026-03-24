import requests
import os
import json
import time

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

def scan_range(headers, dev_id, start, end):
    """Skanuje zakres ID w paczkach po 50 (limit API)"""
    results = []
    current = start
    while current <= end:
        batch = list(range(current, min(current + 50, end + 1)))
        ids_str = ",".join(map(str, batch))
        url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={ids_str}"
        try:
            resp = requests.get(url, headers=headers).json()
            # Filtrujemy tylko te, które mają przypisaną nazwę (istnieją w pompie)
            results.extend([p for p in resp if p.get('parameterName')])
        except Exception as e:
            print(f"Błąd przy skanowaniu zakresu {current}: {e}")
        
        current += 50
        time.sleep(0.5) # Delikatny delay dla API
    return results

def deep_scan():
    try:
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

        # 2. Pobranie punktów publicznych (Standard)
        print("[1/3] POBIERANIE PUNKTÓW PUBLICZNYCH...")
        public_points = requests.get(f"https://api.myuplink.com/v2/devices/{dev_id}/points", headers=headers).json()
        found_ids = {p['parameterId'] for p in public_points}
        
        # 3. Głębokie skanowanie rejestrów energii
        print("[2/3] SKANOWANIE REJESTRÓW UKRYTYCH (Energia, Moc, X22)...")
        # Zakresy najbardziej prawdopodobne dla liczników energii i X22
        ranges_to_scan = [
            (40070, 40090), # Liczniki energii i prądy fazowe
            (40940, 40950), # Częste ID dla zewnętrznych liczników (X22)
            (43415, 43445), # Statystyki energii całkowitej
            (44290, 44315), # Produkcja i zużycie (kWh)
            (47040, 47060)  # Parametry systemowe
        ]
        
        all_found = []
        for start, end in ranges_to_scan:
            all_found.extend(scan_range(headers, dev_id, start, end))

        # 4. Wyświetlanie wyników
        print("\n" + "="*135)
        print(f"{'ID':<7} | {'NAZWA PARAMETRU':<35} | {'WARTOŚĆ':<12} | {'MIN':<8} | {'MAX':<8} | {'STEP':<6} | {'SCALED':<8} | {'STATUS'}")
        print("="*135)

        # Połącz wyniki i posortuj
        final_list = {p['parameterId']: p for p in all_found + public_points}.values()
        sorted_list = sorted(final_list, key=lambda x: int(x['parameterId']))

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
            
            status = "PUB" if pid in found_ids else "UKR"
            
            # Formatowanie linii z nowymi kolumnami
            print(f"{pid:<7} | {name[:35]:<35} | {val:>7} {unit:<4} | {min_val:<8} | {max_val:<8} | {step_val:<6} | {scale_val:<8} | {status}")

    except Exception as e:
        print(f"\nBŁĄD KRYTYCZNY: {str(e)}")

if __name__ == "__main__":
    deep_scan()