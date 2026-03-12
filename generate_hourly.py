import json
import os
from fetch_nibe import update_hourly

if os.path.exists('hourly_stats.json'):
    os.remove('hourly_stats.json')

# 1. Wczytaj całą historię
with open('data.json', 'r') as f:
    history = json.load(f)

# 2. Przetwórz wszystko naraz
update_hourly(history, history[-1])

print("Gotowe! Sprawdź hourly_stats.json")