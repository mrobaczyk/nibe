import json
import os
from datetime import datetime

# Konfiguracja
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_FILE = os.path.join(BASE_DIR, 'data', 'data.json')
OUTPUT_FILE = os.path.join(BASE_DIR, 'data', 'data_stream.json')

def migrate():
    if not os.path.exists(INPUT_FILE):
        print(f"Błąd: Nie znaleziono pliku {INPUT_FILE}")
        return

    print(f"Rozpoczynam konwersję {INPUT_FILE}...")

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        try:
            full_history = json.load(f)
        except Exception as e:
            print(f"Błąd odczytu JSON: {e}")
            return

    if not full_history:
        print("Plik jest pusty.")
        return

    stream_history = []
    last_full_entry = {}
    fmt = "%Y-%m-%d %H:%M"

    for i, current_entry in enumerate(full_history):
        # Kopia, żeby nie modyfikować oryginału w locie
        entry_to_save = current_entry.copy()

        if i > 0:
            prev_entry = full_history[i-1]
            
            # Sprawdzamy różnicę czasu
            try:
                t_prev = datetime.strptime(prev_entry['timestamp'], fmt)
                t_curr = datetime.strptime(current_entry['timestamp'], fmt)
                diff_min = (t_curr - t_prev).total_seconds() / 60
            except:
                diff_min = 999

            # Jeśli to standardowy krok (5 min), usuwamy powtarzające się wartości
            if diff_min <= 6:
                to_remove = []
                for key, value in entry_to_save.items():
                    if key == "timestamp":
                        continue
                    
                    # Porównujemy z poprzednim wpisem (z full_history, bo on jest kompletny)
                    if key in prev_entry and prev_entry[key] == value:
                        to_remove.append(key)
                
                for key in to_remove:
                    del entry_to_save[key]
            else:
                print(f"Wykryto dziurę przed {current_entry['timestamp']} ({int(diff_min)} min) - zachowuję pełny wpis.")

        stream_history.append(entry_to_save)

    # Zapisujemy wynik w najbardziej skompresowanej formie (bez spacji i nowej linii)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(stream_history, f, indent=4)

    # Statystyki
    old_size = os.path.getsize(INPUT_FILE) / 1024
    new_size = os.path.getsize(OUTPUT_FILE) / 1024
    reduction = (1 - (new_size / old_size)) * 100

    print("-" * 30)
    print(f"Konwersja zakończona!")
    print(f"Oryginał (data.json): {old_size:.2f} KB")
    print(f"Strumień (data_stream.json): {new_size:.2f} KB")
    print(f"Redukcja rozmiaru: {reduction:.1f}%")
    print("-" * 30)

if __name__ == "__main__":
    migrate()