import os
import json
from datetime import datetime, timedelta
import sys

# Importujemy logikę i ścieżki z Twojego pliku fetch_nibe
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fetch_nibe import (
    DATA_FILE, 
    load_json_data, 
    save_json_data, 
    rebuild_data_stream, 
    update_hourly
)

def duplicate_entry(prev_entry, target_ts):
    """Tworzy kopię wpisu z nowym znacznikiem czasu, zachowując kolejność kluczy."""
    new_entry = {"ts": target_ts}
    # Kopiujemy wszystkie klucze poza 'ts' w oryginalnej kolejności
    for key, value in prev_entry.items():
        if key != "ts":
            new_entry[key] = value
    return new_entry

def repair_gaps():
    print(f"Wczytywanie danych z {DATA_FILE}...")
    history = load_json_data(DATA_FILE)
    if not history:
        print("Błąd: Plik danych jest pusty.")
        return

    # Sortowanie chronologiczne
    history.sort(key=lambda x: x['ts'])
    
    repaired_history = []
    gaps_filled = 0
    
    for i in range(len(history)):
        repaired_history.append(history[i])
        
        # Sprawdzamy dziurę między obecnym a następnym wpisem
        if i < len(history) - 1:
            t_curr = datetime.strptime(history[i]['ts'], "%Y-%m-%d %H:%M")
            t_next = datetime.strptime(history[i+1]['ts'], "%Y-%m-%d %H:%M")
            
            delta = (t_next - t_curr).total_seconds()
            
            # Jeśli dziura ma dokładnie 10 minut (600s), brakuje punktu "pomiędzy"
            if delta == 600:
                target_dt = t_curr + timedelta(minutes=5)
                target_ts = target_dt.strftime("%Y-%m-%d %H:%M")
                
                # Tworzymy kopię poprzedniego wpisu ze zmienioną datą
                new_p = duplicate_entry(history[i], target_ts)
                repaired_history.append(new_p)
                gaps_filled += 1
                print(f" [+] Naprawiono (kopia): {target_ts}")

    if gaps_filled > 0:
        print(f"\nSukces: Wstawiono {gaps_filled} brakujących wpisów.")
        
        # Zapisujemy naprawiony data.json
        save_json_data(DATA_FILE, repaired_history)
        
        # REGENERACJA PLIKÓW
        print("Odświeżanie plików pochodnych...")
        
        try:
            rebuild_data_stream(repaired_history)
            print(" -> data_stream.json: OK")
        except Exception as e:
            print(f" -> data_stream.json: BŁĄD ({e})")

        try:
            update_hourly(repaired_history)
            print(" -> hourly_stats.json: OK")
        except Exception as e:
            print(f" -> hourly_stats.json: BŁĄD ({e})")
            
    else:
        print("Nie znaleziono pojedynczych dziur do naprawy.")

if __name__ == "__main__":
    repair_gaps()