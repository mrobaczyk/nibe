import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fetch_nibe import DATA_FILE, rebuild_data_stream, load_json_data

def run_generation():
    full_history = load_json_data(DATA_FILE)

    if not full_history:
        print(f"Błąd: Nie znaleziono danych w {DATA_FILE} lub plik jest uszkodzony.")
        return

    print(f"Generowanie streamu (delta) dla {len(full_history)} wpisów...")
    
    try:
        rebuild_data_stream(full_history)
        print("Sukces: Plik data_stream.json został odświeżony.")
    except Exception as e:
        print(f"Wystąpił błąd podczas generowania streamu: {e}")

if __name__ == "__main__":
    run_generation()