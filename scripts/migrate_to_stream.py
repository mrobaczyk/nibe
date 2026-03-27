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

    print(f"Rozpoczynam inteligentną konwersję {INPUT_FILE}...")

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
    
    # TO JEST NASZA PAMIĘĆ: trzyma ostatnie wartości wysłane do streamu
    last_sent_state = {} 
    
    fmt = "%Y-%m-%d %H:%M"

    for i, current_entry in enumerate(full_history):
        entry_to_save = {"timestamp": current_entry["timestamp"]}
        is_gap = False

        # 1. Sprawdzanie dziury w czasie
        if i > 0:
            prev_entry = full_history[i-1]
            try:
                t_prev = datetime.strptime(prev_entry['timestamp'], fmt)
                t_curr = datetime.strptime(current_entry['timestamp'], fmt)
                diff_min = (t_curr - t_prev).total_seconds() / 60
                if diff_min > 6:
                    is_gap = True
            except:
                is_gap = True

        # 2. Decyzja co zapisać
        if is_gap:
            # Jeśli jest dziura, robimy "reset" pamięci i zapisujemy pełny wpis
            # Dzięki temu JS po dziurze od razu dostanie komplet danych
            print(f"Dziura czasowa przed {current_entry['timestamp']} - wymuszam pełny wpis.")
            for key, value in current_entry.items():
                if key != "timestamp":
                    entry_to_save[key] = value
                    last_sent_state[key] = value # Aktualizujemy pamięć
        else:
            # Standardowy krok - porównujemy z pamięcią wysyłek
            for key, value in current_entry.items():
                if key == "timestamp":
                    continue
                
                # ZAPISUJEMY TYLKO JEŚLI:
                # a) Nie ma tego klucza w pamięci (pierwszy wpis)
                # b) Wartość jest inna niż ta, którą ostatnio wysłaliśmy
                if key not in last_sent_state or last_sent_state[key] != value:
                    entry_to_save[key] = value
                    last_sent_state[key] = value # Zapamiętujemy nową wysłaną wartość

        stream_history.append(entry_to_save)

    # Zapisujemy z wcięciami (indent=4), o które prosiłeś
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(stream_history, f, indent=4)

    # Statystyki
    old_size = os.path.getsize(INPUT_FILE) / 1024
    new_size = os.path.getsize(OUTPUT_FILE) / 1024
    reduction = (1 - (new_size / old_size)) * 100

    print("-" * 30)
    print(f"Konwersja zakończona sukcesem!")
    print(f"Oryginał (data.json): {old_size:.2f} KB")
    print(f"Nowy Strumień (data_stream.json): {new_size:.2f} KB")
    print(f"Dodatkowa redukcja dzięki pamięci stanu: {reduction:.1f}%")
    print("-" * 30)

if __name__ == "__main__":
    migrate()