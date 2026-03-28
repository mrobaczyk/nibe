import json
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fetch_nibe import DATA_FILE, HOURLY_FILE, update_hourly

if os.path.exists(HOURLY_FILE):
    os.remove(HOURLY_FILE)
    print(f"Usunięto stary plik {os.path.basename(HOURLY_FILE)} - zaczynamy od zera.")

if not os.path.exists(DATA_FILE):
    print(f"Błąd: Nie znaleziono pliku {DATA_FILE}")
    sys.exit(1)

with open(DATA_FILE, 'r', encoding='utf-8') as f:
    try:
        history = json.load(f)
    except Exception as e:
        print(f"Błąd podczas wczytywania: {e}")
        sys.exit(1)

print(f"Przeliczanie statystyk dla {len(history)} wpisów...")
update_hourly(history)

print("Gotowe! Statystyki godzinowe zostały wygenerowane pomyślnie.")