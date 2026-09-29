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

Testy JavaScript (moduły w `web/`) korzystają z wbudowanego test runnera Node.js — nie wymagają instalacji zależności:

```bash
node --test tests/js/*.test.mjs
```

## Zmiana parametrów NIBE

Kafelki „Stopniominuty” i „Krzywa / Przesunięcie” mają przycisk edycji. Zapis uruchamia workflow `.github/workflows/nibe_set_parameters.yml`, który używa sekretów `NIBE_CLIENT_ID` i `NIBE_CLIENT_SECRET`. Przed `PATCH` pobiera metadane z myUplink i sprawdza, czy parametry `40941`, `47007` i `47011` są zapisywalne oraz czy wartości pasują do zakresu i kroku.

Żądania przyjmuje Cloudflare Worker z `cloudflare/worker.js`. Aby go wdrożyć:

1. Uzupełnij `GITHUB_REPOSITORY`, `GITHUB_REF` i `ALLOWED_ORIGIN` w `cloudflare/wrangler.toml`. Repozytorium i origin `https://mrobaczyk.github.io` są już ustawione.
2. W ustawieniach repozytorium GitHub dodaj sekrety `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`. Token Cloudflare utwórz z szablonu **Edit Cloudflare Workers** i ogranicz do właściwego konta.
3. Uruchom ręcznie workflow **Deploy NIBE Settings Worker** w zakładce **Actions**. To pierwszy deploy; URL będzie miał postać `https://nibe-settings-gateway.<twoje-konto>.workers.dev`.
4. W **Workers & Pages** otwórz `nibe-settings-gateway` → **Access** → **Protect this Worker behind Access**. Wybierz **All traffic** i dodaj politykę **Allow** ograniczoną do swojego adresu e-mail.
5. Utwórz fine-grained token GitHub ograniczony do repozytorium `nibe` z uprawnieniem **Actions: Read and write**. Dodaj go w Cloudflare Dashboard: **Workers & Pages → nibe-settings-gateway → Settings → Variables and Secrets → Add secret**, nazwa `GITHUB_TOKEN`.
6. W aplikacji Access Workera otwórz **Advanced settings → Cross-Origin Resource Sharing (CORS)** i włącz **Bypass OPTIONS requests to origin**. Worker obsługuje preflight i dopuszcza wyłącznie `https://mrobaczyk.github.io`.
7. Ustaw `SETTINGS_API_URL` w `web/config.js` na `https://nibe-settings-gateway.michalrobaczyk.workers.dev` i opublikuj stronę. Worker używa natywnego `ctx.access`, więc nie potrzebuje `ACCESS_TEAM_DOMAIN` ani `ACCESS_AUD`.

Przeglądarka i `workers.dev` są różnymi domenami. Zaloguj się najpierw bezpośrednio na adres Workera, a następnie wróć do dashboardu. Jeśli przeglądarka blokuje cookie Access w żądaniu cross-site, potrzebna będzie własna domena dla Workera lub umieszczenie dashboardu i endpointu pod tą samą domeną nadrzędną.

Sekrety NIBE pozostają w GitHub Actions; `GITHUB_TOKEN` jest sekretem Workera, a `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID` służą tylko workflow deployującemu. Nie umieszczaj żadnego z nich w kodzie przeglądarki. Zapis wymaga również uprawnień zapisu dla aplikacji myUplink używanej przez `NIBE_CLIENT_ID`; odpowiedź 403 oznacza, że dostęp API trzeba nadać po stronie myUplink.

## Dane

Frontend korzysta z `data/data_stream.json` i `data/hourly_stats.json`. Aktualizację danych pobranych z myUplink obsługuje `scripts/fetch_nibe.py`, uruchamiany przez workflow `.github/workflows/nibe_update.yml`. Workflow wymaga sekretów `NIBE_CLIENT_ID` i `NIBE_CLIENT_SECRET`.

Workflow dopisuje rekordy do plików JSONL i przechowuje stan strumienia w `data/ingest_state.json`, a checkpoint statystyk godzinowych w `data/hourly_state.json`. Skrypt `python scripts/repair_and_rebuild.py` wyrównuje timestampy do siatki 5-minutowej, uzupełnia krótkie luki poprzednim pomiarem (limit jest ustawiony w skrypcie) i przebudowuje `data_stream.json` oraz statystyki godzinowe. Większe przerwy rozpoczynają nowy segment siatki czasu.

Wykresy można włączać i wyłączać kafelkami KPI; wybór jest zapisywany w przeglądarce. Wykresy tworzą się dopiero w pobliżu widoku, a dla zakresów powyżej miesiąca wykresy liniowe są ukrywane.
