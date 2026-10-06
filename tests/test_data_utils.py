import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import data_utils


class DataUtilsTests(unittest.TestCase):
    def test_estimate_power_usage_matches_shared_model_reference_values(self):
        # Te same wartości sprawdza tests/js/dataProcessing.test.mjs dla frontendu.
        self.assertEqual(data_utils.estimate_power_usage(40, 50, 5), 1.195)
        self.assertEqual(data_utils.estimate_power_usage(40, 50, 0), 1.31)
        self.assertEqual(data_utils.estimate_power_usage(0, 0, 5), 0.02)
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        root = Path(self.temp_dir.name)
        self.paths = {
            'DATA_FILE': str(root / 'data.json'),
            'STREAM_FILE': str(root / 'data_stream.json'),
            'HOURLY_FILE': str(root / 'hourly_stats.json'),
            'HOURLY_STATE_FILE': str(root / 'hourly_state.json'),
            'INGEST_STATE_FILE': str(root / 'ingest_state.json'),
        }
        path_patcher = patch.multiple(data_utils, **self.paths)
        path_patcher.start()
        self.addCleanup(path_patcher.stop)

    @staticmethod
    def make_record(timestamp, index):
        return {
            'ts': timestamp,
            'starts': 100 + index // 6,
            'op_time_total': index * 0.08,
            'op_time_cwu': index * 0.03,
            'kwh_p_heat': index * 0.12,
            'kwh_p_cwu': index * 0.04,
            'compressor_hz': 45 if index % 4 else 0,
            'pump_speed': 30,
            'outdoor': 4 + index % 3,
            'current_hot_water_mode': index % 2,
        }

    def test_jsonl_append_recovers_partial_tail_and_reads_offsets(self):
        first = self.make_record('2026-09-28 10:00', 1)
        second = self.make_record('2026-09-28 10:05', 2)
        third = self.make_record('2026-09-28 10:10', 3)

        offset = data_utils.append_jsonl_record(self.paths['DATA_FILE'], first)
        data_utils.append_jsonl_record(self.paths['DATA_FILE'], second)
        with open(self.paths['DATA_FILE'], 'ab') as f:
            f.write(b'{"ts":')

        self.assertEqual(data_utils.read_last_jsonl_record(self.paths['DATA_FILE']), second)
        self.assertEqual(data_utils.read_jsonl_from_offset(self.paths['DATA_FILE'], offset), [second])
        data_utils.append_jsonl_record(self.paths['DATA_FILE'], third)
        self.assertEqual(data_utils.load_json_data(self.paths['DATA_FILE']), [first, second, third])

    def test_ingest_checkpoint_recovers_both_partial_write_orders_and_deduplicates(self):
        history = [
            self.make_record('2026-09-28 10:00', 1),
            self.make_record('2026-09-28 10:05', 2),
        ]
        state = {}
        for entry in history:
            data_utils.append_jsonl_record(self.paths['DATA_FILE'], entry)
            delta, state = data_utils.process_delta(entry, state, state.get('ts'))
            data_utils.append_jsonl_record(self.paths['STREAM_FILE'], delta)

        checkpoint = data_utils.initialize_ingest_checkpoint()
        raw_only = self.make_record('2026-09-28 10:10', 3)
        data_utils.append_jsonl_record(self.paths['DATA_FILE'], raw_only)
        checkpoint = data_utils.recover_ingest_tail(checkpoint)
        self.assertEqual(checkpoint['last_ts'], raw_only['ts'])
        self.assertEqual(data_utils.read_last_jsonl_record(self.paths['STREAM_FILE'])['ts'], raw_only['ts'])

        checkpoint, added = data_utils.append_ingest_record(raw_only, checkpoint)
        self.assertFalse(added)
        self.assertEqual(checkpoint['record_count'], 3)

        stream_written = self.make_record('2026-09-28 10:15', 4)
        data_utils.append_jsonl_record(self.paths['DATA_FILE'], stream_written)
        delta, _ = data_utils.process_delta(stream_written, checkpoint['state'], checkpoint['last_ts'])
        data_utils.append_jsonl_record(self.paths['STREAM_FILE'], delta)
        checkpoint = data_utils.recover_ingest_tail(checkpoint)

        self.assertEqual(checkpoint['last_ts'], stream_written['ts'])
        self.assertEqual(data_utils.count_jsonl_records(self.paths['STREAM_FILE']), 4)

    def test_full_stream_rebuild_writes_ingest_checkpoint(self):
        history = [
            self.make_record('2026-09-28 10:00', 1),
            self.make_record('2026-09-28 10:05', 2),
        ]
        for entry in history:
            data_utils.append_jsonl_record(self.paths['DATA_FILE'], entry)

        data_utils.rebuild_data_stream(history)
        checkpoint = data_utils.load_ingest_checkpoint()

        self.assertEqual(checkpoint['last_ts'], history[-1]['ts'])
        self.assertEqual(checkpoint['record_count'], len(history))
        self.assertEqual(checkpoint['state']['kwh_p_heat'], history[-1]['kwh_p_heat'])

    def test_hourly_incremental_matches_full_rebuild_across_hour_gaps(self):
        start = datetime(2026, 9, 28, 9, 55)
        timestamps = [start + timedelta(minutes=5 * index) for index in range(13)]
        timestamps += [
            datetime(2026, 9, 28, 11, 0),
            datetime(2026, 9, 28, 11, 5),
            datetime(2026, 9, 28, 11, 10),
            datetime(2026, 9, 28, 12, 0),
            datetime(2026, 9, 28, 13, 0),
        ]
        history = [
            self.make_record(timestamp.strftime('%Y-%m-%d %H:%M'), index)
            for index, timestamp in enumerate(timestamps)
        ]

        incremental_path = os.path.join(self.temp_dir.name, 'incremental.jsonl')
        incremental_state = os.path.join(self.temp_dir.name, 'incremental_state.json')
        with patch.multiple(data_utils, HOURLY_FILE=incremental_path, HOURLY_STATE_FILE=incremental_state):
            data_utils.update_hourly(history[:13])
            data_utils.update_hourly(history[:16])
            data_utils.update_hourly(history[:17])
            data_utils.update_hourly(history)
            incremental = data_utils.load_json_data(incremental_path)

        full_path = os.path.join(self.temp_dir.name, 'full.jsonl')
        full_state = os.path.join(self.temp_dir.name, 'full_state.json')
        with patch.multiple(data_utils, HOURLY_FILE=full_path, HOURLY_STATE_FILE=full_state):
            data_utils.update_hourly(history, full_rebuild=True)
            rebuilt = data_utils.load_json_data(full_path)

        self.assertEqual(incremental, rebuilt)

    def test_hourly_input_starts_at_checkpoint_hour(self):
        history = [
            self.make_record('2026-09-28 09:55', 1),
            self.make_record('2026-09-28 10:00', 2),
            self.make_record('2026-09-28 10:05', 3),
        ]
        for entry in history:
            data_utils.append_jsonl_record(self.paths['DATA_FILE'], entry)
        with open(self.paths['HOURLY_STATE_FILE'], 'w', encoding='utf-8') as f:
            json.dump({'hour': '2026-09-28 10', 'state_start': {}, 'state_end': {}}, f)

        self.assertEqual(data_utils.load_hourly_input(), history[1:])


if __name__ == '__main__':
    unittest.main()