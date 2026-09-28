# NIBE Monitor

Prosty dashboard do monitorowania pompy ciepła NIBE: statusów, parametrów pracy, zużycia energii i wykresów historycznych.

## Uruchomienie lokalne

W katalogu projektu uruchom:

```bash
python -m http.server 8000
```

Otwórz [http://localhost:8000](http://localhost:8000).

## Testy lokalne

Uruchom testy standardowej biblioteki Pythona:

```bash
python -m unittest discover -s tests
```

## Dane

Frontend korzysta z `data/data_stream.json` i `data/hourly_stats.json`. Aktualizację danych pobranych z myUplink obsługuje `scripts/fetch_nibe.py`, uruchamiany przez workflow `.github/workflows/nibe_update.yml`. Workflow wymaga sekretów `NIBE_CLIENT_ID` i `NIBE_CLIENT_SECRET`.

Workflow dopisuje rekordy do plików JSONL i przechowuje stan strumienia w `data/ingest_state.json`, a checkpoint statystyk godzinowych w `data/hourly_state.json`. Po naprawie timestampów uruchom `python scripts/repair_and_rebuild.py`, aby przebudować strumień i statystyki od początku.

Wykresy można włączać i wyłączać kafelkami KPI; wybór jest zapisywany w przeglądarce. Wykresy tworzą się dopiero w pobliżu widoku, a dla zakresów powyżej miesiąca wykresy liniowe są ukrywane.
