import os
import json
from datetime import datetime, timedelta
import sys

# --- KONFIGURACJA ---
MAX_GAP_TO_FILL = 780  # Max dziura do łatania (13 min)
INTERVAL_STEP = 300    # 5 minut (300s)
# --------------------

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from data_utils import (
    DATA_FILE, load_json_data, save_json_data, 
    rebuild_data_stream, update_hourly
)

def get_dt(ts_str):
    return datetime.strptime(ts_str, "%Y-%m-%d %H:%M")

def format_dt(dt):
    # Wymuszamy siatkę 0/5
    minute = (dt.minute // 5) * 5
    return dt.replace(minute=minute, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M")

def repair_and_align():
    print(f"--- Konfiguracja: MAX_GAP_TO_FILL = {MAX_GAP_TO_FILL}s ({MAX_GAP_TO_FILL//60} min) ---")
    print(f"Wczytywanie danych z {DATA_FILE}...")
    
    raw_history = load_json_data(DATA_FILE)
    if not raw_history:
        print("Błąd: Brak danych w pliku.")
        return

    raw_history.sort(key=lambda x: x['ts'])
    repaired_history = []
    
    idx = 0
    print("Analiza i wyrównywanie osi czasu...")

    while idx < len(raw_history):
        actual_entry = raw_history[idx]
        actual_dt = get_dt(actual_entry['ts'])
        old_ts = actual_entry['ts']

        # Jeśli to pierwszy wpis, wyrównujemy go do siatki
        if not repaired_history:
            new_ts = format_dt(actual_dt)
            actual_entry['ts'] = new_ts
            repaired_history.append(actual_entry)
            if old_ts != new_ts:
                print(f" [*] Wyrównano start: {new_ts} (oryg. {old_ts})")
            idx += 1
            continue

        last_fixed_dt = get_dt(repaired_history[-1]['ts'])
        next_expected_dt = last_fixed_dt + timedelta(seconds=INTERVAL_STEP)
        new_expected_ts_str = format_dt(next_expected_dt)
        
        # LOOK-AHEAD: Sprawdzamy następny wpis
        future_entry = raw_history[idx+1] if idx + 1 < len(raw_history) else None
        
        if future_entry:
            future_dt = get_dt(future_entry['ts'])
            gap_to_future = (future_dt - last_fixed_dt).total_seconds()
            
            # Jeśli między ostatnim zapisanym a przyszłym jest ok. 10 min, 
            # to obecny wpis musi być środkiem (16:05)
            if 540 <= gap_to_future <= 660:
                actual_entry['ts'] = new_expected_ts_str
                repaired_history.append(actual_entry)
                
                if old_ts != new_expected_ts_str:
                    print(f" [*] Wyrównano środkowy wpis: {new_expected_ts_str} (oryg. {old_ts})")
                
                idx += 1
                continue

        # Logika standardowa dla pozostałych przypadków
        diff_to_expected = (actual_dt - next_expected_dt).total_seconds()

        if -120 <= diff_to_expected <= 120:
            # Wpis pasuje do następnego slotu na siatce
            actual_entry['ts'] = new_expected_ts_str
            repaired_history.append(actual_entry)
            
            if old_ts != new_expected_ts_str:
                print(f" [*] Wyrównano wpis: {new_expected_ts_str} (oryg. {old_ts})")
            idx += 1
            
        elif diff_to_expected > 120:
            # Wykryto dziurę - sprawdzamy czy łatać
            if diff_to_expected <= MAX_GAP_TO_FILL:
                new_fill = repaired_history[-1].copy()
                new_fill['ts'] = new_expected_ts_str
                repaired_history.append(new_fill)
                print(f" [+] Wstawiono brakujący slot: {new_expected_ts_str}")
                # Nie zwiększamy idx, by w kolejnym kroku dopasować ten sam wpis do następnego slotu
            else:
                # Dziura zbyt duża - reset siatki
                new_start_ts = format_dt(actual_dt)
                print(f" [!] Dziura {int(diff_to_expected)}s - reset siatki na {new_start_ts}")
                actual_entry['ts'] = new_start_ts
                repaired_history.append(actual_entry)
                idx += 1
        else:
            # Duplikat (wpis za blisko poprzedniego)
            idx += 1

    # Finalizacja i zapis
    if len(repaired_history) > 0:
        save_json_data(DATA_FILE, repaired_history)
        print("\nSukces: Plik data.json został zaktualizowany.")
        
        print("Odświeżanie plików pochodnych...")
        rebuild_data_stream(repaired_history)
        update_hourly(repaired_history)
        print(" -> Gotowe.")

if __name__ == "__main__":
    repair_and_align()