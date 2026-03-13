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

def deep_debug():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        # 1. Pobranie ID systemu i urządzenia
        resp = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers)
        systems_data = resp.json()
        system = systems_data['systems'][0]
        dev_id = system['devices'][0]['id']
        
        print(f"--- DEBUGOWANIE URZĄDZENIA: {dev_id} ---")
        print(f"Model: {system['name']}\n")

        # 2. TEST: Kategorie z parametrami (często tu siedzą ukryte dane)
        # hideParameters=false wymusza wypisanie wszystkiego co podpięte pod kategorię
        print("[1/3] SPRAWDZANIE KATEGORII I UKRYTYCH PARAMETRÓW...")
        cats_url = f"https://api.myuplink.com/v2/devices/{dev_id}/categories?hideParameters=false"
        cats_res = requests.get(cats_url, headers=headers).json()
        
        energy_keywords = ["energy", "pobrana", "zużycie", "purchased", "consumption", "yield", "meter"]
        found_any_energy = False

        for cat in cats_res:
            cat_name = cat.get('name', 'Bez nazwy')
            params = cat.get('parameters', [])
            
            # Szukamy czy kategoria brzmi "energetycznie"
            is_energy_cat = any(k in cat_name.lower() for k in energy_keywords)
            
            if is_energy_cat or params:
                print(f"\nKategoria: {cat_name} (ID: {cat.get('id')})")
                for p in params:
                    p_name = p.get('parameterName', '???')
                    p_val = p.get('value', 'N/A')
                    p_unit = p.get('unit', '')
                    
                    match_mark = ""
                    if any(k in p_name.lower() for k in energy_keywords):
                        match_mark = " <--- POTENCJALNY LICZNIK"
                        found_any_energy = True
                    
                    print(f"   - {p['parameterId']}: {p_name} = {p_val} {p_unit}{match_mark}")

        # 3. TEST: Rozszerzone dane urządzenia (Smart Home / Energy Management)
        print("\n[2/3] SPRAWDZANIE SPECJALNYCH ENDPOINTÓW...")
        
        endpoints = [
            f"https://api.myuplink.com/v2/devices/{dev_id}/smart-home-mode",
            f"https://api.myuplink.com/v2/devices/{dev_id}/energy-report", # Często 404, ale warto sprawdzić
        ]
        
        for ep in endpoints:
            r = requests.get(ep, headers=headers)
            print(f"Endpoint {ep.split('/')[-1]}: Status {r.status_code}")
            if r.status_code == 200:
                print(json.dumps(r.json(), indent=2))

        # 4. TEST: Bezpośrednie uderzenie w znane "licznikowe" ID, których nie ma w points
        print("\n[3/3] WYMUSZONE SPRAWDZANIE LICZNIKÓW (HARDCODED IDS)...")
        # Te ID często nie meldują się same, trzeba o nie zapytać:
        # 43415-43425 (Total energy), 40072 (Energy meter)
        test_ids = [40072, 40073, 40074, 40075, 43415, 43420, 43424, 44302, 44304, 44306]
        ids_str = ",".join(map(str, test_ids))
        f_url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={ids_str}"
        f_res = requests.get(f_url, headers=headers).json()
        
        for r in f_res:
             if r.get('parameterName'):
                 print(f"WYMUSZONY ODZYT -> {r['parameterId']}: {r['parameterName']} = {r['value']} {r.get('unit','')}")

    except Exception as e:
        print(f"BŁĄD: {str(e)}")

if __name__ == "__main__":
    deep_debug()