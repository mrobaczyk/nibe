import json
import os

DATA_FILE = 'data.json'

def estimate_power_usage(hz, pump_speed, temp_ext):
    if hz < 1: return 0.02
    base_hz_coeff = 0.028 
    temp_correction = 1.0
    if temp_ext < 10:
        temp_correction = 1.0 + (10 - temp_ext) * 0.008
    compress_kw = hz * base_hz_coeff * temp_correction
    if temp_ext < 2.0: compress_kw += 0.07
    return round(compress_kw + (0.06 * (pump_speed / 100)), 3)

def repair():
    if not os.path.exists(DATA_FILE): return
    
    with open(DATA_FILE, 'r') as f:
        history = json.load(f)

    print(f"Przetwarzanie {len(history)} wpisów...")
    
    for i in range(len(history)):
        curr = history[i]
        
        # Jeśli brakuje pól zużycia, obliczamy je
        if 'kwh_consumed_heating' not in curr or curr['kwh_consumed_heating'] == 0:
            if i > 0:
                prev = history[i-1]
                # Pobieramy delty produkcji
                d_prod_h = max(0, float(curr.get('kwh_heating', 0)) - float(prev.get('kwh_heating', 0)))
                d_prod_c = max(0, float(curr.get('kwh_cwu', 0)) - float(prev.get('kwh_cwu', 0)))
                
                # Estymujemy prąd dla tego interwału (zakładamy 5 min = /12)
                est_kw = estimate_power_usage(
                    curr.get('compressor_hz', 0), 
                    curr.get('pump_speed', 0), 
                    curr.get('outdoor', 10)
                )
                interval_kwh = round(est_kw / 12, 4)
                
                # Podział
                total_d = d_prod_h + d_prod_c
                if total_d > 0:
                    curr['kwh_consumed_heating'] = round(interval_kwh * (d_prod_h / total_d), 4)
                    curr['kwh_consumed_cwu'] = round(interval_kwh * (d_prod_c / total_d), 4)
                else:
                    curr['kwh_consumed_heating'] = interval_kwh
                    curr['kwh_consumed_cwu'] = 0.0
                
                curr['estimated_power_kw'] = est_kw

    with open(DATA_FILE, 'w') as f:
        json.dump(history, f, indent=4)
    print("Gotowe! Plik data.json został zaktualizowany.")

if __name__ == "__main__":
    repair()