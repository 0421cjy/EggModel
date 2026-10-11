// 금리 고점(맨 위)에서 시계방향으로 도는 순서대로 나열한 국면. 고점·저점은 구간이 아니라 전환점이라 판정 대상(PHASES)에서 빠진다.
const STAGES = [
  { key: "B1", name: "하락 조정 국면", desc: "저점부터 A1~A3 국면을 거치며 주가가 높아졌고, 소신파 투자자가 부화뇌동파 투자자에게 주식을 넘긴 상태", action: "매도", advice: "주가가 아직 높은 수준일 때 보유 주식을 정리해 현금을 확보합니다. 낙관론에 휩쓸려 새로 사지 않습니다." },
  { key: "B2", name: "하락 동행 국면", desc: "B1 국면과 크게 다르지 않지만 가격 하락이 진행되는 상태", action: "관망", advice: "하락이 이어지는 동안 서둘러 사지 않고, 현금을 쥔 채 공포가 커지기를 기다립니다." },
  { key: "B3", name: "하락 과장 국면", desc: "시장의 공포가 최고조인 상태", action: "매수", advice: "모두가 겁에 질려 팔 때 우량주를 나눠서 사기 시작합니다." },
  { key: "저점", turning: true, desc: "B3 국면의 끝. 주가가 많이 떨어졌고 비관주의가 여전한 상태", action: "분할 매수", advice: "비관론이 여전하지만 가장 싸게 살 수 있는 시기이므로 매수를 이어 갑니다." },
  { key: "A1", name: "상승 조정 국면", desc: "저점을 지나 상승 국면에 진입하기 시작하는 상태", action: "매수", advice: "상승 초입이라 가격이 아직 낮습니다. 매수를 마무리하고 보유 비중을 채웁니다." },
  { key: "A2", name: "상승 동행 국면", desc: "자산 가격 상승이 실물경기 상승을 앞지르는 상태", action: "보유", advice: "상승이 진행되는 동안 산 주식을 그대로 들고 갑니다. 뒤늦은 추격 매수는 피합니다." },
  { key: "A3", name: "상승 과장 국면", desc: "실물경기까지 회복되어 가며 과장 국면에 진입하는 상태", action: "매도", advice: "과열 신호가 늘어나므로 보유 주식을 단계적으로 팔아 이익을 실현합니다." },
  { key: "고점", turning: true, desc: "경기부양책이 중단되고 인플레이션 우려가 등장하기 시작하며 주가가 고점을 맞이한 상태", action: "매도 마무리", advice: "긴축 전환과 인플레이션 우려가 보이면 남은 주식을 정리합니다." },
];
const PHASES = Object.fromEntries(STAGES.filter((s) => !s.turning).map((s) => [s.key, s]));
const ORDER = Object.keys(PHASES);
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const SVG_NS = "http://www.w3.org/2000/svg";
const CX = 200, CY = 235, RX = 140, RY = 175;
const ARROW_SCALE = 1.12; // 화살표를 달걀 테두리에서 띄우는 비율

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

function sideLabel(x, top, bottom) {
  const label = el("text", { x, y: CY - 6, class: "axis-label" });
  label.append(el("tspan", { x, dy: 0 }, top), el("tspan", { x, dy: "1.2em" }, bottom));
  return label;
}

// 달걀 바깥을 따라 from°에서 to°로 시계방향으로 도는 곡선 화살표.
function cycleArrow(from, to) {
  const pts = [];
  for (let d = from; d <= to; d += 2) pts.push(eggPoint(d, ARROW_SCALE));
  return el("path", { d: `M${polyline(pts)}`, class: "cycle-arrow", "marker-end": "url(#arrowhead)" });
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
  // 시계방향 화살표: 오른쪽은 위→아래(금리 하락기), 왼쪽은 아래→위(금리 상승기).
  const marker = el("marker", { id: "arrowhead", viewBox: "0 0 10 10", refX: 6, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" });
  marker.append(el("path", { d: "M0,0 L10,5 L0,10 Z", class: "arrowhead" }));
  const defs = el("defs");
  defs.append(marker);
  svg.append(defs, cycleArrow(45, 135), cycleArrow(225, 315));
  // 좌우 라벨은 두 줄로 나눠, 모바일에서 글자를 키워도 화살표와 겹치지 않게 한다.
  svg.append(sideLabel(5, "금리", "상승"));
  svg.append(sideLabel(395, "금리", "하락"));

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
  li.innerHTML = `<p class="stage-head"><b class="stage-key"></b><span class="stage-name"></span></p><p class="stage-desc"></p><p class="stage-advice"><b></b> <span></span></p>`;
  li.querySelector(".stage-key").textContent = stage.key;
  li.querySelector(".stage-name").textContent = stage.turning ? "전환점" : stage.name;
  if (current) {
    const badge = document.createElement("span");
    badge.className = "now-badge";
    badge.textContent = "현재";
    li.querySelector(".stage-head").append(badge);
  }
  li.querySelector(".stage-desc").textContent = stage.desc;
  li.querySelector(".stage-advice b").textContent = `대응: ${stage.action}`;
  li.querySelector(".stage-advice span").textContent = stage.advice;
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
  const advice = document.getElementById("phase-advice");
  advice.replaceChildren();
  const label = document.createElement("b");
  label.textContent = `코스톨라니식 대응: ${meta.action}`;
  advice.append(label, ` · ${meta.advice}`);
  document.getElementById("egg-desc").textContent =
    `현재 ${data.phase}(${meta.name}), 달걀 맨 위에서 ${data.angle.toFixed(0)}° 지점`;

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
