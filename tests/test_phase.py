import pytest

from phase import compute_point, compute_trail, phase_for_angle, yoy

FLAT_CPI = [3.0] * 30


def ramp(start, end, n):
    """start 다음부터 end까지 n개월 동안 직선으로 움직이는 값."""
    return [start + (end - start) * (i + 1) / n for i in range(n)]


def test_yoy():
    assert yoy([100.0] * 12 + [103.0]) == pytest.approx([3.0])


def test_phase_for_angle_boundaries():
    assert phase_for_angle(0.0) == "A"
    assert phase_for_angle(59.9) == "A"
    assert phase_for_angle(60.0) == "B"
    assert phase_for_angle(359.9) == "F"


def test_phase_for_angle_wraps():
    assert phase_for_angle(360.0) == "A"


def test_flat_at_peak_is_a():
    rates = [1.0] * 60 + [5.0] * 60
    p = compute_point(rates, FLAT_CPI)
    assert p["level"] == pytest.approx(1.0)
    assert p["angle"] == pytest.approx(0.0)
    assert p["phase"] == "A"


def test_rising_into_peak_is_f():
    rates = [1.0] * 60 + ramp(1.0, 5.0, 24)
    assert compute_point(rates, FLAT_CPI)["phase"] == "F"


def test_falling_from_high_is_b():
    rates = [1.0] * 60 + [5.0] * 48 + ramp(5.0, 3.5, 12)
    assert compute_point(rates, FLAT_CPI)["phase"] == "B"


def test_flat_at_bottom_is_c_or_d():
    rates = [5.0] * 60 + [1.0] * 60
    assert compute_point(rates, FLAT_CPI)["phase"] in ("C", "D")


def test_rising_from_low_is_d():
    rates = [5.0] * 60 + [1.0] * 48 + ramp(1.0, 1.8, 12)
    assert compute_point(rates, FLAT_CPI)["phase"] == "D"


def test_rising_from_middle_is_e():
    rates = [5.0] * 60 + [1.5] * 48 + ramp(1.5, 3.0, 12)
    assert compute_point(rates, FLAT_CPI)["phase"] == "E"


def test_cpi_trend_shifts_x():
    rates = [1.0] * 60 + [3.0] * 60
    rising = compute_point(rates, [2.0] * 26 + [2.5, 3.0, 3.5, 4.0])
    falling = compute_point(rates, [4.0] * 26 + [3.5, 3.0, 2.5, 2.0])
    flat = compute_point(rates, FLAT_CPI)
    assert rising["x"] > flat["x"] > falling["x"]
    assert abs(rising["x"] - flat["x"]) <= 0.25


def test_small_range_gives_mid_level():
    rates = [2.0, 2.1, 2.2, 2.0, 2.1] * 24
    assert compute_point(rates, FLAT_CPI)["level"] == 0.5


def test_level_uses_last_120_months_only():
    rates = [10.0] * 10 + [1.0] * 60 + [3.0] * 60
    assert compute_point(rates, FLAT_CPI)["level"] == pytest.approx(1.0)


def test_angle_range():
    for rates in ([1.0] * 60 + [5.0] * 60, [5.0] * 60 + [1.0] * 60, [2.0] * 120):
        angle = compute_point(rates, FLAT_CPI)["angle"]
        assert 0.0 <= angle < 360.0


def test_too_little_data_raises():
    with pytest.raises(ValueError):
        compute_point([1.0] * 12, FLAT_CPI)
    with pytest.raises(ValueError):
        compute_point([1.0] * 20, [3.0] * 3)


def test_trail_length_and_last_point():
    rates = [1.0] * 60 + [5.0] * 48 + ramp(5.0, 3.5, 12)
    trail = compute_trail(rates, FLAT_CPI, months=24)
    assert len(trail) == 24
    assert trail[-1] == compute_point(rates, FLAT_CPI)
