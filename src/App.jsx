import React, { useEffect, useMemo, useState } from "react";
import { Download, Upload, Trash2, Plus, Filter, ShieldAlert } from "lucide-react";
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



const STORAGE_KEY = "diariodaytrade_app_v6";

/* ===================== Helpers ===================== */
function toISODate(d = new Date()) {
const dt = typeof d === "string" ? new Date(d) : d;
const yyyy = dt.getFullYear();
const mm = String(dt.getMonth() + 1).padStart(2, "0");
const dd = String(dt.getDate()).padStart(2, "0");
return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso, days) {
const dt = new Date(iso + "T00:00:00");
dt.setDate(dt.getDate() + days);
return toISODate(dt);
}

function startOfMonthISO(d = new Date()) {
const dt = new Date(d);
dt.setDate(1);
return toISODate(dt);
}

function parseNumberLoose(v) {
if (v === "" || v == null) return NaN;
let s = String(v).trim();
if (!s) return NaN;
s = s.replace(/\s+/g, "");
if (/[.,]$/.test(s)) return NaN;

if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
const n = Number(s);
return Number.isFinite(n) ? n : NaN;
}

function clamp(n, fallback = 0) {
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

function SelectNative({ value, onChange, children, style }) {
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
      ...style,
    }}
  >
    {children}
  </select>
);
}

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

/* ===================== Trading math ===================== */
function getContracts(trade) {
const c = parseNumberLoose(trade.contracts);
return Math.max(1, Math.floor(clamp(c, 1)));
}

function tradeFees(trade, configNum) {
const sym = trade.symbol || "WIN";
const contracts = getContracts(trade);
const perOp = clamp(configNum.costPerOpBySymbol?.[sym], 0);
return contracts * perOp;
}

function tradeGross(trade, configNum) {
const sym = trade.symbol || "WIN";
const contracts = getContracts(trade);

if (trade.mode === "points") {
  const points = clamp(parseNumberLoose(trade.points), 0);
  const pv = clamp(configNum.pointValueBySymbol?.[sym], 0);
  return points * pv * contracts;
}
return clamp(parseNumberLoose(trade.pnl), 0);
}

function tradeNet(trade, configNum) {
return tradeGross(trade, configNum) - tradeFees(trade, configNum);
}

/* ===================== Dashboard stats ===================== */
function computeDashboard({ trades, configNum, period }) {
const today = toISODate();
let startISO = null;
let endISO = null;

if (period === "today") {
  startISO = today;
  endISO = today;
} else if (period === "7d") {
  endISO = today;
  startISO = addDaysISO(today, -6);
} else if (period === "mtd") {
  startISO = startOfMonthISO(new Date());
  endISO = today;
} else {
  startISO = null;
  endISO = null;
}

const sorted = [...trades].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

let equityAll = clamp(configNum.capitalInitial, 0);
for (const t of sorted) equityAll += tradeNet(t, configNum);

let equityStart = clamp(configNum.capitalInitial, 0);
if (startISO) {
  for (const t of sorted) {
    if ((t.date || "") < startISO) equityStart += tradeNet(t, configNum);
    else break;
  }
}

const filtered = sorted.filter((t) => {
  if (startISO && (t.date || "") < startISO) return false;
  if (endISO && (t.date || "") > endISO) return false;
  return true;
});

let eq = equityStart;
const curve = filtered.map((t, i) => {
  const pnl = tradeNet(t, configNum);
  eq += pnl;
  return { n: i + 1, equity: eq, pnl, date: t.date };
});

const periodPnl = eq - equityStart;
const periodPct = equityStart > 0 ? periodPnl / equityStart : 0;

const dailyMap = new Map();
for (const t of filtered) {
  const d = t.date;
  if (!dailyMap.has(d)) dailyMap.set(d, { date: d, pnl: 0 });
  dailyMap.get(d).pnl += tradeNet(t, configNum);
}
const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

const wins = filtered.filter((t) => tradeNet(t, configNum) > 0).length;
const n = filtered.length;
const winRate = n ? wins / n : 0;

return {
  startISO,
  endISO,
  capitalCurrent: equityAll,
  periodPnl,
  periodPct,
  winRate,
  trades: n,
  curve,
  daily,
};
}

/* ===================== App ===================== */
export default function App() {
const [tab, setTab] = useState("dashboard");
const [dashPeriod, setDashPeriod] = useState("today");

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

const configNum = useMemo(() => {
  const cap = parseNumberLoose(configText.capitalInitial);
  const maxT = parseNumberLoose(configText.maxTradesPerDay);
  const stop = parseNumberLoose(configText.stopDailyPct);
  const meta = parseNumberLoose(configText.targetDailyPct);
  const risk = parseNumberLoose(configText.riskPerTradePct);
  const winPV = parseNumberLoose(configText.winPointValue);
  const wdoPV = parseNumberLoose(configText.wdoPointValue);
  const winFee = parseNumberLoose(configText.winCostPerOp);
  const wdoFee = parseNumberLoose(configText.wdoCostPerOp);

  return {
    capitalInitial: Number.isFinite(cap) ? cap : 0,
    maxTradesPerDay: Number.isFinite(maxT) ? Math.max(1, Math.floor(maxT)) : 3,
    stopDailyPct: Number.isFinite(stop) ? stop : -0.01,
    targetDailyPct: Number.isFinite(meta) ? meta : 0.01,
    riskPerTradePct: Number.isFinite(risk) ? risk : 0.0025,
    pointValueBySymbol: {
      WIN: Number.isFinite(winPV) ? winPV : 0.2,
      WDO: Number.isFinite(wdoPV) ? wdoPV : 10,
    },
    costPerOpBySymbol: {
      WIN: Number.isFinite(winFee) ? winFee : 0.25,
      WDO: Number.isFinite(wdoFee) ? wdoFee : 1.2,
    },
  };
}, [configText]);

const [trades, setTrades] = useState([]);
const [editingId, setEditingId] = useState(null);

const [form, setForm] = useState({
  date: toISODate(),
  symbol: "WIN",
  mode: "points",
  points: "",
  pnl: "",
  contracts: "1",
  tag: "",
});

const [histDate, setHistDate] = useState("");
const [histTag, setHistTag] = useState("ALL");

useEffect(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p?.configText) setConfigText((c) => ({ ...c, ...p.configText }));
    if (Array.isArray(p?.trades)) setTrades(p.trades);
    if (p?.dashPeriod) setDashPeriod(p.dashPeriod);
    if (p?.hist) {
      if (typeof p.hist.date === "string") setHistDate(p.hist.date);
      if (typeof p.hist.tag === "string") setHistTag(p.hist.tag);
    }
  } catch {}
}, []);

useEffect(() => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 6,
      configText,
      trades,
      dashPeriod,
      hist: { date: histDate, tag: histTag },
    })
  );
}, [configText, trades, dashPeriod, histDate, histTag]);

const tagsList = useMemo(() => {
  return Array.from(new Set(trades.map((t) => (t.tag || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}, [trades]);

const tradesFiltered = useMemo(() => {
  return trades
    .filter((t) => (histDate ? t.date === histDate : true))
    .filter((t) => (histTag === "ALL" ? true : (t.tag || "") === histTag));
}, [trades, histDate, histTag]);

const pnlPreview = useMemo(() => tradeNet(form, configNum), [form, configNum]);

const dashboard = useMemo(
  () => computeDashboard({ trades, configNum, period: dashPeriod }),
  [trades, configNum, dashPeriod]
);

const today = toISODate();
const todayTrades = trades.filter((t) => t.date === today);
const todayNet = todayTrades.reduce((s, t) => s + tradeNet(t, configNum), 0);

const todayStatus = (() => {
  let e = clamp(configNum.capitalInitial, 0);
  const sorted = [...trades].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  for (const t of sorted) {
    if ((t.date || "") < today) e += tradeNet(t, configNum);
    else break;
  }
  const pct = e > 0 ? todayNet / e : 0;

  if (!todayTrades.length) return "NORMAL";
  if (pct <= configNum.stopDailyPct) return "STOP";
  if (pct >= configNum.targetDailyPct) return "META";
  if (todayTrades.length >= configNum.maxTradesPerDay) return "LIMITE";
  return "NORMAL";
})();

const todayBlocked = todayStatus !== "NORMAL";

function exportData() {
  downloadJSON(`diariodaytrade-${toISODate()}.json`, {
    version: 6,
    configText,
    trades,
    dashPeriod,
    hist: { date: histDate, tag: histTag },
  });
}

async function importData(file) {
  const p = await readJSONFile(file);
  if (p?.configText) setConfigText((c) => ({ ...c, ...p.configText }));
  if (Array.isArray(p?.trades)) setTrades(p.trades);
  if (p?.dashPeriod) setDashPeriod(p.dashPeriod);
  if (p?.hist) {
    if (typeof p.hist.date === "string") setHistDate(p.hist.date);
    if (typeof p.hist.tag === "string") setHistTag(p.hist.tag);
  }
}

function clearAll() {
  // eslint-disable-next-line no-restricted-globals
  if (!confirm("Isso apaga trades e configurações salvas neste navegador. Continuar?")) return;
  localStorage.removeItem(STORAGE_KEY);
  setTrades([]);
  setEditingId(null);
  setHistDate("");
  setHistTag("ALL");
  setDashPeriod("today");
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
}

function addTrade() {
  if (form.mode === "points" && !Number.isFinite(parseNumberLoose(form.points))) return;
  if (form.mode === "pnl" && !Number.isFinite(parseNumberLoose(form.pnl))) return;

  const t = {
    id: `t_${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
    createdAt: Date.now(),
    date: form.date,
    symbol: form.symbol,
    mode: form.mode,
    contracts: form.contracts,
    tag: (form.tag || "").trim(),
    ...(form.mode === "points" ? { points: form.points } : { pnl: form.pnl }),
  };

  setTrades((prev) => [t, ...prev]);
  setForm((f) => ({ ...f, points: "", pnl: "", tag: "" }));
}

function startEdit(t) {
  setEditingId(t.id);
  setForm({
    date: t.date,
    symbol: t.symbol,
    mode: t.mode,
    points: t.points ?? "",
    pnl: t.pnl ?? "",
    contracts: String(t.contracts ?? "1"),
    tag: t.tag ?? "",
  });
  setTab("trades");
}

function cancelEdit() {
  setEditingId(null);
  setForm((f) => ({ ...f, points: "", pnl: "", tag: "" }));
}

function saveEdit() {
  if (!editingId) return;
  if (form.mode === "points" && !Number.isFinite(parseNumberLoose(form.points))) return;
  if (form.mode === "pnl" && !Number.isFinite(parseNumberLoose(form.pnl))) return;

  setTrades((prev) =>
    prev.map((t) => {
      if (t.id !== editingId) return t;
      const next = { ...t, date: form.date, symbol: form.symbol, mode: form.mode, contracts: form.contracts, tag: (form.tag || "").trim() };
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
  setForm((f) => ({ ...f, points: "", pnl: "", tag: "" }));
}

function deleteTrade(id) {
  // eslint-disable-next-line no-restricted-globals
  if (!confirm("Excluir esta operação?")) return;
  setTrades((prev) => prev.filter((t) => t.id !== id));
  if (editingId === id) cancelEdit();
}

function deleteAllOfDay(dayISO) {
  const day = dayISO || today;
  // eslint-disable-next-line no-restricted-globals
  if (!confirm(`Excluir TODAS as operações do dia ${day}?`)) return;
  setTrades((prev) => prev.filter((t) => t.date !== day));
  if (editingId) cancelEdit();
}

const riskApprox = clamp(configNum.capitalInitial, 0) * clamp(configNum.riskPerTradePct, 0);

return (
  <div style={{ minHeight: "100vh", background: "#fff" }}>
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
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

        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10 }}>
          <StatusPill status={todayStatus} />
          {todayBlocked && (
            <Badge variant="secondary" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <ShieldAlert size={14} /> Bloqueado
            </Badge>
          )}
        </div>
      </div>

      {/* DASHBOARD */}
      {tab === "dashboard" && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            <Badge variant="outline" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <Filter size={14} /> Período
            </Badge>

            <Button variant={dashPeriod === "today" ? "default" : "secondary"} onClick={() => setDashPeriod("today")}>
              Hoje
            </Button>
            <Button variant={dashPeriod === "7d" ? "default" : "secondary"} onClick={() => setDashPeriod("7d")}>
              7 dias
            </Button>
            <Button variant={dashPeriod === "mtd" ? "default" : "secondary"} onClick={() => setDashPeriod("mtd")}>
              MTD
            </Button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Capital Atual (Total)</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtBRL(dashboard.capitalCurrent)}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Inicial: {fmtBRL(configNum.capitalInitial)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resultado (Período)</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtBRL(dashboard.periodPnl)}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{fmtPct(dashboard.periodPct)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Win Rate (Período)</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtPct(dashboard.winRate)}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Trades: {dashboard.trades}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Risco (aprox.)</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtBRL(riskApprox)}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Risco por trade (%)</div>
              </CardContent>
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12, marginTop: 12 }}>
            <Card>
              <CardHeader>
                <CardTitle>Curva de Capital (Período)</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ height: 320 }}>
                  {dashboard.curve.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dashboard.curve} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                        <ReferenceLine y={configNum.capitalInitial} strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="equity" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#666" }}>
                      Sem trades no período.
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
                  {dashboard.daily.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboard.daily} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={(v) => fmtBRL(Number(v))} />
                        <Bar dataKey="pnl" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#666" }}>
                      Sem dados diários no período.
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
        <div className="tradesGrid">
          <div className="tradesLeft">
            <Card style={{ overflow: "hidden" }}>
              <CardHeader>
                <CardTitle>{editingId ? "Editar Trade" : "Novo Trade"}</CardTitle>
              </CardHeader>

              <CardContent>
                <div style={{ display: "grid", gap: 12 }}>
                  <div>
                    <Label>Data</Label>
                    <Input
                      className="inputSmallDate"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
                    <div>
                      <Label>Ativo</Label>
                      <SelectNative value={form.symbol} onChange={(v) => setForm((f) => ({ ...f, symbol: v }))}>
                        <option value="WIN">WIN</option>
                        <option value="WDO">WDO</option>
                      </SelectNative>
                    </div>

                    <div>
                      <Label>Contratos</Label>
                      <Input
                        className="inputSmallContracts"
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
                      Custos: {fmtBRL(tradeFees(form, configNum))}
                    </div>
                  </div>

                  <div>
                    <Label>Tag</Label>
                    <Input value={form.tag} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))} />
                  </div>

                  {!editingId ? (
                    <Button onClick={addTrade}>
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <Plus size={16} /> Adicionar
                      </span>
                    </Button>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <Button onClick={saveEdit}>Salvar</Button>
                      <Button variant="secondary" onClick={cancelEdit}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="tradesRight">
            <Card>
              <CardHeader>
                <CardTitle>Histórico</CardTitle>
              </CardHeader>

              <CardContent style={{ overflowX: "auto" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
                    <div style={{ width: 200 }}>
                      <Label>Filtrar por data</Label>
                      <Input type="date" value={histDate} onChange={(e) => setHistDate(e.target.value)} />
                    </div>

                    <div style={{ width: 220 }}>
                      <Label>Filtrar por tag</Label>
                      <SelectNative value={histTag} onChange={setHistTag}>
                        <option value="ALL">Todas as tags</option>
                        {tagsList.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </SelectNative>
                    </div>

                    <Button variant="secondary" onClick={() => { setHistDate(""); setHistTag("ALL"); }}>
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <Filter size={16} /> Limpar filtros
                      </span>
                    </Button>
                  </div>

                  <Button variant="destructive" onClick={() => deleteAllOfDay(histDate || today)}>
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <Trash2 size={16} /> Excluir tudo do dia
                    </span>
                  </Button>
                </div>

                <div className="historyTableWrap">
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
                            <td style={{ padding: 10, textAlign: "right" }}>{fmtBRL(tradeFees(t, configNum))}</td>
                            <td style={{ padding: 10, textAlign: "right", fontWeight: 700 }}>{fmtBRL(tradeNet(t, configNum))}</td>
                            <td style={{ padding: 10 }}>{t.tag || "–"}</td>
                            <td style={{ padding: 10, textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: 8 }}>
                                <Button variant="secondary" onClick={() => startEdit(t)}>Editar</Button>
                                <Button variant="destructive" onClick={() => deleteTrade(t.id)}>Excluir</Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} style={{ padding: 14, color: "#666" }}>Nenhum trade encontrado.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* CONFIG */}
      {tab === "config" && (
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Card>
            <CardHeader><CardTitle>Parâmetros</CardTitle></CardHeader>
            <CardContent style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label>Capital Inicial (R$)</Label>
                  <Input value={configText.capitalInitial} onChange={(e) => setConfigText((c) => ({ ...c, capitalInitial: e.target.value }))} />
                </div>
                <div>
                  <Label>Máx. trades/dia</Label>
                  <Input value={configText.maxTradesPerDay} onChange={(e) => setConfigText((c) => ({ ...c, maxTradesPerDay: e.target.value }))} />
                </div>
                <div>
                  <Label>Stop Diário (%)</Label>
                  <Input value={configText.stopDailyPct} onChange={(e) => setConfigText((c) => ({ ...c, stopDailyPct: e.target.value }))} />
                </div>
                <div>
                  <Label>Meta Diária (%)</Label>
                  <Input value={configText.targetDailyPct} onChange={(e) => setConfigText((c) => ({ ...c, targetDailyPct: e.target.value }))} />
                </div>
                <div>
                  <Label>Risco por Trade (%)</Label>
                  <Input value={configText.riskPerTradePct} onChange={(e) => setConfigText((c) => ({ ...c, riskPerTradePct: e.target.value }))} />
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
                    <Input value={configText.winPointValue} onChange={(e) => setConfigText((c) => ({ ...c, winPointValue: e.target.value }))} />
                  </div>
                  <div>
                    <Label>R$/ponto WDO</Label>
                    <Input value={configText.wdoPointValue} onChange={(e) => setConfigText((c) => ({ ...c, wdoPointValue: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Custos por operação (por contrato)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <Label>WIN — custo por operação (R$)</Label>
                    <Input value={configText.winCostPerOp} onChange={(e) => setConfigText((c) => ({ ...c, winCostPerOp: e.target.value }))} />
                  </div>
                  <div>
                    <Label>WDO — custo por operação (R$)</Label>
                    <Input value={configText.wdoCostPerOp} onChange={(e) => setConfigText((c) => ({ ...c, wdoCostPerOp: e.target.value }))} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notas</CardTitle></CardHeader>
            <CardContent style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
              <div>• Campos aceitam vírgula e ponto (0,01 / 0.01 / 1.234,56).</div>
              <div>• Custos vêm da Configuração: WIN (R$ 0,25) / WDO (R$ 1,20) por contrato.</div>
              <div>• Aba Trades: filtros por data/tag, editar, excluir e excluir tudo do dia.</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>

    <style>{`
      .tradesGrid{
        margin-top:16px;
        display:grid;
        grid-template-columns: 460px minmax(0, 1fr);
        gap:16px;
        align-items:start;
        isolation:isolate;
      }
      .tradesLeft, .tradesRight{
        min-width:0;
      }
      .tradesLeft{
        overflow:hidden;
      }
      .tradesLeft *{
        min-width:0;
        box-sizing:border-box;
      }
      .tradesLeft input, .tradesLeft select, .tradesLeft textarea{
        max-width:100%;
        width:100%;
        box-sizing:border-box;
      }
      .inputSmallDate{
        width: 220px !important;
        max-width: 220px !important;
      }
      .inputSmallContracts{
        width: 110px !important;
        max-width: 110px !important;
        text-align:center;
      }
      .historyTableWrap{
        border:1px solid #ddd;
        border-radius:12px;
        overflow:hidden;
        min-width: 860px;
      }
      @media (max-width: 1024px){
        .tradesGrid{ grid-template-columns: 1fr; }
        .inputSmallDate{ width: 100% !important; max-width: 100% !important; }
        .inputSmallContracts{ width: 100% !important; max-width: 100% !important; text-align:left; }
        .historyTableWrap{ min-width: 720px; }
        div[style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        div[style*="grid-template-columns: repeat(2"] { grid-template-columns: 1fr !important; }
      }
    `}</style>
  </div>
);
}