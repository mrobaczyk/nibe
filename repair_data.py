import json
import os

DATA_FILE = 'data.json'
BACKUP_FILE = 'data_backup.json'

def repair_data():
    if not os.path.exists(DATA_FILE):
        print("Nie znaleziono pliku data.json")
        return

    with open(DATA_FILE, 'r') as f:
        data = json.load(f)

    # Backup na wszelki wypadek
    with open(BACKUP_FILE, 'w') as f:
        json.dump(data, f, indent=4)
    
    print(f"Naprawianie {len(data)} wpisów...")
    
    # Sortujemy po czasie, żeby delty miały sens
    data = sorted(data, key=lambda x: x['timestamp'])
    
    new_data = []
    
    for i in range(len(data)):
        current = data[i].copy()
        
        # Jeśli to pierwszy wpis, nie mamy delty - zostawiamy jak jest
        if i == 0:
            new_data.append(current)
            continue
            
        previous = data[i-1]
        
        # 1. Obliczamy sumę zużytego prądu w tym wpisie (heating + cwu)
        # Bierzemy to co było wcześniej źle przypisane i łączymy w pulę
        total_cons = float(current.get('kwh_consumed_heating', 0) or 0) + \
                     float(current.get('kwh_consumed_cwu', 0) or 0)
        
        # 2. Obliczamy faktyczne przyrosty liczników produkcji ciepła
        # Wykorzystujemy oryginalne stany liczników z Nibe
        try:
            d_prod_h = max(0, float(current.get('kwh_heating', 0)) - float(previous.get('kwh_heating', 0)))
            d_prod_c = max(0, float(current.get('kwh_cwu', 0)) - float(previous.get('kwh_cwu', 0)))
        except (ValueError, TypeError):
            d_prod_h, d_prod_c = 0, 0

        total_prod = d_prod_h + d_prod_c

        # 3. Rozdzielamy total_cons proporcjonalnie
        if total_prod > 0:
            current['kwh_consumed_heating'] = round(total_cons * (d_prod_h / total_prod), 4)
            current['kwh_consumed_cwu'] = round(total_cons * (d_prod_c / total_prod), 4)
        else:
            # Jeśli licznik nie drgnął, wszystko przypisujemy do heating (standby)
            current['kwh_consumed_heating'] = round(total_cons, 4)
            current['kwh_consumed_cwu'] = 0.0
            
        new_data.append(current)

    with open(DATA_FILE, 'w') as f:
        json.dump(new_data, f, indent=4)
    
    print("Naprawa data.json zakończona sukcesem!")

if __name__ == "__main__":
    repair_data()