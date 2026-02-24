// app.js (FULL REPLACE)

// ===== Utils =====
const fmt = (x, d=0) => {
  if (!isFinite(x)) return "-";
  return Number(x).toLocaleString("ko-KR", { maximumFractionDigits: d });
};

function npv(rate, cashflows){
  // cashflows[0] is at t=0
  let s = 0;
  for (let t=0; t<cashflows.length; t++){
    s += cashflows[t] / Math.pow(1 + rate, t);
  }
  return s;
}

function irr(cashflows){
  // Robust bisection on [-0.9999, 10] (i.e., -99.99% to 1000%)
  // Return NaN if no sign change.
  const f = (r) => npv(r, cashflows);

  let lo = -0.9999;
  let hi = 10.0;
  let flo = f(lo);
  let fhi = f(hi);

  if (!isFinite(flo) || !isFinite(fhi)) return NaN;
  if (flo === 0) return lo;
  if (fhi === 0) return hi;

  // Need sign change
  if (flo * fhi > 0){
    // Try expanding hi a bit
    hi = 50.0;
    fhi = f(hi);
    if (!isFinite(fhi) || flo * fhi > 0) return NaN;
  }

  for (let i=0; i<120; i++){
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (!isFinite(fmid)) return NaN;
    if (Math.abs(fmid) < 1e-8) return mid;
    if (flo * fmid <= 0){
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

function paybackPeriod(cashflows){
  // Undiscounted payback, with linear interpolation within the year.
  let cum = 0;
  if (cashflows.length === 0) return NaN;
  if (cashflows[0] >= 0) return 0;

  for (let t=0; t<cashflows.length; t++){
    const prev = cum;
    cum += cashflows[t];
    if (cum >= 0){
      const cf = cashflows[t];
      if (t === 0) return 0;
      // prev < 0, cum >= 0
      const frac = (0 - prev) / cf; // 0..1
      return (t - 1) + frac;
    }
  }
  return NaN; // never pays back within horizon
}

function discountedCashflows(rate, cashflows){
  return cashflows.map((cf, t) => cf / Math.pow(1 + rate, t));
}

// ===== Model =====
function buildCashflows(params){
  const {
    capGeo, capInd, capPv,
    benefitTax,
    benefitEnergy,
    years
  } = params;

  const capex = capGeo + capInd + capPv;

  const cfs = [];
  // t=0
  cfs.push(-capex + benefitTax);

  // t=1..years
  for (let t=1; t<=years; t++){
    cfs.push(benefitEnergy);
  }
  return cfs;
}

// ===== UI State =====
const DEFAULTS = {
  capGeo: 4314,
  capInd: 2331,
  capPv: 0,
  benefitTax: 4818,      // 엑셀 값이 소수였는데 MVP는 반올림 기본
  benefitEnergy: 337,
  discountRatePct: 4.5,
  years: 25,
  baseYear: 2025
};

const $ = (id) => document.getElementById(id);

function readInputs(){
  return {
    capGeo: Number($("capGeo").value) || 0,
    capInd: Number($("capInd").value) || 0,
    capPv: Number($("capPv").value) || 0,
    benefitTax: Number($("benefitTax").value) || 0,
    benefitEnergy: Number($("benefitEnergy").value) || 0,
    discountRatePct: Number($("discountRate").value) || 0,
    years: Math.max(1, Math.floor(Number($("years").value) || 1)),
    baseYear: Math.floor(Number($("baseYear").value) || DEFAULTS.baseYear)
  };
}

function writeInputs(v){
  $("capGeo").value = v.capGeo;
  $("capInd").value = v.capInd;
  $("capPv").value = v.capPv;
  $("benefitTax").value = v.benefitTax;
  $("benefitEnergy").value = v.benefitEnergy;
  $("discountRate").value = v.discountRatePct;
  $("years").value = v.years;
  $("baseYear").value = v.baseYear;
}

let chartCf = null;
let chartCum = null;

/**
 * 차트는 "할인율이 반영된" 값으로 표시:
 * - bar: 할인 CF (DCF)
 * - line: 할인 누적 (Discounted cumulative)
 */
function renderCharts(yearLabels, dcf, dcum){
  // Destroy if exists
  if (chartCf) chartCf.destroy();
  if (chartCum) chartCum.destroy();

  const ctx1 = $("chartCf").getContext("2d");
  const ctx2 = $("chartCum").getContext("2d");

  chartCf = new Chart(ctx1, {
    type: "bar",
    data: {
      labels: yearLabels,
      datasets: [{
        label: "할인 CF (백만원)",
        data: dcf
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }
      }
    }
  });

  chartCum = new Chart(ctx2, {
    type: "line",
    data: {
      labels: yearLabels,
      datasets: [{
        label: "할인 누적 (백만원)",
        data: dcum,
        tension: 0.2,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }
      }
    }
  });
}

function renderTable(yearLabels, cfs, cum, dcf, dcum){
  const tbody = $("cfTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (let i=0; i<yearLabels.length; i++){
    const tr = document.createElement("tr");
    const cells = [
      yearLabels[i],
      fmt(cfs[i], 2),
      fmt(cum[i], 2),
      fmt(dcf[i], 2),
      fmt(dcum[i], 2)
    ];
    for (let j=0; j<cells.length; j++){
      const td = document.createElement("td");
      td.textContent = cells[j];
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function computeAndRender(){
  const v = readInputs();
  const r = v.discountRatePct / 100;

  const cfs = buildCashflows({
    capGeo: v.capGeo,
    capInd: v.capInd,
    capPv: v.capPv,
    benefitTax: v.benefitTax,
    benefitEnergy: v.benefitEnergy,
    years: v.years
  });

  const yearLabels = [];
  for (let t=0; t<cfs.length; t++){
    yearLabels.push(String(v.baseYear + t));
  }

  // cumulative (nominal)
  const cum = [];
  let s = 0;
  for (const cf of cfs){
    s += cf;
    cum.push(s);
  }

  // discounted
  const dcf = discountedCashflows(r, cfs);
  const dcum = [];
  let sd = 0;
  for (const x of dcf){
    sd += x;
    dcum.push(sd);
  }

  const npvVal = npv(r, cfs);
  const irrVal = irr(cfs); // as decimal
  const pb = paybackPeriod(cfs);

  $("kpiNpv").textContent = fmt(npvVal, 2);
  $("kpiIrr").textContent = isFinite(irrVal) ? fmt(irrVal * 100, 2) : "계산불가";
  $("kpiPayback").textContent = isFinite(pb) ? fmt(pb, 2) : "미회수";
  $("kpiRate").textContent = fmt(v.discountRatePct, 2);

  // ✅ charts now use discounted series
  renderCharts(yearLabels, dcf, dcum);

  // table keeps both nominal + discounted
  renderTable(yearLabels, cfs, cum, dcf, dcum);
}

// ===== Scenario save/load =====
const STORAGE_KEY = "econ_mvp_scenario_v1";

function saveScenario(){
  const v = readInputs();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  alert("저장 완료 (브라우저 LocalStorage)");
}

function loadScenario(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw){
    alert("저장된 시나리오가 없습니다.");
    return;
  }
  try{
    const v = JSON.parse(raw);
    writeInputs(v);
    computeAndRender();
  }catch{
    alert("불러오기 실패(데이터 손상)");
  }
}

function resetDefaults(){
  writeInputs(DEFAULTS);
  computeAndRender();
}

// ===== Sensitivity buttons =====
function applyCapex10(){
  const v = readInputs();
  v.capGeo *= 1.10;
  v.capInd *= 1.10;
  v.capPv *= 1.10;
  // round
  v.capGeo = Math.round(v.capGeo);
  v.capInd = Math.round(v.capInd);
  v.capPv = Math.round(v.capPv);
  writeInputs(v);
  computeAndRender();
}

function applyEnergyDown20(){
  const v = readInputs();
  v.benefitEnergy = Math.round(v.benefitEnergy * 0.8);
  writeInputs(v);
  computeAndRender();
}

function applyTaxZero(){
  const v = readInputs();
  v.benefitTax = 0;
  writeInputs(v);
  computeAndRender();
}

// ===== Wire up =====
document.addEventListener("DOMContentLoaded", () => {
  // init inputs
  resetDefaults();

  $("btnApply").addEventListener("click", computeAndRender);
  $("btnReset").addEventListener("click", resetDefaults);

  $("btnSave").addEventListener("click", saveScenario);
  $("btnLoad").addEventListener("click", loadScenario);

  $("btnCapex10").addEventListener("click", applyCapex10);
  $("btnEnergyDown20").addEventListener("click", applyEnergyDown20);
  $("btnTaxZero").addEventListener("click", applyTaxZero);

  // auto-calc on input change (optional)
  ["capGeo","capInd","capPv","benefitTax","benefitEnergy","discountRate","years","baseYear"]
    .forEach(id => $(id).addEventListener("change", computeAndRender));
});
