import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import set_nibe_parameters


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f'HTTP {self.status_code}')


class NibeParameterTests(unittest.TestCase):
    def setUp(self):
        self.metadata = [
            {'parameterId': '40941', 'writable': True, 'minValue': -4000, 'maxValue': 100, 'stepValue': 10},
            {'parameterId': '47007', 'writable': True, 'minValue': 0, 'maxValue': 15, 'stepValue': 1},
            {'parameterId': '47011', 'writable': True, 'minValue': -10, 'maxValue': 10, 'stepValue': 1},
        ]

    def test_accepts_only_allowed_finite_numeric_values(self):
        values = set_nibe_parameters.parse_parameter_values('{"40941": -120, "47007": "5.0"}')
        self.assertEqual(values, {'40941': '-120', '47007': '5.0'})

        for payload in ('{"12345": 1}', '{"40941": NaN}', '[]', '{}'):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                set_nibe_parameters.parse_parameter_values(payload)

    def test_checks_writable_minimum_maximum_and_step(self):
        values = {'40941': '-120', '47007': '5', '47011': '-2'}
        self.assertEqual(set_nibe_parameters.validate_parameter_values(values, self.metadata), values)

        invalid_values = (
            {'40941': '-121'},
            {'47007': '16'},
            {'47011': '2.5'},
        )
        for value in invalid_values:
            with self.subTest(value=value), self.assertRaises(ValueError):
                set_nibe_parameters.validate_parameter_values(value, self.metadata)

        read_only = [{'parameterId': '40941', 'writable': False}]
        with self.assertRaisesRegex(ValueError, 'nie jest zapisywalny'):
            set_nibe_parameters.validate_parameter_values({'40941': '0'}, read_only)

    def test_patch_sends_parameter_ids_as_string_values(self):
        values = '{"40941": -120}'
        systems_response = FakeResponse({'systems': [{'devices': [{'id': 'device-1'}]}]})
        points_response = FakeResponse([self.metadata[0]])
        patch_response = FakeResponse({'40941': 'modified'})

        with patch.object(set_nibe_parameters, 'get_token', return_value='test-token'), \
                patch.object(set_nibe_parameters.requests, 'get', side_effect=[systems_response, points_response]), \
                patch.object(set_nibe_parameters.requests, 'patch', return_value=patch_response) as patch_call:
            set_nibe_parameters.update_parameters(values)

        self.assertEqual(patch_call.call_args.kwargs['json'], {'40941': '-120'})
        self.assertIn('/v2/devices/device-1/points', patch_call.call_args.args[0])

    def test_patch_rejects_api_not_available_result(self):
        systems_response = FakeResponse({'systems': [{'devices': [{'id': 'device-1'}]}]})
        points_response = FakeResponse([self.metadata[0]])
        patch_response = FakeResponse({'40941': 'NOT AVAILABLE'})

        with patch.object(set_nibe_parameters, 'get_token', return_value='test-token'), \
                patch.object(set_nibe_parameters.requests, 'get', side_effect=[systems_response, points_response]), \
                patch.object(set_nibe_parameters.requests, 'patch', return_value=patch_response), \
                self.assertRaisesRegex(RuntimeError, 'odrzucił część zmian'):
            set_nibe_parameters.update_parameters('{"40941": -120}')


if __name__ == '__main__':
    unittest.main()