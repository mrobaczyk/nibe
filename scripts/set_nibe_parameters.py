import json
import os
import sys
from decimal import Decimal, InvalidOperation

import requests

from fetch_nibe import get_token


API_BASE_URL = 'https://api.myuplink.com'
ALLOWED_PARAMETERS = {'40941', '47007', '47011'}


def parse_parameter_values(serialized_values):
    try:
        values = json.loads(serialized_values)
    except (TypeError, json.JSONDecodeError) as error:
        raise ValueError('Wartości parametrów muszą być poprawnym JSON-em.') from error

    if not isinstance(values, dict) or not values or len(values) > len(ALLOWED_PARAMETERS):
        raise ValueError('Oczekiwano mapy z 1-3 parametrami.')

    updates = {}
    for parameter_id, value in values.items():
        parameter_id = str(parameter_id)
        if parameter_id not in ALLOWED_PARAMETERS:
            raise ValueError(f'Parametr {parameter_id} nie jest dozwolony.')
        if isinstance(value, bool):
            raise ValueError(f'Wartość parametru {parameter_id} musi być liczbą.')

        try:
            number = Decimal(str(value))
        except InvalidOperation as error:
            raise ValueError(f'Wartość parametru {parameter_id} musi być liczbą.') from error
        if not number.is_finite():
            raise ValueError(f'Wartość parametru {parameter_id} musi być skończona.')

        updates[parameter_id] = format(number, 'f')

    return updates


def _optional_decimal(value):
    if value is None or value == '':
        return None
    try:
        result = Decimal(str(value))
    except InvalidOperation:
        return None
    return result if result.is_finite() else None


def validate_parameter_values(updates, parameters):
    parameter_map = {str(point.get('parameterId')): point for point in parameters}

    for parameter_id, value in updates.items():
        metadata = parameter_map.get(parameter_id)
        if metadata is None:
            raise ValueError(f'API nie zwróciło parametru {parameter_id}.')
        if metadata.get('writable') is not True:
            raise ValueError(f'Parametr {parameter_id} nie jest zapisywalny w myUplink.')

        number = Decimal(value)
        minimum = _optional_decimal(metadata.get('minValue'))
        maximum = _optional_decimal(metadata.get('maxValue'))
        step = _optional_decimal(metadata.get('stepValue'))

        if minimum is not None and number < minimum:
            raise ValueError(f'Parametr {parameter_id}: minimum to {minimum}.')
        if maximum is not None and number > maximum:
            raise ValueError(f'Parametr {parameter_id}: maksimum to {maximum}.')
        if step is not None and step > 0:
            anchor = minimum if minimum is not None else Decimal(0)
            step_count = (number - anchor) / step
            if step_count != step_count.to_integral_value():
                raise ValueError(f'Parametr {parameter_id}: dozwolony krok to {step}.')

    return updates


def get_device_id(headers):
    response = requests.get(f'{API_BASE_URL}/v2/systems/me', headers=headers, timeout=30)
    response.raise_for_status()
    systems = response.json().get('systems', [])
    if not systems or not systems[0].get('devices'):
        raise RuntimeError('Nie znaleziono urządzenia NIBE na koncie myUplink.')
    return systems[0]['devices'][0]['id']


def update_parameters(serialized_values):
    updates = parse_parameter_values(serialized_values)
    token = get_token()
    headers = {'Authorization': f'Bearer {token}'}
    device_id = get_device_id(headers)

    points_response = requests.get(
        f'{API_BASE_URL}/v2/devices/{device_id}/points',
        headers=headers,
        params={'parameters': ','.join(updates)},
        timeout=30
    )
    points_response.raise_for_status()
    validate_parameter_values(updates, points_response.json())

    response = requests.patch(
        f'{API_BASE_URL}/v2/devices/{device_id}/points',
        headers=headers,
        json=updates,
        timeout=30
    )
    if response.status_code not in (200, 207):
        response.raise_for_status()
        raise RuntimeError(f'Nieoczekiwany status odpowiedzi myUplink: {response.status_code}.')

    try:
        result = response.json()
    except ValueError:
        result = None

    if isinstance(result, dict):
        failed = {
            parameter_id: status
            for parameter_id, status in result.items()
            if any(term in str(status).lower() for term in ('error', 'fail', 'not available'))
        }
        if failed:
            raise RuntimeError(f'myUplink odrzucił część zmian: {json.dumps(failed)}')

    print(json.dumps({'deviceId': device_id, 'updated': updates, 'result': result}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        update_parameters(os.environ['NIBE_PARAMETER_VALUES'])
    except Exception as error:
        print(f'Błąd aktualizacji parametrów NIBE: {error}', file=sys.stderr)
        raise SystemExit(1)