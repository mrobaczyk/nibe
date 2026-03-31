import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fetch_nibe import DATA_FILE, update_hourly, load_json_data

def run_generation():
    full_history = load_json_data(DATA_FILE)

    if not full_history:
        print(f"Błąd: Nie znaleziono danych lub plik {DATA_FILE} jest pusty/uszkodzony.")
        return

    print(f"Generowanie statystyk dla {len(full_history)} wpisów...")
    
    try:
        update_hourly(full_history)
        print("Sukces: Plik hourly_stats.json został odświeżony.")
    except Exception as e:
        print(f"Wystąpił błąd podczas generowania statystyk: {e}")

if __name__ == "__main__":
    run_generation()