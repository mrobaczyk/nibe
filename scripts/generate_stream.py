import json
from fetch_nibe import DATA_FILE, rebuild_data_stream

# Wczytaj data.json
with open(DATA_FILE, 'r') as f:
    full_history = json.load(f)

# Wywołaj gotową funkcję z fetch_nibe
rebuild_data_stream(full_history)
print("Plik data_stream.json został przebudowany zgodnie z nową logiką.")