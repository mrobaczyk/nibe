import json
import os

# Tu wklej swoją funkcję estimate_power_usage
def estimate_power_usage(hz, pump_speed, temp_ext):
    if hz < 1: return 0.02
    base_hz_coeff = 0.028 
    temp_correction = 1.0
    if temp_ext < 10:
        temp_correction = 1.0 + (10 - temp_ext) * 0.008
    compressor_kw = hz * base_hz_coeff * temp_correction
    if temp_ext < 2.0:
        compressor_kw += 0.07
    circ_pump_kw = 0.06 * (pump_speed / 100)
    return round(compressor_kw + circ_pump_kw, 3)

def test_local_calc():
    with open('../data/data.json', 'r') as f:
        history = json.load(f)

    # Weźmy dane z ostatniej pełnej godziny dla testu
    target_hour = "2026-03-14 16"
    hour_data = [h for h in history if h['timestamp'].startswith(target_hour)]
    
    print(f"--- Test dla godziny: {target_hour}:00 ---")
    print(f"Liczba próbek: {len(hour_data)}")

    total_h = 0
    total_c = 0

    for i, h in enumerate(hour_data):
        prev = hour_data[i-1] if i > 0 else None
        est_kw = estimate_power_usage(h.get('compressor_hz', 0), h.get('pump_speed', 0), h.get('outdoor', 10))
        step = est_kw / 12

        # Logika z Twojego getWorkState (uproszczona pod Python)
        is_running = h.get('compressor_hz', 0) > 0
        is_cwu = False
        if is_running:
            is_defrost = h.get('supply_line_eb101', 30) < 15 or h.get('defrosting', 0) == 1
            if not is_defrost:
                # Delta energii
                p_c_delta = 0
                if prev:
                    p_c_delta = float(h.get('kwh_produced_cwu', 0)) - float(prev.get('kwh_produced_cwu', 0))
                
                # Rezerwa temperaturowa
                delta_bt = h.get('supply_line_eb101', 0) - h.get('bt25_temp', 0)
                
                if p_c_delta > 0 or delta_bt > 5:
                    is_cwu = True

        if is_cwu: total_c += step
        else: total_h += step

    print(f"Wyliczone zużycie CO: {round(total_h, 3)} kWh")
    print(f"Wyliczone zużycie CWU: {round(total_c, 3)} kWh")
    print(f"Suma: {round(total_h + total_c, 3)} kWh")

if __name__ == "__main__":
    test_local_calc()