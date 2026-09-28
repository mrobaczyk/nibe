import requests
import json
import os
import time
from datetime import datetime

from data_utils import (
    DATA_FILE, MAX_HISTORY_RECORDS, PRUNE_HISTORY_TO, STREAM_FILE,
    append_ingest_record, initialize_ingest_checkpoint, ingest_checkpoint_offsets_valid,
    load_hourly_input, load_ingest_checkpoint, load_json_data, recover_ingest_tail,
    rebuild_data_stream, rebuild_ingest_checkpoint, save_json_data_atomic, update_hourly
)

CLIENT_ID = os.getenv('NIBE_CLIENT_ID')
CLIENT_SECRET = os.getenv('NIBE_CLIENT_SECRET')

PARAMS_MAP = {
    "40004": "outdoor",
    "40008": "supply_line", #bt2
    "40012": "return_line", #bt3
    "40013": "cwu_upper", #bt7
    "40014": "cwu_load", #bt6
    "40033": "room", #bt50
    "40067": "out_avg",
    "40071": "bt25_temp", #bt25 - external supply line
    #"40072": "flow_sensor", #bf1
    #"40079": "current_3", #be3
    #"40081": "current_2", #be2
    #"40083": "current_1", #be1
    #"40145": "oil_temp_ep15", #ep15-bt29 
    #"40146": "oil_temp", #bt29 
    #"40782": "req_compressor_freq",
    #"40940": "degree_minutes_curr_value",
    "40941": "dm",
    "43009": "calc_flow",
    #"43081": "time_factor_add_heat",
    "43109": "current_hot_water_mode",
    #"43161": "external_adjustment",
    #"43239": "external_adjustment_hot_water",
    "44055": "return_line_eb101", #eb101-bt3
    "44058": "supply_line_eb101", #eb101-bt12
    #"44059": "discharge_hot_gas", #eb101-bt14
    "44060": "liquid_line", #eb101-bt15
    #"44061": "suction_gas", #eb101-bt17
    #"44064": "compressor_status",
    "44069": "starts",
    "44071": "op_time_total",
    "44073": "op_time_cwu",
    "44298": "kwh_p_cwu", #including additional heat
    "44300": "kwh_p_heat", #including additional heat
    #"44306": "kwh_p_cwu_compressor", #only compressor
    #"44308": "kwh_p_heat_compressor", #only compressor
    #"44362": "outdoor_eb101", #eb101-bt28
    "44363": "evap", #eb101-bt16
    "44396": "pump_speed", #gp1
    "44699": "high_pressure", #eb101-bp4
    "44700": "low_pressure", #eb101-bp8
    "44701": "compressor_hz",
    #"44702": "protection_mode_compressor",
    "44703": "defrosting",
    "47007": "heat_curve",
    "47011": "heat_offset",
    #"47015": "climate_system", 
    #"47041": "hot_water_demand",
    #"47050": "activated",
    #"47051": "period",
    #"47137": "op_mode", 
    "47206": "start_gm_level",
    #"47209": "diff_steps", 
    #"47212": "max_electrical_add", 
    #"47375": "stop_heating", 
    #"47376": "stop_additional_heat", 
    "47377": "filter_time",
    #"48072": "start_additional_heat", 
    "48132": "hot_water_boost",
    #"49909": "hot_water_boost_start_time",
    "50004": "temp_lux"
}


def get_ingest_checkpoint():
    checkpoint = load_ingest_checkpoint()
    if checkpoint is None:
        return initialize_ingest_checkpoint()
    if not ingest_checkpoint_offsets_valid(checkpoint):
        return rebuild_ingest_checkpoint()
    return recover_ingest_tail(checkpoint)


def compact_history_if_needed(checkpoint):
    if checkpoint['record_count'] <= MAX_HISTORY_RECORDS:
        return checkpoint

    history = load_json_data(DATA_FILE)[-PRUNE_HISTORY_TO:]
    save_json_data_atomic(DATA_FILE, history)
    rebuild_data_stream(history)
    print(f"Kompakcja historii: zachowano {len(history)} próbek.")
    return load_ingest_checkpoint()

def get_token():
    url = "https://api.myuplink.com/oauth/token"
    payload = {'grant_type': 'client_credentials', 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET}
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    response = requests.post(url, data=payload, headers=headers)
    response.raise_for_status()
    return response.json()['access_token']

def fetch_data():
    try:
        token = get_token()
        headers = {'Authorization': f'Bearer {token}'}
        
        systems = requests.get("https://api.myuplink.com/v2/systems/me", headers=headers).json()
        dev_id = systems['systems'][0]['devices'][0]['id']
        
        param_ids = ",".join([k for k in PARAMS_MAP.keys()])
        url = f"https://api.myuplink.com/v2/devices/{dev_id}/points?parameters={param_ids}"
        points = requests.get(url, headers=headers).json()
        
        new_full_entry = {"ts": time.strftime("%Y-%m-%d %H:%M")}
        for p in points:
            p_id = str(p['parameterId'])
            if p_id in PARAMS_MAP: 
                new_full_entry[PARAMS_MAP[p_id]] = p['value']

        print(f"--- RAW_DATA_START ---")
        print(json.dumps(new_full_entry))
        print(f"--- RAW_DATA_END ---")

        checkpoint = get_ingest_checkpoint()
        checkpoint, added = append_ingest_record(new_full_entry, checkpoint)
        if added:
            print(f"Dodano próbkę do strumienia: {new_full_entry['ts']}")
        else:
            print(f"Pomijam powtórzony lub starszy timestamp: {new_full_entry['ts']}")

        checkpoint = compact_history_if_needed(checkpoint)

        # C. hourly_stats.json
        update_hourly(load_hourly_input(), full_rebuild=False)

        print(f"Sukces: {new_full_entry['ts']}")

    except Exception as e: 
        print(f"Błąd: {e}")

if __name__ == "__main__":
    fetch_data()