# NIBE Monitor

Prosty dashboard do monitorowania pompy ciepła NIBE: statusów, parametrów pracy, zużycia energii i wykresów historycznych.

## Uruchomienie lokalne

W katalogu projektu uruchom:

```bash
python -m http.server 8000
```

Otwórz [http://localhost:8000](http://localhost:8000).

## Dane

Frontend korzysta z `data/data_stream.json` i `data/hourly_stats.json`. Aktualizację danych pobranych z myUplink obsługuje `scripts/fetch_nibe.py`, uruchamiany przez workflow `.github/workflows/nibe_update.yml`. Workflow wymaga sekretów `NIBE_CLIENT_ID` i `NIBE_CLIENT_SECRET`.

Wykresy można włączać i wyłączać kafelkami KPI; wybór jest zapisywany w przeglądarce. Wykresy tworzą się dopiero w pobliżu widoku, a dla zakresów powyżej miesiąca wykresy liniowe są ukrywane.
