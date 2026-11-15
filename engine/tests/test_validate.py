import copy

import pytest

from validate import InvalidRequest, parse_request

GOOD = {
    "bbox": [85.28, 27.66, 85.36, 27.74],
    "inflow": {
        "lat": 27.70,
        "lng": 85.32,
        "times": ["2026-11-15T00:00:00Z", "2026-11-15T12:00:00Z"],
        "discharge": [0, 250.5],
    },
    "hours": 24,
}


def with_(path, value):
    body = copy.deepcopy(GOOD)
    target = body
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    return body


def test_accepts_a_good_request():
    req = parse_request(GOOD)
    assert req.hours == 24
    assert req.resolution == 100
    assert req.discharge == (0.0, 250.5)


@pytest.mark.parametrize(
    "body",
    [
        with_(["bbox"], [85.0, 27.0, 85.5, 27.5]),  # ~49 km wide
        with_(["bbox"], [85.36, 27.66, 85.28, 27.74]),  # inverted
        with_(["inflow", "lat"], 28.5),  # outside the box
        with_(["inflow", "discharge"], [0]),  # length mismatch
        with_(["inflow", "discharge"], [0, -1]),
        with_(["inflow", "discharge"], [0, float("nan")]),
        with_(["inflow", "times"], ["2026-11-15T12:00:00Z", "2026-11-15T00:00:00Z"]),
        with_(["hours"], 0),
        with_(["hours"], 73),
        with_(["hours"], 2.5),
        with_(["resolution"], 5),
        "not an object",
    ],
)
def test_rejects_bad_requests(body):
    with pytest.raises(InvalidRequest):
        parse_request(body)


def test_cache_key_is_stable_and_input_sensitive():
    a = parse_request(GOOD).cache_key()
    assert a == parse_request(copy.deepcopy(GOOD)).cache_key()
    assert a != parse_request(with_(["hours"], 12)).cache_key()
    assert len(a) == 16
