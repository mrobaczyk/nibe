import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import config_history


def points(**overrides):
    values = {47669: 1, 47671: 62100, 47687: 0, 47635: 1, 47043: 42.0, 47206: -180.0, 47377: 24.0, 40004: 11.3}
    values.update({int(k[1:]): v for k, v in overrides.items()})
    return [{'parameterId': str(pid), 'value': val} for pid, val in values.items()]


class ConfigHistoryTests(unittest.TestCase):
    def test_config_ids_cover_requested_parameters(self):
        self.assertEqual(len(config_history.CWU_SCHEDULE_1_IDS), 22)
        self.assertEqual(len(config_history.CWU_SCHEDULE_2_IDS), 22)
        for pid in ('47669', '47693', '47635', '47659', '47043', '47049', '47206', '47377'):
            self.assertIn(pid, config_history.CONFIG_IDS)
        self.assertNotIn('47678', config_history.CONFIG_IDS)
        self.assertNotIn('47686', config_history.CONFIG_IDS)

    def test_extract_ignores_other_parameters(self):
        values = config_history.extract_config_values(points())
        self.assertNotIn('40004', values)
        self.assertEqual(values['47671'], 62100)

    def test_periodic_increase_date_parsed_from_truncated_name(self):
        now = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
        parse = config_history.parse_periodic_increase_date
        self.assertEqual(parse('Next periodic increase: 03 . 11 . 2', now), '2026-11-03')
        self.assertEqual(parse('Next periodic increase: 03 . 12 . 2026', now), '2026-12-03')
        self.assertIsNone(parse('Next periodic increase', now))
        values = config_history.extract_config_values(
            [{'parameterId': '50249', 'parameterName': 'Next periodic increase: 03 . 11 . 2', 'value': 3.0}], now)
        self.assertEqual(values['50249'], '2026-11-03')

    def test_history_stores_baseline_then_only_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'config_history.json')
            t1 = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
            t2 = datetime(2026, 11, 4, 13, 0, tzinfo=timezone.utc)
            t3 = datetime(2026, 11, 4, 14, 0, tzinfo=timezone.utc)

            first = config_history.update_config_history(points(), path, now=t1)
            self.assertEqual(len(first['values']), 7)
            self.assertIsNone(config_history.update_config_history(points(), path, now=t2))
            second = config_history.update_config_history(points(p47687=2), path, now=t3)
            self.assertEqual(second, {'ts': '2026-11-04 14:00', 'values': {'47687': 2}})

            history = config_history.load_history(path)
            self.assertEqual(len(history), 2)
            self.assertEqual(config_history.reconstruct_state(history)['47687'], 2)

            with open(path, encoding='utf-8') as f:
                lines = f.read().splitlines()
            self.assertEqual(len(lines), 2)
            self.assertTrue(lines[0].startswith('[{"ts"') and lines[0].endswith('},'))
            self.assertTrue(lines[1].endswith('}]'))


if __name__ == '__main__':
    unittest.main()
