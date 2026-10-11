"""FRED에서 금리·물가를 받아 달걀 모형 위치를 계산하고 data/data.json에 저장한다.

사용법: FRED_API_KEY=... python scripts/update.py
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

from phase import compute_point, compute_trail, yoy

FRED_URL = "https://api.stlouisfed.org/fred/series/observations"
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "data.json"
HISTORY_YEARS = 13
TRAIL_MONTHS = 24


def fetch_series(series_id, api_key, start):
    query = urllib.parse.urlencode({
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": start,
    })
    try:
        with urllib.request.urlopen(f"{FRED_URL}?{query}", timeout=30) as resp:
            return parse_observations(json.load(resp))
    except urllib.error.HTTPError as exc:
        # URL에는 API 키가 들어 있으므로 메시지에 넣지 않는다.
        try:
            detail = json.load(exc).get("error_message", "")
        except ValueError:
            detail = ""
        raise RuntimeError(f"{series_id} 조회 실패 (HTTP {exc.code}) {detail}".strip()) from None


def parse_observations(payload):
    return [
        (o["date"], float(o["value"]))
        for o in payload["observations"]
        if o["value"] not in (".", "")
    ]


def to_monthly(obs):
    return {d[:7]: v for d, v in obs}


def _month_index(month):
    return int(month[:4]) * 12 + int(month[5:7]) - 1


def _month_name(index):
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def _fill_single_gaps(monthly):
    """앞뒤 달 값이 모두 있는 한 달짜리 결측만 평균으로 채운다. 채운 달 목록을 함께 돌려준다.

    예: 2025년 미 정부 셧다운으로 2025-10 CPI가 발표되지 않았다.
    두 달 이상 연속으로 빠진 구간은 그대로 두어 _check_contiguous에서 멈추게 한다.
    """
    filled = dict(monthly)
    added = []
    indexes = sorted(_month_index(m) for m in monthly)
    for a, b in zip(indexes, indexes[1:]):
        if b - a == 2:
            month = _month_name(a + 1)
            filled[month] = (monthly[_month_name(a)] + monthly[_month_name(b)]) / 2
            added.append(month)
    return filled, added


def _year_before(month):
    return f"{int(month[:4]) - 1:04d}{month[4:]}"


def _check_contiguous(months):
    for a, b in zip(months, months[1:]):
        if _month_index(b) - _month_index(a) != 1:
            raise ValueError(f"월간 데이터에 빠진 달이 있습니다: {a} → {b}")


def _latest_yoy(monthly, label):
    month = max(monthly)
    base = monthly.get(_year_before(month))
    if base is None:
        raise ValueError(f"{label}의 {_year_before(month)} 값이 없어 전년비를 계산할 수 없습니다")
    return month, (monthly[month] / base - 1) * 100


def build_payload(fed, cpi, core, dgs10, now):
    interpolated = []
    monthly = []
    for label, obs in (("기준금리", fed), ("CPI", cpi), ("근원 CPI", core)):
        filled, added = _fill_single_gaps(to_monthly(obs))
        monthly.append(filled)
        interpolated += [f"{label} {m}" for m in added]
    fed_m, cpi_m, core_m = monthly

    months = sorted(set(fed_m) & set(cpi_m))
    _check_contiguous(months)
    cpi_yoy = yoy([cpi_m[m] for m in months])
    months = months[12:]
    rates = [fed_m[m] for m in months]

    point = compute_point(rates, cpi_yoy)
    trail = compute_trail(rates, cpi_yoy, TRAIL_MONTHS)
    fed_month = max(fed_m)
    core_month, core_yoy = _latest_yoy(core_m, "근원 CPI")
    dgs10_date, dgs10_value = dgs10[-1]

    payload = {
        "updated_at": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "as_of": months[-1],
        "phase": point["phase"],
        "angle": point["angle"],
        "inputs": {
            "level": round(point["level"], 3),
            "direction": round(point["direction"], 3),
            "cpi_trend": round(point["cpi_trend"], 3),
            "x": round(point["x"], 3),
            "y": round(point["y"], 3),
        },
        "indicators": {
            "fed_funds": {"value": round(fed_m[fed_month], 2), "date": fed_month},
            "dgs10": {"value": round(dgs10_value, 2), "date": dgs10_date},
            "cpi_yoy": {"value": round(cpi_yoy[-1], 2), "date": months[-1]},
            "core_cpi_yoy": {"value": round(core_yoy, 2), "date": core_month},
        },
        "trail": [
            {"month": m, "angle": p["angle"], "phase": p["phase"]}
            for m, p in zip(months[-TRAIL_MONTHS:], trail)
        ],
    }
    if interpolated:
        payload["interpolated"] = interpolated
    return payload


def main(fetch=fetch_series, out_path=OUT_PATH):
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        print("FRED_API_KEY 환경 변수가 없습니다.", file=sys.stderr)
        return 1

    today = date.today()
    start = date(today.year - HISTORY_YEARS, 1, 1).isoformat()
    try:
        series = {sid: fetch(sid, api_key, start)
                  for sid in ("FEDFUNDS", "CPIAUCSL", "CPILFESL", "DGS10")}
        payload = build_payload(series["FEDFUNDS"], series["CPIAUCSL"],
                                series["CPILFESL"], series["DGS10"],
                                now=datetime.now(timezone.utc))
    except Exception as exc:  # 실패하면 기존 data.json을 그대로 둔다
        print(f"갱신 실패: {exc}", file=sys.stderr)
        return 1

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(out_path)
    print(f"{payload['as_of']} 기준 {payload['phase']}국면 ({payload['angle']}°) → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
