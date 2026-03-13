import json
import os
from scripts.fetch_nibe import update_hourly

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(BASE_DIR, 'data', 'data.json')
HOURLY_FILE = os.path.join(BASE_DIR, 'data', 'hourly_stats.json')

if os.path.exists(HOURLY_FILE):
    os.remove(HOURLY_FILE)

# 1. Wczytaj całą historię
with open(DATA_FILE, 'r') as f:
    history = json.load(f)

# 2. Przetwórz wszystko naraz
update_hourly(history, history[-1])

print("Gotowe! Sprawdź hourly_stats.json")