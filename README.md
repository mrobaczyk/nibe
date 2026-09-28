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

## Zmiana parametrów NIBE

Kafelki „Stopniominuty” i „Krzywa / Przesunięcie” mają przycisk edycji. Zapis uruchamia workflow `.github/workflows/nibe_set_parameters.yml`, który używa sekretów `NIBE_CLIENT_ID` i `NIBE_CLIENT_SECRET`. Przed `PATCH` pobiera metadane z myUplink i sprawdza, czy parametry `40941`, `47007` i `47011` są zapisywalne oraz czy wartości pasują do zakresu i kroku.

Żądania przyjmuje Cloudflare Worker z `cloudflare/worker.js`. Aby go wdrożyć:

1. Uzupełnij `GITHUB_REPOSITORY`, `GITHUB_REF`, `ACCESS_TEAM_DOMAIN` i `ALLOWED_ORIGIN` w `cloudflare/wrangler.toml`.
2. Utwórz fine-grained token GitHub ograniczony do tego repozytorium z uprawnieniem `Actions: Read and write`.
3. W katalogu `cloudflare` uruchom `wrangler secret put GITHUB_TOKEN`, a następnie `npx wrangler deploy`.
4. Utwórz aplikację Cloudflare Access chroniącą adres Workera i ogranicz ją do swojego konta. Skopiuj jej AUD do `ACCESS_AUD` w `cloudflare/wrangler.toml` i wdroż Workera ponownie.
5. Ustaw w `web/config.js` `SETTINGS_API_URL` na adres wdrożonego Workera. Dla niezawodnego logowania najlepiej użyć własnej domeny w Cloudflare; przy oddzielnych domenach przeglądarka musi wysyłać cookies Access w żądaniach CORS.

Sekrety NIBE pozostają w GitHub Actions; token GitHub jest przechowywany jako sekret Workera. Nie umieszczaj żadnego z nich w kodzie przeglądarki. Zapis wymaga również uprawnień zapisu dla aplikacji myUplink używanej przez `NIBE_CLIENT_ID`; odpowiedź 403 oznacza, że dostęp API trzeba nadać po stronie myUplink.

## Dane

Frontend korzysta z `data/data_stream.json` i `data/hourly_stats.json`. Aktualizację danych pobranych z myUplink obsługuje `scripts/fetch_nibe.py`, uruchamiany przez workflow `.github/workflows/nibe_update.yml`. Workflow wymaga sekretów `NIBE_CLIENT_ID` i `NIBE_CLIENT_SECRET`.

Workflow dopisuje rekordy do plików JSONL i przechowuje stan strumienia w `data/ingest_state.json`, a checkpoint statystyk godzinowych w `data/hourly_state.json`. Skrypt `python scripts/repair_and_rebuild.py` wyrównuje timestampy do siatki 5-minutowej, uzupełnia krótkie luki poprzednim pomiarem (limit jest ustawiony w skrypcie) i przebudowuje `data_stream.json` oraz statystyki godzinowe. Większe przerwy rozpoczynają nowy segment siatki czasu.

Wykresy można włączać i wyłączać kafelkami KPI; wybór jest zapisywany w przeglądarce. Wykresy tworzą się dopiero w pobliżu widoku, a dla zakresów powyżej miesiąca wykresy liniowe są ukrywane.
