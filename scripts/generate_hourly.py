import json
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fetch_nibe import DATA_FILE, update_hourly

def run_generation():
    if not os.path.exists(DATA_FILE):
        print(f"Błąd: Nie znaleziono pliku źródłowego {DATA_FILE}")
        return

    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        try:
            full_history = json.load(f)
        except Exception as e:
            print(f"Błąd podczas wczytywania JSON: {e}")
            return

    print(f"Generowanie statystyk dla {len(full_history)} wpisów...")
    update_hourly(full_history)
    
    print("Sukces: Plik hourly_stats.json został odświeżony.")

if __name__ == "__main__":
    run_generation()