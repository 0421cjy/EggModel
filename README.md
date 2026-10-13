# 코스톨라니 달걀 모형

미국 기준금리(FEDFUNDS)와 CPI로 코스톨라니 달걀 모형의 현재 국면을 계산해 보여 주는 정적 페이지입니다.
페이지: https://0421cjy.github.io/EggModel/

GitHub Actions가 매일 한국 시간 오전 7시에 FRED 데이터를 받아 `data/data.json`을 갱신합니다.

## 처음 설정
1. https://fred.stlouisfed.org/docs/api/api_key.html 에서 무료 API 키를 발급받습니다.
2. 저장소 Settings → Secrets and variables → Actions → New repository secret: 이름 `FRED_API_KEY`.
3. Settings → Pages → Source: Deploy from a branch, Branch `main` / `/ (root)`.
4. Actions → Daily data update → Run workflow 로 첫 갱신을 실행합니다.

## 로컬 실행
    python -m pip install -r requirements-dev.txt
    python -m pytest -q
    FRED_API_KEY=발급받은키 python scripts/update.py
    python -m http.server 8000   # http://localhost:8000

## 화면 코드를 바꿀 때
`index.html`에서 `assets/app.js`와 `assets/style.css`를 부르는 주소 끝의 `?v=날짜`를 함께 올려 주세요 (예: `?v=20261012` → `?v=20261020`).
GitHub Pages는 이 파일들을 10분 동안 캐시하므로, 버전을 올리지 않으면 방문자 브라우저가 예전 코드로 새 데이터를 읽다가 오류가 날 수 있습니다.

## 판정 방법
`docs/superpowers/specs/2026-10-11-egg-model-design.md` 4장을 참고하세요.

투자 조언이 아니며, 단순화한 참고 모형입니다.
