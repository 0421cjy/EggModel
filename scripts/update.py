"""FRED에서 금리·물가를 받아 달걀 모형 위치를 계산하고 data/data.json에 저장한다.

사용법: FRED_API_KEY=... python scripts/update.py
"""
import json
import os
import sys
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
    with urllib.request.urlopen(f"{FRED_URL}?{query}", timeout=30) as resp:
        return parse_observations(json.load(resp))


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


def _year_before(month):
    return f"{int(month[:4]) - 1:04d}{month[4:]}"


def _check_contiguous(months):
    for a, b in zip(months, months[1:]):
        if _month_index(b) - _month_index(a) != 1:
            raise ValueError(f"월간 데이터에 빠진 달이 있습니다: {a} → {b}")


def _latest_yoy(monthly):
    month = max(monthly)
    return month, (monthly[month] / monthly[_year_before(month)] - 1) * 100


def build_payload(fed, cpi, core, dgs10, now):
    fed_m, cpi_m, core_m = to_monthly(fed), to_monthly(cpi), to_monthly(core)

    months = sorted(set(fed_m) & set(cpi_m))
    _check_contiguous(months)
    cpi_yoy = yoy([cpi_m[m] for m in months])
    months = months[12:]
    rates = [fed_m[m] for m in months]

    point = compute_point(rates, cpi_yoy)
    trail = compute_trail(rates, cpi_yoy, TRAIL_MONTHS)
    fed_month = max(fed_m)
    core_month, core_yoy = _latest_yoy(core_m)
    dgs10_date, dgs10_value = dgs10[-1]

    return {
        "updated_at": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "as_of": months[-1],
        "phase": point["phase"],
        "angle": round(point["angle"], 1),
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
            {"month": m, "angle": round(p["angle"], 1), "phase": p["phase"]}
            for m, p in zip(months[-TRAIL_MONTHS:], trail)
        ],
    }


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
