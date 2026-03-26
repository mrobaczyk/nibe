import pandas as pd
from pathlib import Path

def analyze_compressor_cycles(hz_file, starts_file):
    def load_myuplink_csv(file_path, value_name):
        # Wczytujemy z automatycznym wykrywaniem kolumn
        df = pd.read_csv(file_path, sep=';', index_col=False)
        
        # Usuwamy kolumny, które są całkowicie puste (ten nieszczęsny trzeci średnik)
        df = df.dropna(axis=1, how='all')
        
        # Teraz nazywamy to, co zostało
        if df.shape[1] >= 2:
            df.columns = ['timestamp', value_name] + list(df.columns[2:])
        
        # Konwersja czasu
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, errors='coerce')
        df = df.dropna(subset=['timestamp']).sort_values('timestamp')
        return df[['timestamp', value_name]]

    # Wczytujemy oba pliki
    df_hz = load_myuplink_csv(hz_file, 'hz')
    df_starts = load_myuplink_csv(starts_file, 'starts')

    # Logika wykrywania pracy
    df_hz['is_running'] = pd.to_numeric(df_hz['hz'], errors='coerce').fillna(0) > 0
    df_hz['group'] = (df_hz['is_running'] != df_hz['is_running'].shift()).cumsum()

    cycles = []

    # Grupowanie serii punktów "isRunning"
    for _, group in df_hz[df_hz['is_running'] == True].groupby('group'):
        if len(group) < 2: 
            continue 
        
        start_time = group['timestamp'].min()
        end_time = group['timestamp'].max()
        
        duration = end_time - start_time
        duration_min = duration.total_seconds() / 60
        
        # Ignorujemy cykle krótsze niż 2 minuty (szum w danych)
        if duration_min < 2:
            continue

        # Szukamy skoków licznika w tym czasie
        mask = (df_starts['timestamp'] >= start_time) & (df_starts['timestamp'] <= end_time)
        starts_in_period = df_starts.loc[mask, 'starts']
        
        restarts = 0
        if not starts_in_period.empty:
            # Zamiana na liczby na wypadek gdyby starts było stringiem
            vals = pd.to_numeric(starts_in_period, errors='coerce')
            restarts = vals.max() - vals.min()

        cycles.append({
            'start': start_time,
            'end': end_time,
            'duration_min': round(duration_min, 1),
            'restarts_inside': int(restarts)
        })

    if not cycles:
        print("\nNie znaleziono cykli. Sprawdź, czy Hz w pliku są większe od 0.")
        return

    df_results = pd.DataFrame(cycles)
    
    # Wyświetlamy 20 najdłuższych
    longest = df_results.sort_values('duration_min', ascending=False).head(20)

    print(f"\n{'START CYKLU (Lokalny)':<20} | {'CZAS [h]':<10} | {'RESTARTY'}")
    print("-" * 55)
    for _, row in longest.iterrows():
        try:
            local_t = row['start'].tz_convert('Europe/Warsaw').strftime('%Y-%m-%d %H:%M')
        except:
            local_t = row['start'].strftime('%Y-%m-%d %H:%M')
            
        hours = round(row['duration_min'] / 60, 2)
        print(f"{local_t:<20} | {hours:<10} | {row['restarts_inside']}")

    print("\n--- PODSUMOWANIE ---")
    print(f"Najdłuższy cykl: {round(df_results['duration_min'].max() / 60, 2)} h")
    print(f"Łączna liczba cykli w pliku: {len(df_results)}")
    print(f"Średni czas pracy: {round(df_results['duration_min'].mean(), 1)} min")

if __name__ == "__main__":
    # Ustalanie ścieżek względem lokalizacji skryptu
    # scripts/plik.py -> scripts -> projekt_root -> data/plik.csv
    script_path = Path(__file__).resolve()
    base_dir = script_path.parent.parent
    
    hz_csv = base_dir / "data" / "hz.csv"
    starts_csv = base_dir / "data" / "starts.csv"

    if hz_csv.exists() and starts_csv.exists():
        print(f"Analizuję dane z folderu: {hz_csv.parent}")
        analyze_compressor_cycles(hz_csv, starts_csv)
    else:
        print(f"\nBŁĄD: Nie znaleziono plików CSV w folderze 'data'.")
        print(f"Szukano w: {hz_csv.parent}")
        print(f"Upewnij się, że struktura to:\n  [PROJEKT]\n   ├── data/\n   │    ├── hz.csv\n   │    └── starts.csv\n   └── scripts/\n        └── {script_path.name}")