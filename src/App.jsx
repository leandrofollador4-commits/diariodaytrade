import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trash2, Download, Upload, Plus, ShieldAlert, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Badge } from "./components/ui/badge";

import { 
  
LineChart,
Line,
BarChart,
Bar,
XAxis,
YAxis,
Tooltip,
CartesianGrid,
ResponsiveContainer,
ReferenceLine,
} from "recharts";

const STORAGE_KEY = "daytrade_dashboard_text_config_v3";

/* ------------------------- helpers ------------------------- */
function toISODate(d) {
const dt = typeof d === "string" ? new Date(d) : d;
const yyyy = dt.getFullYear();
const mm = String(dt.getMonth() + 1).padStart(2, "0");
const dd = String(dt.getDate()).padStart(2, "0");
return `${yyyy}-${mm}-${dd}`;
}

function startOfMonthISO(d = new Date()) {
const dt = new Date(d);
dt.setDate(1);
return toISODate(dt);
}

function addDaysISO(iso, days) {
const dt = new Date(iso + "T00:00:00");
dt.setDate(dt.getDate() + days);
return toISODate(dt);
}

function parseNumberLoose(value) {
if (value === null || value === undefined) return NaN;
const raw = String(value).trim();
if (!raw) return NaN;

const s = raw.replace(/\s+/g, "");
if (/[,.]$/.test(s)) return NaN;

if (s.includes(",")) {
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

const n = Number(s);
return Number.isFinite(n) ? n : NaN;
}

function clampNumber(n, fallback = 0) {
return Number.isFinite(n) ? n : fallback;
}

function fmtBRL(v) {
if (!Number.isFinite(v)) return "–";
return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtPct(v) {
if (!Number.isFinite(v)) return "–";
return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 }).format(v);
}

function downloadJSON(filename, obj) {
const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = filename;
document.body.appendChild(a);
a.click();
a.remove();
URL.revokeObjectURL(url);
}

function readJSONFile(file) {
return new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => {
    try {
      resolve(JSON.parse(String(r.result || "{}")));
    } catch (e) {
      reject(e);
    }
  };
  r.onerror = reject;
  r.readAsText(file);
});
}

function inRangeISO(dateISO, startISO, endISOInclusive) {
if (!startISO && !endISOInclusive) return true;
if (startISO && dateISO < startISO) return false;
if (endISOInclusive && dateISO > endISOInclusive) return false;
return true;
}

/* ------------------------- trading math ------------------------- */
function getContracts(trade) {
return Math.max(1, Math.floor(clampNumber(parseNumberLoose(trade.contracts), 1)));
}

function effectiveFees(trade, configNum) {
const legacy = parseNumberLoose(trade.fees);
if (Number.isFinite(legacy)) return legacy;

const sym = trade.symbol || "WIN";
const contracts = getContracts(trade);
const perOp = clampNumber(configNum.costPerOpBySymbol?.[sym], 0);
return contracts * perOp;
}

function tradePnl(trade, configNum) {
const mode = trade.mode || (trade.points != null ? "points" : "pnl");
const fees = effectiveFees(trade, configNum);

if (mode === "points") {
  const points = clampNumber(parseNumberLoose(trade.points), 0);
  const contracts = getContracts(trade);
  const sym = trade.symbol || "WIN";
  const pv = clampNumber(configNum.pointValueBySymbol?.[sym], 0);
  return points * pv * contracts - fees;
}

const pnl = clampNumber(parseNumberLoose(trade.pnl), 0);
return pnl - fees;
}

function computeStats({ configNum, trades, period, filters }) {
const capitalInitial = clampNumber(configNum.capitalInitial, 0);

const sortedAll = [...trades].sort((a, b) => {
  const d = (a.date || "").localeCompare(b.date || "");
  if (d !== 0) return d;
  return (a.createdAt || 0) - (b.createdAt || 0);
});

const today = toISODate(new Date());
let startISO = null;
let endISO = null;

if (period.mode === "today") {
  startISO = today;
  endISO = today;
} else if (period.mode === "7d") {
  endISO = today;
  startISO = addDaysISO(today, -6);
} else if (period.mode === "mtd") {
  startISO = startOfMonthISO(new Date());
  endISO = today;
} else if (period.mode === "custom") {
  startISO = period.start || null;
  endISO = period.end || null;
}

let equityAll = capitalInitial;
for (const t of sortedAll) equityAll += tradePnl(t, configNum);

let equityAtStart = capitalInitial;
if (startISO) {
  for (const t of sortedAll) {
    if ((t.date || "") < startISO) equityAtStart += tradePnl(t, configNum);
    else break;
  }
}

const symFilter = filters.symbol || "ALL";
const tagFilter = filters.tag || "ALL";

const filtered = sortedAll
  .filter((t) => inRangeISO(t.date || "", startISO, endISO))
  .filter((t) => (symFilter === "ALL" ? true : t.symbol === symFilter))
  .filter((t) => (tagFilter === "ALL" ? true : (t.tag || "") === tagFilter));

let equity = equityAtStart;
const equityPoints = filtered.map((t, idx) => {
  const pnl = tradePnl(t, configNum);
  equity += pnl;
  return { n: idx + 1, date: t.date, equity, pnl };
});

const periodPnl = equity - equityAtStart;
const periodPct = equityAtStart > 0 ? periodPnl / equityAtStart : 0;

const wins = filtered.filter((t) => tradePnl(t, configNum) > 0);
const losses = filtered.filter((t) => tradePnl(t, configNum) < 0);
const nTrades = filtered.length;
const winRate = nTrades ? wins.length / nTrades : 0;

const avgWin = wins.length ? wins.reduce((s, t) => s + tradePnl(t, configNum), 0) / wins.length : 0;
const avgLoss = losses.length ? losses.reduce((s, t) => s + tradePnl(t, configNum), 0) / losses.length : 0;
const expectancy = winRate * avgWin - (1 - winRate) * Math.abs(avgLoss);

let peak = equityAtStart;
let maxDD = 0;
for (const p of equityPoints) {
  peak = Math.max(peak, p.equity);
  const dd = peak > 0 ? (p.equity - peak) / peak : 0;
  maxDD = Math.min(maxDD, dd);
}

const dailyMap = new Map();
for (const t of filtered) {
  const d = t.date;
  if (!dailyMap.has(d)) dailyMap.set(d, { date: d, pnl: 0, trades: 0 });
  const row = dailyMap.get(d);
  row.pnl += tradePnl(t, configNum);
  row.trades += 1;
}
const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

const stopDaily = clampNumber(configNum.stopDailyPct, -0.01);
const targetDaily = clampNumber(configNum.targetDailyPct, 0.01);
const maxTradesDay = Math.max(1, Math.floor(clampNumber(configNum.maxTradesPerDay, 3)));

const todayTradesAll = sortedAll.filter((t) => t.date === today);
const todayPnlAll = todayTradesAll.reduce((s, t) => s + tradePnl(t, configNum), 0);

const todayStart = (() => {
  let e = capitalInitial;
  for (const t of sortedAll) {
    if (t.date < today) e += tradePnl(t, configNum);
    else break;
  }
  return e;
})();
const todayPctAll = todayStart > 0 ? todayPnlAll / todayStart : 0;

let todayStatus = "NORMAL";
let todayBlocked = false;
if (todayTradesAll.length) {
  if (todayPctAll <= stopDaily) {
    todayStatus = "STOP";
    todayBlocked = true;
  } else if (todayPctAll >= targetDaily) {
    todayStatus = "META";
    todayBlocked = true;
  } else if (todayTradesAll.length >= maxTradesDay) {
    todayStatus = "LIMITE";
    todayBlocked = true;
  }
}

return {
  capitalInitial,
  capitalCurrent: equityAll,
  startISO,
  endISO,
  periodStartCapital: equityAtStart,
  periodEndCapital: equity,
  periodPnl,
  periodPct,
  nTrades,
  winRate,
  expectancy,
  maxDD,
  equityPoints,
  daily,
  todayStatus,
  todayBlocked,
  todayPnlAll,
  todayPctAll,
  todayTradesAll: todayTradesAll.length,
};
}

/* ------------------------- small UI ------------------------- */
function StatusPill({ status }) {
const map = {
  STOP: { label: "🔴 STOP", variant: "destructive" },
  META: { label: "🟢 META", variant: "default" },
  LIMITE: { label: "🟣 LIMITE", variant: "secondary" },
  NORMAL: { label: "🟡 NORMAL", variant: "outline" },
};
const s = map[status] || map.NORMAL;
return <Badge variant={s.variant}>{s.label}</Badge>;
}

function PeriodLabel({ startISO, endISO, mode }) {
const map = { today: "Hoje", "7d": "Últimos 7 dias", mtd: "MTD (mês)", custom: "Custom" };
const base = map[mode] || "Período";
if (!startISO && !endISO) return base;
if (startISO && endISO) return `${base}: ${startISO} → ${endISO}`;
if (startISO) return `${base}: desde ${startISO}`;
return `${base}: até ${endISO}`;
}

function SelectNative({ value, onChange, children }) {
return (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width: "100%",
      border: "1px solid #ddd",
      borderRadius: 12,
      padding: "8px 10px",
      fontSize: 13,
      background: "#fff",
    }}
  >
    {children}
  </select>
);
}

/* ========================= APP ========================= */
export default function App() {
const [tab, setTab] = useState("dashboard");

const [configText, setConfigText] = useState({
  capitalInitial: "50000",
  maxTradesPerDay: "3",
  stopDailyPct: "-0,01",
  targetDailyPct: "0,01",
  riskPerTradePct: "0,0025",
  winPointValue: "0,2",
  wdoPointValue: "10",
  winCostPerOp: "0,25",
  wdoCostPerOp: "1,20",
});

const [trades, setTrades] = useState([]);
const [period, setPeriod] = useState({ mode: "today", start: "", end: "" });
const [filters, setFilters] = useState({ symbol: "ALL", tag: "ALL" });

const [histDate, setHistDate] = useState("");
const [histTag, setHistTag] = useState("ALL");
const [editingId, setEditingId] = useState(null);

const [form, setForm] = useState({
  date: toISODate(new Date()),
  symbol: "WIN",
  side: "COMPRA",
  mode: "points",
  points: "",
  contracts: "1",
  pnl: "",
  tag: "",
  notes: "",
});

const configNum = useMemo(() => {
  const capitalInitial = parseNumberLoose(configText.capitalInitial);
  const maxTradesPerDay = parseNumberLoose(configText.maxTradesPerDay);
  const stopDailyPct = parseNumberLoose(configText.stopDailyPct);
  const targetDailyPct = parseNumberLoose(configText.targetDailyPct);
  const riskPerTradePct = parseNumberLoose(configText.riskPerTradePct);
  const winPV = parseNumberLoose(configText.winPointValue);
  const wdoPV = parseNumberLoose(configText.wdoPointValue);
  const winFee = parseNumberLoose(configText.winCostPerOp);
  const wdoFee = parseNumberLoose(configText.wdoCostPerOp);

  return {
    capitalInitial: Number.isFinite(capitalInitial) ? capitalInitial : 0,
    maxTradesPerDay: Number.isFinite(maxTradesPerDay) ? Math.max(1, Math.floor(maxTradesPerDay)) : 3,
    stopDailyPct: Number.isFinite(stopDailyPct) ? stopDailyPct : -0.01,
    targetDailyPct: Number.isFinite(targetDailyPct) ? targetDailyPct : 0.01,
    riskPerTradePct: Number.isFinite(riskPerTradePct) ? riskPerTradePct : 0.0025,
    pointValueBySymbol: {
      WIN: Number.isFinite(winPV) ? winPV : 0.2,
      WDO: Number.isFinite(wdoPV) ? wdoPV : 10,
      OUTRO: 0,
    },
    costPerOpBySymbol: {
      WIN: Number.isFinite(winFee) ? winFee : 0.25,
      WDO: Number.isFinite(wdoFee) ? wdoFee : 1.2,
      OUTRO: 0,
    },
  };
}, [configText]);

useEffect(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p?.configText) setConfigText((c) => ({ ...c, ...p.configText }));
    if (Array.isArray(p?.trades)) setTrades(p.trades);
    if (p?.period) setPeriod((x) => ({ ...x, ...p.period }));
    if (p?.filters) setFilters((x) => ({ ...x, ...p.filters }));
    if (p?.tradesTab) {
      if (typeof p.tradesTab.histDate === "string") setHistDate(p.tradesTab.histDate);
      if (typeof p.tradesTab.histTag === "string") setHistTag(p.tradesTab.histTag);
    }
  } catch {}
}, []);

useEffect(() => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 3, configText, trades, period, filters, tradesTab: { histDate, histTag } })
  );
}, [configText, trades, period, filters, histDate, histTag]);

const stats = useMemo(
  () => computeStats({ configNum, trades, period, filters }),
  [configNum, trades, period, filters]
);

const tagsList = useMemo(() => {
  return Array.from(new Set(trades.map((t) => (t.tag || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}, [trades]);

const pnlPreview = useMemo(() => {
  const t = { ...form };
  return tradePnl(t, configNum);
}, [form, configNum]);

const histTags = useMemo(() => {
  const tags = new Set(trades.map((t) => (t.tag || "").trim()).filter(Boolean));
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}, [trades]);

const tradesFiltered = useMemo(() => {
  return trades
    .filter((t) => (histDate ? t.date === histDate : true))
    .filter((t) => (histTag === "ALL" ? true : (t.tag || "") === histTag));
}, [trades, histDate, histTag]);

function addTrade() {
  const t = {
    id: `t_${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
    date: form.date,
    symbol: form.symbol,
    side: form.side,
    mode: form.mode,
    contracts: form.contracts,
    tag: (form.tag || "").trim(),
    notes: form.notes || "",
    createdAt: Date.now(),
    ...(form.mode === "points" ? { points: form.points } : { pnl: form.pnl }),
  };

  if (form.mode === "points" && !Number.isFinite(parseNumberLoose(form.points))) return;
  if (form.mode === "pnl" && !Number.isFinite(parseNumberLoose(form.pnl))) return;

  setTrades((prev) => [t, ...prev]);
  setForm((f) => ({ ...f, points: "", pnl: "", tag: "", notes: "" }));
}

function deleteTrade(id) {
  setTrades((prev) => prev.filter((t) => t.id !== id));
}

function exportData() {
  downloadJSON(`daytrade-dashboard-${toISODate(new Date())}.json`, {
    version: 3,
    configText,
    trades,
    period,
    filters,
    tradesTab: { histDate, histTag },
  });
}

async function importData(file) {
  const p = await readJSONFile(file);
  if (p?.configText) setConfigText((c) => ({ ...c, ...p.configText }));
  if (Array.isArray(p?.trades)) setTrades(p.trades);
  if (p?.period) setPeriod((x) => ({ ...x, ...p.period }));
  if (p?.filters) setFilters((x) => ({ ...x, ...p.filters }));
  if (p?.tradesTab) {
    if (typeof p.tradesTab.histDate === "string") setHistDate(p.tradesTab.histDate);
    if (typeof p.tradesTab.histTag === "string") setHistTag(p.tradesTab.histTag);
  }
}

function clearAll() {
  // eslint-disable-next-line no-restricted-globals
  if (!confirm("Isso apagará todos os trades e configurações salvas neste navegador. Continuar?")) return;
  localStorage.removeItem(STORAGE_KEY);
  setTrades([]);
  setConfigText({
    capitalInitial: "50000",
    maxTradesPerDay: "3",
    stopDailyPct: "-0,01",
    targetDailyPct: "0,01",
    riskPerTradePct: "0,0025",
    winPointValue: "0,2",
    wdoPointValue: "10",
    winCostPerOp: "0,25",
    wdoCostPerOp: "1,20",
  });
  setPeriod({ mode: "today", start: "", end: "" });
  setFilters({ symbol: "ALL", tag: "ALL" });
  setHistDate("");
  setHistTag("ALL");
  setEditingId(null);
  setForm({
    date: toISODate(new Date()),
    symbol: "WIN",
    side: "COMPRA",
    mode: "points",
    points: "",
    contracts: "1",
    pnl: "",
    tag: "",
    notes: "",
  });
  setTab("dashboard");
}

function startEdit(tr) {
  setEditingId(tr.id);
  setForm((f) => ({
    ...f,
    date: tr.date,
    symbol: tr.symbol || "WIN",
    side: tr.side || "COMPRA",
    mode: tr.mode || (tr.points != null ? "points" : "pnl"),
    points: tr.points ?? "",
    pnl: tr.pnl ?? "",
    contracts: String(tr.contracts ?? "1"),
    tag: tr.tag ?? "",
    notes: tr.notes ?? "",
  }));
  setTab("trades");
}

function cancelEdit() {
  setEditingId(null);
  setForm((f) => ({ ...f, points: "", pnl: "", tag: "", notes: "" }));
}

function saveEdit() {
  if (!editingId) return;

  if (form.mode === "points" && !Number.isFinite(parseNumberLoose(form.points))) return;
  if (form.mode === "pnl" && !Number.isFinite(parseNumberLoose(form.pnl))) return;

  setTrades((prev) =>
    prev.map((t) => {
      if (t.id !== editingId) return t;
      const next = {
        ...t,
        date: form.date,
        symbol: form.symbol,
        side: form.side,
        mode: form.mode,
        contracts: form.contracts,
        tag: (form.tag || "").trim(),
        notes: form.notes || "",
      };
      if (form.mode === "points") {
        next.points = form.points;
        delete next.pnl;
      } else {
        next.pnl = form.pnl;
        delete next.points;
      }
      return next;
    })
  );

  setEditingId(null);
  setForm((f) => ({ ...f, points: "", pnl: "", tag: "", notes: "" }));
}

function deleteAllOfDay(dayISO) {
  const day = dayISO || toISODate(new Date());
  // eslint-disable-next-line no-restricted-globals
  if (!confirm(`Excluir TODAS as operações do dia ${day}?`)) return;
  setTrades((prev) => prev.filter((t) => t.date !== day));
  if (editingId) cancelEdit();
}

const riskApprox = clampNumber(configNum.capitalInitial, 0) * clampNumber(configNum.riskPerTradePct, 0);

return (
  <div style={{ minHeight: "100vh", background: "#fff" }}>
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        {/* Header */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 24, margin: 0 }}>Day Trade — App</h1>
            <div style={{ fontSize: 13, color: "#666" }}>
              Custos removidos do Trade e centralizados na Configuração (WIN/WDO pré-preenchidos).
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={exportData}>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <Download size={16} /> Exportar
              </span>
            </Button>

            <label style={{ display: "inline-flex" }}>
              <input
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importData(file);
                  e.currentTarget.value = "";
                }}
              />
              <Button variant="secondary" type="button">
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <Upload size={16} /> Importar
                </span>
              </Button>
            </label>

            <Button variant="destructive" onClick={clearAll}>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <Trash2 size={16} /> Limpar
              </span>
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <Button variant={tab === "dashboard" ? "default" : "secondary"} onClick={() => setTab("dashboard")}>
            Dashboard
          </Button>
          <Button variant={tab === "trades" ? "default" : "secondary"} onClick={() => setTab("trades")}>
            Trades
          </Button>
          <Button variant={tab === "config" ? "default" : "secondary"} onClick={() => setTab("config")}>
            Configuração
          </Button>
        </div>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Badge variant="outline" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <Filter size={14} /> <PeriodLabel startISO={stats.startISO} endISO={stats.endISO} mode={period.mode} />
              </Badge>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Button variant={period.mode === "today" ? "default" : "secondary"} onClick={() => setPeriod({ mode: "today", start: "", end: "" })}>
                  Hoje
                </Button>
                <Button variant={period.mode === "7d" ? "default" : "secondary"} onClick={() => setPeriod({ mode: "7d", start: "", end: "" })}>
                  7 dias
                </Button>
                <Button variant={period.mode === "mtd" ? "default" : "secondary"} onClick={() => setPeriod({ mode: "mtd", start: "", end: "" })}>
                  MTD
                </Button>

                <div style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid #ddd", padding: 8, borderRadius: 12 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>Custom</span>
                  <Input
                    type="date"
                    value={period.start}
                    onChange={(e) => setPeriod((p) => ({ ...p, mode: "custom", start: e.target.value }))}
                    style={{ height: 34 }}
                  />
                  <Input
                    type="date"
                    value={period.end}
                    onChange={(e) => setPeriod((p) => ({ ...p, mode: "custom", end: e.target.value }))}
                    style={{ height: 34 }}
                  />
                </div>

                <div style={{ width: 180 }}>
                  <SelectNative value={filters.symbol} onChange={(v) => setFilters((f) => ({ ...f, symbol: v }))}>
                    <option value="ALL">Todos</option>
                    <option value="WIN">WIN</option>
                    <option value="WDO">WDO</option>
                    <option value="OUTRO">OUTRO</option>
                  </SelectNative>
                </div>

                <div style={{ width: 220 }}>
                  <SelectNative value={filters.tag} onChange={(v) => setFilters((f) => ({ ...f, tag: v }))}>
                    <option value="ALL">Todas as tags</option>
                    {tagsList.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </SelectNative>
                </div>

                <Button variant="secondary" onClick={() => setFilters({ symbol: "ALL", tag: "ALL" })}>
                  Limpar filtros
                </Button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Capital Atual (Total)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtBRL(stats.capitalCurrent)}</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Inicial: {fmtBRL(stats.capitalInitial)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Resultado (Período)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtBRL(stats.periodPnl)}</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{fmtPct(stats.periodPct)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Win Rate (Período)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtPct(stats.winRate)}</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Trades: {stats.nTrades}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Status Hoje</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <StatusPill status={stats.todayStatus} />
                    {stats.todayBlocked && (
                      <Badge variant="secondary" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <ShieldAlert size={14} /> Bloqueado
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Curva de Capital (Período)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ height: 320 }}>
                    {stats.equityPoints.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats.equityPoints} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="n" />
                          <YAxis domain={["auto", "auto"]} />
                          <Tooltip
                            formatter={(value, name) => {
                              if (name === "equity") return [fmtBRL(Number(value)), "Capital"];
                              if (name === "pnl") return [fmtBRL(Number(value)), "P&L"];
                              return [value, name];
                            }}
                            labelFormatter={(label) => `Trade #${label}`}
                          />
                          <ReferenceLine y={stats.periodStartCapital} strokeDasharray="4 4" />
                          <Line type="monotone" dataKey="equity" dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#666" }}>
                        Sem trades no período (ou filtrado).
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resultado Diário (Período)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ height: 320 }}>
                    {stats.daily.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.daily} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip formatter={(v) => fmtBRL(Number(v))} />
                          <Bar dataKey="pnl" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#666" }}>
                        Sem dados diários no período (ou filtrado).
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* TRADES */}
        {tab === "trades" && (
          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "420px 1fr",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <Card style={{ width: "100%" }}>
              <CardHeader>
                <CardTitle>{editingId ? "Editar Trade" : "Novo Trade"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <Label>Ativo</Label>
                      <SelectNative
                        value={form.symbol}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            symbol: v,
                            mode: v === "WIN" || v === "WDO" ? "points" : "pnl",
                          }))
                        }
                      >
                        <option value="WIN">WIN</option>
                        <option value="WDO">WDO</option>
                        <option value="OUTRO">OUTRO</option>
                      </SelectNative>
                    </div>

                    <div>
                      <Label>Contratos</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={form.contracts}
                        onChange={(e) => setForm((f) => ({ ...f, contracts: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Modo</Label>
                    <SelectNative value={form.mode} onChange={(v) => setForm((f) => ({ ...f, mode: v }))}>
                      <option value="points">Pontos</option>
                      <option value="pnl">P&L (R$)</option>
                    </SelectNative>
                  </div>

                  {form.mode === "points" ? (
                    <div>
                      <Label>Pontos (com sinal)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="Ex: 120,5 ou -80,25"
                        value={form.points}
                        onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <div>
                      <Label>P&L (R$) (com sinal)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="Ex: 180,50 ou -120,00"
                        value={form.pnl}
                        onChange={(e) => setForm((f) => ({ ...f, pnl: e.target.value }))}
                      />
                    </div>
                  )}

                  <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: 12, color: "#666" }}>Preview P&L líquido (com custos)</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtBRL(pnlPreview)}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                      Custos:{" "}
                      {fmtBRL(effectiveFees({ symbol: form.symbol, contracts: form.contracts }, configNum))} (contratos × custo/oper.)
                    </div>
                  </div>

                  <div>
                    <Label>Tag</Label>
                    <Input
                      type="text"
                      placeholder="Ex: pullback"
                      value={form.tag}
                      onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
                    />
                  </div>

                  {!editingId ? (
                    <Button onClick={addTrade}>
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <Plus size={16} /> Adicionar
                      </span>
                    </Button>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <Button onClick={saveEdit}>
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <Plus size={16} /> Salvar
                        </span>
                      </Button>
                      <Button variant="secondary" onClick={cancelEdit}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card style={{ width: "100%" }}>
              <CardHeader>
                <CardTitle>Histórico</CardTitle>
              </CardHeader>

              <CardContent style={{ overflowX: "auto" }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignItems: "end",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
                    <div style={{ width: 180 }}>
                      <Label>Filtrar por data</Label>
                      <Input type="date" value={histDate} onChange={(e) => setHistDate(e.target.value)} />
                    </div>

                    <div style={{ width: 220 }}>
                      <Label>Filtrar por tag</Label>
                      <SelectNative value={histTag} onChange={setHistTag}>
                        <option value="ALL">Todas as tags</option>
                        {histTags.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </SelectNative>
                    </div>

                    <Button
                      variant="secondary"
                      onClick={() => {
                        setHistDate("");
                        setHistTag("ALL");
                      }}
                    >
                      Limpar filtros
                    </Button>
                  </div>

                  <Button
                    variant="destructive"
                    onClick={() => deleteAllOfDay(histDate || toISODate(new Date()))}
                    title="Exclui todas as operações do dia filtrado (ou hoje se nenhum filtro)"
                  >
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <Trash2 size={16} /> Excluir tudo do dia
                    </span>
                  </Button>
                </div>

                <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead style={{ background: "#f7f7f7" }}>
                      <tr>
                        <th style={{ textAlign: "left", padding: 10 }}>Data</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Ativo</th>
                        <th style={{ textAlign: "right", padding: 10 }}>Contratos</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Modo</th>
                        <th style={{ textAlign: "right", padding: 10 }}>Custos</th>
                        <th style={{ textAlign: "right", padding: 10 }}>P&L (líq.)</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Tag</th>
                        <th style={{ textAlign: "right", padding: 10 }}>Ações</th>
                      </tr>
                    </thead>

                    <tbody>
                      {tradesFiltered.length ? (
                        tradesFiltered.map((t) => (
                          <tr key={t.id} style={{ borderTop: "1px solid #eee" }}>
                            <td style={{ padding: 10 }}>{t.date}</td>
                            <td style={{ padding: 10 }}>{t.symbol}</td>
                            <td style={{ padding: 10, textAlign: "right" }}>{getContracts(t)}</td>
                            <td style={{ padding: 10 }}>{t.mode}</td>
                            <td style={{ padding: 10, textAlign: "right" }}>{fmtBRL(effectiveFees(t, configNum))}</td>
                            <td style={{ padding: 10, textAlign: "right", fontWeight: 700 }}>{fmtBRL(tradePnl(t, configNum))}</td>
                            <td style={{ padding: 10 }}>{t.tag || "–"}</td>
                            <td style={{ padding: 10, textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: 8 }}>
                                <Button variant="secondary" onClick={() => startEdit(t)} title="Editar trade">
                                  Editar
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => {
                                    // eslint-disable-next-line no-restricted-globals
                                    if (confirm("Excluir esta operação?")) deleteTrade(t.id);
                                  }}
                                  title="Excluir operação"
                                >
                                  Excluir
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} style={{ padding: 14, color: "#666" }}>
                            Nenhum trade encontrado (verifique os filtros).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* CONFIG */}
        {tab === "config" && (
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card>
              <CardHeader>
                <CardTitle>Parâmetros</CardTitle>
              </CardHeader>
              <CardContent style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <Label>Capital Inicial (R$)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex: 50.000,00"
                      value={configText.capitalInitial}
                      onChange={(e) => setConfigText((c) => ({ ...c, capitalInitial: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label>Máx. trades/dia</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={configText.maxTradesPerDay}
                      onChange={(e) => setConfigText((c) => ({ ...c, maxTradesPerDay: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label>Stop Diário (%)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex: -0,01"
                      value={configText.stopDailyPct}
                      onChange={(e) => setConfigText((c) => ({ ...c, stopDailyPct: e.target.value }))}
                    />
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Aceita: -0,01 ou -0.01</div>
                  </div>

                  <div>
                    <Label>Meta Diária (%)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex: 0,01"
                      value={configText.targetDailyPct}
                      onChange={(e) => setConfigText((c) => ({ ...c, targetDailyPct: e.target.value }))}
                    />
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Aceita: 0,01 ou 0.01</div>
                  </div>

                  <div>
                    <Label>Risco por Trade (%)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex: 0,0025"
                      value={configText.riskPerTradePct}
                      onChange={(e) => setConfigText((c) => ({ ...c, riskPerTradePct: e.target.value }))}
                    />
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Aceita: 0,0025 ou 0.0025</div>
                  </div>

                  <div>
                    <Label>Risco em R$ (aprox.)</Label>
                    <Input readOnly value={fmtBRL(riskApprox)} />
                  </div>
                </div>

                <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Conversão por pontos</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <Label>R$/ponto WIN</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={configText.winPointValue}
                        onChange={(e) => setConfigText((c) => ({ ...c, winPointValue: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>R$/ponto WDO</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={configText.wdoPointValue}
                        onChange={(e) => setConfigText((c) => ({ ...c, wdoPointValue: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Custos por operação (por contrato)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <Label>WIN — custo por operação (R$)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={configText.winCostPerOp}
                        onChange={(e) => setConfigText((c) => ({ ...c, winCostPerOp: e.target.value }))}
                      />
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Padrão: 0,25</div>
                    </div>
                    <div>
                      <Label>WDO — custo por operação (R$)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={configText.wdoCostPerOp}
                        onChange={(e) => setConfigText((c) => ({ ...c, wdoCostPerOp: e.target.value }))}
                      />
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Padrão: 1,20</div>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                    O app calcula automaticamente: <b>custos = contratos × custo/oper.</b>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
                <div>• Trades não pedem mais custos; o custo vem da Configuração.</div>
                <div>• Trades antigos com "fees" continuam funcionando (prioridade para o fee do trade).</div>
                <div>• Campos aceitam vírgula e ponto (ex.: 0,01 / 0.01 / 1.234,56).</div>
                <div>• Aba Trades: filtro local por data/tag, edição e exclusão em massa por dia.</div>
              </CardContent>
            </Card>
          </div>
        )}
      </motion.div>
    </div>

    <style>{`
      @media (max-width: 1024px) {
        div[style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        div[style*="grid-template-columns: repeat(2"] { grid-template-columns: 1fr !important; }
        div[style*="grid-template-columns: 420px 1fr"] { grid-template-columns: 1fr !important; }
      }
    `}</style>
  </div>
);
}