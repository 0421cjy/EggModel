import json
from datetime import datetime, timezone

import pytest

import update

NOW = datetime(2026, 10, 11, 22, 0, tzinfo=timezone.utc)


def monthly(first_year, last_month, value_fn):
    """first_year-01부터 last_month("YYYY-MM")까지 월초 날짜 관측값 목록."""
    out, y, m, i = [], first_year, 1, 0
    while f"{y:04d}-{m:02d}" <= last_month:
        out.append((f"{y:04d}-{m:02d}-01", value_fn(i)))
        i += 1
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def sample_inputs():
    fed = monthly(2013, "2026-09", lambda i: 1.0 + (i % 60) / 15)
    cpi = monthly(2013, "2026-08", lambda i: 230.0 * 1.003 ** i)
    core = monthly(2013, "2026-08", lambda i: 235.0 * 1.0025 ** i)
    dgs10 = [("2026-10-08", 4.05), ("2026-10-09", 4.12)]
    return fed, cpi, core, dgs10


def test_parse_observations_skips_missing():
    payload = {"observations": [
        {"date": "2026-01-01", "value": "4.33"},
        {"date": "2026-02-01", "value": "."},
        {"date": "2026-03-01", "value": ""},
    ]}
    assert update.parse_observations(payload) == [("2026-01-01", 4.33)]


def test_to_monthly():
    assert update.to_monthly([("2026-01-01", 1.0), ("2026-02-01", 2.0)]) == {
        "2026-01": 1.0, "2026-02": 2.0}


def test_payload_shape():
    p = update.build_payload(*sample_inputs(), now=NOW)
    assert p["updated_at"] == "2026-10-11T22:00:00Z"
    assert p["phase"] in "ABCDEF"
    assert 0.0 <= p["angle"] < 360.0
    assert set(p["inputs"]) == {"level", "direction", "cpi_trend", "x", "y"}
    assert set(p["indicators"]) == {"fed_funds", "dgs10", "cpi_yoy", "core_cpi_yoy"}
    assert len(p["trail"]) == 24
    assert p["trail"][-1]["month"] == p["as_of"]
    assert p["trail"][-1]["phase"] == p["phase"]
    assert "sample" not in p
    json.dumps(p)  # 직렬화 가능해야 한다


def test_as_of_uses_common_last_month():
    p = update.build_payload(*sample_inputs(), now=NOW)
    assert p["as_of"] == "2026-08"
    assert p["indicators"]["fed_funds"]["date"] == "2026-09"
    assert p["indicators"]["cpi_yoy"]["date"] == "2026-08"


def test_cpi_yoy_value():
    p = update.build_payload(*sample_inputs(), now=NOW)
    assert p["indicators"]["cpi_yoy"]["value"] == pytest.approx((1.003 ** 12 - 1) * 100, abs=0.01)


def test_dgs10_skips_missing_latest():
    fed, cpi, core, _ = sample_inputs()
    raw = {"observations": [
        {"date": "2026-10-09", "value": "4.12"},
        {"date": "2026-10-10", "value": "."},
    ]}
    p = update.build_payload(fed, cpi, core, update.parse_observations(raw), now=NOW)
    assert p["indicators"]["dgs10"] == {"value": 4.12, "date": "2026-10-09"}


def test_gap_in_months_raises():
    fed, cpi, core, dgs10 = sample_inputs()
    fed = [o for o in fed if not o[0].startswith("2020-05")]
    with pytest.raises(ValueError):
        update.build_payload(fed, cpi, core, dgs10, now=NOW)


def test_main_writes_file(tmp_path, monkeypatch):
    fed, cpi, core, dgs10 = sample_inputs()
    series = {"FEDFUNDS": fed, "CPIAUCSL": cpi, "CPILFESL": core, "DGS10": dgs10}
    monkeypatch.setenv("FRED_API_KEY", "test-key")
    out = tmp_path / "data.json"
    assert update.main(fetch=lambda sid, key, start: series[sid], out_path=out) == 0
    assert json.loads(out.read_text(encoding="utf-8"))["as_of"] == "2026-08"


def test_main_without_key_does_not_write(tmp_path, monkeypatch):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    out = tmp_path / "data.json"
    out.write_text("old", encoding="utf-8")
    assert update.main(fetch=lambda *a: [], out_path=out) != 0
    assert out.read_text(encoding="utf-8") == "old"


def test_main_fetch_error_keeps_file(tmp_path, monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "test-key")
    out = tmp_path / "data.json"
    out.write_text("old", encoding="utf-8")

    def boom(*a):
        raise OSError("network down")

    assert update.main(fetch=boom, out_path=out) != 0
    assert out.read_text(encoding="utf-8") == "old"
