// 금리 고점(맨 위)에서 시계방향으로 도는 순서대로 나열한 국면. 고점·저점은 구간이 아니라 전환점이라 판정 대상(PHASES)에서 빠진다.
const STAGES = [
  { key: "B1", name: "하락 조정 국면", desc: "저점부터 A1~A3 국면을 거치며 주가가 높아졌고, 소신파 투자자가 부화뇌동파 투자자에게 주식을 넘긴 상태" },
  { key: "B2", name: "하락 동행 국면", desc: "B1 국면과 크게 다르지 않지만 가격 하락이 진행되는 상태" },
  { key: "B3", name: "하락 과장 국면", desc: "시장의 공포가 최고조인 상태" },
  { key: "저점", turning: true, desc: "B3 국면의 끝. 주가가 많이 떨어졌고 비관주의가 여전한 상태" },
  { key: "A1", name: "상승 조정 국면", desc: "저점을 지나 상승 국면에 진입하기 시작하는 상태" },
  { key: "A2", name: "상승 동행 국면", desc: "자산 가격 상승이 실물경기 상승을 앞지르는 상태" },
  { key: "A3", name: "상승 과장 국면", desc: "실물경기까지 회복되어 가며 과장 국면에 진입하는 상태" },
  { key: "고점", turning: true, desc: "경기부양책이 중단되고 인플레이션 우려가 등장하기 시작하며 주가가 고점을 맞이한 상태" },
];
const PHASES = Object.fromEntries(STAGES.filter((s) => !s.turning).map((s) => [s.key, s]));
const ORDER = Object.keys(PHASES);
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const SVG_NS = "http://www.w3.org/2000/svg";
const CX = 200, CY = 235, RX = 140, RY = 175;

// 맨 위(금리 고점)에서 시작해 오른쪽 → 아래 → 왼쪽으로, 시계방향으로 도는 각도(도)를 달걀 둘레 좌표로 바꾼다.
// 위쪽이 좁은 달걀 모양이 되도록 가로 폭을 cos에 따라 줄인다.
function eggPoint(deg, scale = 1) {
  const t = (deg * Math.PI) / 180;
  const width = RX * (1 - 0.12 * Math.cos(t));
  return [CX + width * Math.sin(t) * scale, CY - RY * Math.cos(t) * scale];
}

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function polyline(points) {
  return points.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" L");
}

function arcPath(from, to) {
  const pts = [];
  for (let d = from; d <= to; d += 2) pts.push(eggPoint(d));
  return `M${CX},${CY} L${polyline(pts)} Z`;
}

// 점 위에 올리면 월·국면이 보이는 툴팁. 실제 점보다 넓은 투명 원을 받침으로 둔다.
function dot(svg, angle, r, cls, label) {
  const [x, y] = eggPoint(angle);
  const g = el("g");
  g.append(el("title", {}, label));
  g.append(el("circle", { cx: x, cy: y, r: Math.max(r, 12), class: "hit" }));
  g.append(el("circle", { cx: x, cy: y, r, class: cls }));
  svg.append(g);
}

function sideLabel(x, arrow, text) {
  const label = el("text", { x, y: CY - 6, class: "axis-label" });
  label.append(el("tspan", { x, dy: 0 }, arrow), el("tspan", { x, dy: "1.2em" }, text));
  return label;
}

function drawEgg(svg, data) {
  svg.replaceChildren();
  ORDER.forEach((key, i) => {
    const cls = ["sector", i % 2 ? "alt" : "", key === data.phase ? "current" : ""].join(" ").trim();
    svg.append(el("path", { d: arcPath(i * 60, i * 60 + 60), class: cls }));
  });
  const outline = [];
  for (let d = 0; d <= 360; d += 2) outline.push(eggPoint(d));
  svg.append(el("path", { d: `M${polyline(outline)} Z`, class: "outline" }));

  ORDER.forEach((key, i) => {
    const [x, y] = eggPoint(i * 60 + 30, 0.62);
    svg.append(el("text", { x, y, class: "phase-label" + (key === data.phase ? " current" : "") }, key));
  });

  svg.append(el("text", { x: CX, y: 34, class: "axis-label" }, "금리 고점 · 주가 고점"));
  svg.append(el("text", { x: CX, y: 446, class: "axis-label" }, "금리 저점 · 주가 저점"));
  // 좌우 라벨은 화살표와 글자를 두 줄로 나눠, 모바일에서 글자를 키워도 달걀과 겹치지 않게 한다.
  svg.append(sideLabel(9, "←", "금리 상승"));
  svg.append(sideLabel(391, "→", "금리 하락"));

  dot(svg, data.angle, 10, "now", `${data.as_of} · ${data.phase} ${PHASES[data.phase].name} (현재)`);
}

function card(label, indicator, unit) {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `<p class="label"></p><p class="value"></p><p class="date"></p>`;
  div.querySelector(".label").textContent = label;
  div.querySelector(".value").textContent = `${indicator.value.toFixed(2)}${unit}`;
  div.querySelector(".date").textContent = `기준 ${indicator.date}`;
  return div;
}

function stageItem(stage, current) {
  const li = document.createElement("li");
  li.className = ["stage", stage.turning ? "turning" : "", current ? "current" : ""].join(" ").trim();
  if (current) li.setAttribute("aria-current", "step");
  li.innerHTML = `<p class="stage-head"><b class="stage-key"></b><span class="stage-name"></span></p><p class="stage-desc"></p>`;
  li.querySelector(".stage-key").textContent = stage.key;
  li.querySelector(".stage-name").textContent = stage.turning ? "전환점" : stage.name;
  if (current) {
    const badge = document.createElement("span");
    badge.className = "now-badge";
    badge.textContent = "현재";
    li.querySelector(".stage-head").append(badge);
  }
  li.querySelector(".stage-desc").textContent = stage.desc;
  return li;
}

function showNotice(text) {
  const n = document.getElementById("notice");
  n.textContent = text;
  n.hidden = false;
}

function render(data) {
  const meta = PHASES[data.phase];
  const title = document.getElementById("phase-title");
  title.innerHTML = `<span class="badge"></span> · `;
  title.querySelector(".badge").textContent = data.phase;
  title.append(meta.name);
  document.getElementById("phase-action").textContent = `${data.as_of} 기준 · ${meta.desc}`;
  document.getElementById("egg-desc").textContent =
    `현재 ${data.phase}(${meta.name}), 달걀 맨 위에서 ${data.angle.toFixed(0)}° 지점` +
    (data.interpolated ? ` · 발표되지 않아 앞뒤 달 평균으로 채운 값: ${data.interpolated.join(", ")}` : "");

  drawEgg(document.getElementById("egg"), data);
  document.getElementById("stages").replaceChildren(
    ...STAGES.map((stage) => stageItem(stage, stage.key === data.phase)),
  );

  const ind = data.indicators;
  document.getElementById("cards").replaceChildren(
    card("기준금리 (실효 FFR)", ind.fed_funds, "%"),
    card("미 국채 10년물", ind.dgs10, "%"),
    card("CPI 상승률 (전년비)", ind.cpi_yoy, "%"),
    card("근원 CPI (전년비)", ind.core_cpi_yoy, "%"),
  );

  const updated = new Date(data.updated_at);
  document.getElementById("updated").textContent = updated.toLocaleString("ko-KR");
  if (data.sample) showNotice("예시 데이터입니다. 첫 자동 갱신 후 실제 값으로 바뀝니다.");
  else if (Date.now() - updated.getTime() > STALE_MS) showNotice("데이터가 오래되었습니다. 자동 갱신이 멈췄는지 확인해 주세요.");
}

fetch("data/data.json", { cache: "no-cache" })
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(render)
  .catch((err) => {
    document.getElementById("phase-title").textContent = "데이터를 불러오지 못했습니다";
    showNotice(String(err));
  });
