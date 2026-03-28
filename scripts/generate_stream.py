import json
import os
from fetch_nibe import DATA_FILE, rebuild_data_stream

if not os.path.exists(DATA_FILE):
    print(f"Błąd: Nie znaleziono pliku {DATA_FILE}")
    exit(1)

with open(DATA_FILE, 'r', encoding='utf-8') as f:
    try:
        full_history = json.load(f)
    except json.JSONDecodeError:
        print(f"Błąd: Plik {DATA_FILE} jest uszkodzony lub pusty.")
        exit(1)

print(f"Przetwarzanie {len(full_history)} wpisów...")
rebuild_data_stream(full_history)

print("Sukces: Plik data_stream.json został przebudowany zgodnie z nową logiką.")