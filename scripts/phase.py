"""코스톨라니 달걀 모형의 국면 계산. 네트워크 없이 순수 함수만 둔다."""
import math

# 금리 고점(주가 고점)에서 시계방향으로: 하락 국면 B1~B3, 금리 저점(주가 저점) 이후 상승 국면 A1~A3
PHASES = ["B1", "B2", "B3", "A1", "A2", "A3"]

LEVEL_WINDOW = 120     # 수준을 잴 기간(개월)
DIRECTION_LAG = 12     # 방향을 잴 금리 변화 기간(개월)
DIRECTION_SCALE = 1.0  # tanh 정규화 기준(%p)
CPI_TREND_LAG = 3      # CPI 추세 기간(개월)
CPI_SCALE = 0.5        # CPI 추세 정규화 기준(%p)
CPI_WEIGHT = 0.25      # CPI 보정 최대 폭
MIN_RANGE = 0.5        # 이보다 좁은 금리 범위면 수준을 0.5로 본다(%p)


def yoy(series):
    """12개월 전 대비 상승률(%). 결과 길이는 len(series) - 12."""
    return [(series[i] / series[i - 12] - 1) * 100 for i in range(12, len(series))]


def normalize_angle(angle):
    """소수 첫째 자리로 반올림해 0 이상 360 미만으로 맞춘다 (359.96 → 0.0)."""
    return round(angle, 1) % 360.0


def phase_for_angle(angle):
    return PHASES[int(angle // 60) % 6]


def compute_point(rates, cpi_yoy):
    """rates, cpi_yoy의 마지막 원소(같은 달)를 기준으로 달걀 위 위치를 계산한다."""
    if len(rates) < DIRECTION_LAG + 1:
        raise ValueError(f"기준금리 데이터가 부족합니다: {len(rates)}개월")
    if len(cpi_yoy) < CPI_TREND_LAG + 1:
        raise ValueError(f"CPI 데이터가 부족합니다: {len(cpi_yoy)}개월")

    current = rates[-1]
    window = rates[-LEVEL_WINDOW:]
    low, high = min(window), max(window)
    level = 0.5 if high - low < MIN_RANGE else (current - low) / (high - low)

    direction = math.tanh((current - rates[-1 - DIRECTION_LAG]) / DIRECTION_SCALE)
    cpi_trend = cpi_yoy[-1] - cpi_yoy[-1 - CPI_TREND_LAG]
    x = max(-1.0, min(1.0, direction + CPI_WEIGHT * math.tanh(cpi_trend / CPI_SCALE)))
    y = 2 * level - 1

    # 화면·JSON에 쓰는 반올림 값으로 국면을 정해야 둘이 어긋나지 않는다.
    angle = normalize_angle(math.degrees(math.atan2(-x, y)))

    return {
        "level": level,
        "direction": direction,
        "cpi_trend": cpi_trend,
        "x": x,
        "y": y,
        "angle": angle,
        "phase": phase_for_angle(angle),
    }


def compute_trail(rates, cpi_yoy, months=24):
    """최근 months개월의 위치 목록. 오래된 달부터, 마지막이 현재 달."""
    trail = []
    for back in range(months - 1, -1, -1):
        trail.append(compute_point(rates[:len(rates) - back], cpi_yoy[:len(cpi_yoy) - back]))
    return trail
