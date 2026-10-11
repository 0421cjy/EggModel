const PHASES = {
  A: { name: "금리 고점 통과", action: "예금을 찾아 채권을 사는 시기" },
  B: { name: "금리 하락기", action: "채권 차익을 실현하고 부동산으로 옮기는 시기" },
  C: { name: "금리 저점 근접", action: "부동산을 정리하고 주식을 사는 시기" },
  D: { name: "금리 상승 전환", action: "주식 비중을 줄이고 현금(예금)을 확보하는 시기" },
  E: { name: "금리 상승기", action: "예금을 유지하며 남은 위험자산을 정리하는 시기" },
  F: { name: "금리 고점 근접", action: "예금 비중을 최대로 두고 채권 매수를 준비하는 시기" },
};
const ORDER = ["A", "B", "C", "D", "E", "F"];
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const SVG_NS = "http://www.w3.org/2000/svg";
const CX = 200, CY = 235, RX = 140, RY = 175;

// 맨 위(금리 고점)에서 시작해 왼쪽 → 아래 → 오른쪽으로 도는 각도(도)를 달걀 둘레 좌표로 바꾼다.
// 위쪽이 좁은 달걀 모양이 되도록 가로 폭을 cos에 따라 줄인다.
function eggPoint(deg, scale = 1) {
  const t = (deg * Math.PI) / 180;
  const width = RX * (1 - 0.12 * Math.cos(t));
  return [CX - width * Math.sin(t) * scale, CY - RY * Math.cos(t) * scale];
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
function dot(svg, angle, r, cls, label, opacity) {
  const [x, y] = eggPoint(angle);
  const g = el("g");
  g.append(el("title", {}, label));
  g.append(el("circle", { cx: x, cy: y, r: Math.max(r, 12), class: "hit" }));
  const attrs = { cx: x, cy: y, r, class: cls };
  if (opacity !== undefined) attrs.opacity = opacity;
  g.append(el("circle", attrs));
  svg.append(g);
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

  svg.append(el("text", { x: CX, y: 34, class: "axis-label" }, "금리 고점"));
  svg.append(el("text", { x: CX, y: 446, class: "axis-label" }, "금리 저점"));
  svg.append(el("text", { x: 18, y: CY + 5, class: "axis-label" }, "← 하락기"));
  svg.append(el("text", { x: 382, y: CY + 5, class: "axis-label" }, "상승기 →"));

  const trail = data.trail.slice(0, -1);
  trail.forEach((p, i) => {
    const opacity = (0.15 + (0.5 * i) / Math.max(trail.length, 1)).toFixed(2);
    dot(svg, p.angle, 5, "trail", `${p.month} · ${p.phase}국면`, opacity);
  });
  dot(svg, data.angle, 10, "now", `${data.as_of} · ${data.phase}국면 (현재)`);
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

function showNotice(text) {
  const n = document.getElementById("notice");
  n.textContent = text;
  n.hidden = false;
}

function render(data) {
  const meta = PHASES[data.phase];
  const title = document.getElementById("phase-title");
  title.innerHTML = `<span class="badge"></span> · `;
  title.querySelector(".badge").textContent = `${data.phase}국면`;
  title.append(meta.name);
  document.getElementById("phase-action").textContent = `${data.as_of} 기준 · ${meta.action}`;
  document.getElementById("egg-desc").textContent =
    `현재 ${data.phase}국면(${meta.name}), 달걀 맨 위에서 ${data.angle.toFixed(0)}° 지점`;

  drawEgg(document.getElementById("egg"), data);

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
