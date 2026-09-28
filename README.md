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

1. Uzupełnij `GITHUB_REPOSITORY`, `GITHUB_REF`, `ACCESS_TEAM_DOMAIN` i `ALLOWED_ORIGIN` w `cloudflare/wrangler.toml`. `ALLOWED_ORIGIN` dla obecnej strony to `https://mrobaczyk.github.io`.
2. W ustawieniach repozytorium GitHub dodaj sekrety `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`. Token Cloudflare utwórz z szablonu **Edit Cloudflare Workers** i ogranicz do właściwego konta.
3. Uruchom ręcznie workflow **Deploy NIBE Settings Worker** w zakładce **Actions**. To pierwszy deploy; URL będzie miał postać `https://nibe-settings-gateway.<twoje-konto>.workers.dev`.
4. Utwórz aplikację Cloudflare Access chroniącą adres Workera i ogranicz ją do swojego konta. W **Advanced settings → Cross-Origin Resource Sharing (CORS)** włącz **Bypass OPTIONS requests to origin**. Worker sam obsługuje preflight i dopuszcza wyłącznie `https://mrobaczyk.github.io`. Skopiuj AUD aplikacji do `ACCESS_AUD` w `cloudflare/wrangler.toml`.
5. Utwórz fine-grained token GitHub ograniczony do repozytorium `nibe` z uprawnieniem **Actions: Read and write**. Dodaj go w Cloudflare Dashboard: **Workers & Pages → nibe-settings-gateway → Settings → Variables and Secrets → Add secret**, nazwa `GITHUB_TOKEN`.
6. Zatwierdź zmianę AUD w repo i ponownie uruchom **Deploy NIBE Settings Worker**.
7. Ustaw w `web/config.js` `SETTINGS_API_URL` na adres Workera i opublikuj stronę. Sprawdź logowanie Access z przeglądarki. Jeśli przeglądarka blokuje cookies w żądaniach cross-site z `github.io` do `workers.dev`, potrzebna będzie własna domena w Cloudflare, aby dashboard i Worker działały w tej samej domenie nadrzędnej.

Sekrety NIBE pozostają w GitHub Actions; `GITHUB_TOKEN` jest sekretem Workera, a `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID` służą tylko workflow deployującemu. Nie umieszczaj żadnego z nich w kodzie przeglądarki. Zapis wymaga również uprawnień zapisu dla aplikacji myUplink używanej przez `NIBE_CLIENT_ID`; odpowiedź 403 oznacza, że dostęp API trzeba nadać po stronie myUplink.

## Dane

Frontend korzysta z `data/data_stream.json` i `data/hourly_stats.json`. Aktualizację danych pobranych z myUplink obsługuje `scripts/fetch_nibe.py`, uruchamiany przez workflow `.github/workflows/nibe_update.yml`. Workflow wymaga sekretów `NIBE_CLIENT_ID` i `NIBE_CLIENT_SECRET`.

Workflow dopisuje rekordy do plików JSONL i przechowuje stan strumienia w `data/ingest_state.json`, a checkpoint statystyk godzinowych w `data/hourly_state.json`. Skrypt `python scripts/repair_and_rebuild.py` wyrównuje timestampy do siatki 5-minutowej, uzupełnia krótkie luki poprzednim pomiarem (limit jest ustawiony w skrypcie) i przebudowuje `data_stream.json` oraz statystyki godzinowe. Większe przerwy rozpoczynają nowy segment siatki czasu.

Wykresy można włączać i wyłączać kafelkami KPI; wybór jest zapisywany w przeglądarce. Wykresy tworzą się dopiero w pobliżu widoku, a dla zakresów powyżej miesiąca wykresy liniowe są ukrywane.
