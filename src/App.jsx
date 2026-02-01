import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Download, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";

/* ========================= HELPERS ========================= */

const STORAGE_KEY = "diariodaytrade_v4";

const todayISO = () => new Date().toISOString().slice(0, 10);

function parseNumberLoose(v) {
  if (v === "" || v == null) return NaN;
  let s = String(v).trim();
  if (/[.,]$/.test(s)) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function fmtBRL(v) {
  if (!Number.isFinite(v)) return "–";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

/* ========================= APP ========================= */

export default function App() {
  const [tab, setTab] = useState("trades");

  /* -------- CONFIG -------- */
  const [config, setConfig] = useState({
    winPoint: "0,2",
    wdoPoint: "10",
    winCost: "0,25",
    wdoCost: "1,20",
  });

  /* -------- TRADES -------- */
  const [trades, setTrades] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    date: todayISO(),
    symbol: "WIN",
    contracts: "1",
    mode: "points",
    points: "",
    tag: "",
  });

  /* -------- HIST FILTERS -------- */
  const [histDate, setHistDate] = useState("");
  const [histTag, setHistTag] = useState("ALL");

  /* -------- LOAD / SAVE -------- */
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.config) setConfig(p.config);
    if (p.trades) setTrades(p.trades);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ config, trades })
    );
  }, [config, trades]);

  /* -------- CALCS -------- */
  const pointValue =
    form.symbol === "WIN"
      ? parseNumberLoose(config.winPoint)
      : parseNumberLoose(config.wdoPoint);

  const costPerOp =
    form.symbol === "WIN"
      ? parseNumberLoose(config.winCost)
      : parseNumberLoose(config.wdoCost);

  const pnlPreview = (() => {
    const pts = parseNumberLoose(form.points);
    const ctr = parseNumberLoose(form.contracts);
    if (!Number.isFinite(pts) || !Number.isFinite(ctr)) return NaN;
    return pts * pointValue * ctr - ctr * costPerOp;
  })();

  /* -------- ACTIONS -------- */
  function addTrade() {
    if (!Number.isFinite(parseNumberLoose(form.points))) return;

    if (editingId) {
      setTrades((prev) =>
        prev.map((t) =>
          t.id === editingId ? { ...t, ...form } : t
        )
      );
      setEditingId(null);
    } else {
      setTrades((prev) => [
        {
          ...form,
          id: crypto.randomUUID(),
        },
        ...prev,
      ]);
    }

    setForm({ ...form, points: "", tag: "" });
  }

  function editTrade(t) {
    setEditingId(t.id);
    setForm(t);
  }

  function deleteTrade(id) {
    if (!confirm("Excluir operação?")) return;
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }

  function deleteAllOfDay(day) {
    const d = day || todayISO();
    if (!confirm(`Excluir todas as operações de ${d}?`)) return;
    setTrades((prev) => prev.filter((t) => t.date !== d));
  }

  function exportData() {
    const json = JSON.stringify({ config, trades }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daytrade_${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result);
        if (data.config) setConfig(data.config);
        if (data.trades) setTrades(data.trades);
      } catch (err) {
        alert("Erro ao importar arquivo");
      }
    };
    reader.readAsText(file);
  }

  /* -------- FILTERED -------- */
  const tags = useMemo(
    () => Array.from(new Set(trades.map((t) => t.tag).filter(Boolean))),
    [trades]
  );

  const tradesFiltered = trades.filter(
    (t) =>
      (!histDate || t.date === histDate) &&
      (histTag === "ALL" || t.tag === histTag)
  );

  /* -------- DASHBOARD STATS -------- */
  const stats = useMemo(() => {
    let wins = 0, losses = 0, totalPnL = 0, winCount = 0, lossCount = 0;
    trades.forEach((t) => {
      const pnl =
        parseNumberLoose(t.points) * pointValue * parseNumberLoose(t.contracts) -
        parseNumberLoose(t.contracts) * costPerOp;
      if (Number.isFinite(pnl)) {
        totalPnL += pnl;
        if (pnl > 0) { wins += pnl; winCount++; }
        else if (pnl < 0) { losses += pnl; lossCount++; }
      }
    });
    return { wins, losses, totalPnL, winCount, lossCount };
  }, [trades, pointValue, costPerOp]);

  /* ========================= UI ========================= */

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <h1>Day Trade — App</h1>

      {/* TABS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Button onClick={() => setTab("dashboard")}>Dashboard</Button>
        <Button onClick={() => setTab("trades")}>Trades</Button>
        <Button onClick={() => setTab("config")}>Configuração</Button>
      </div>

      {/* ========================= DASHBOARD ========================= */}
      {tab === "dashboard" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
          <Card>
            <CardHeader>
              <CardTitle>Total P&L</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: 24, fontWeight: "bold", color: stats.totalPnL >= 0 ? "green" : "red" }}>
                {fmtBRL(stats.totalPnL)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ganhos</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: 24, fontWeight: "bold", color: "green" }}>
                {fmtBRL(stats.wins)}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>{stats.winCount} operações</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Perdas</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: 24, fontWeight: "bold", color: "red" }}>
                {fmtBRL(stats.losses)}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>{stats.lossCount} operações</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Taxa de Acerto</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: 24, fontWeight: "bold" }}>
                {trades.length > 0 ? ((stats.winCount / trades.length) * 100).toFixed(1) : "–"}%
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                {stats.winCount} de {trades.length} operações
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================= TRADES ========================= */}
      {tab === "trades" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(360px, 420px) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* -------- LEFT COLUMN -------- */}
          <div style={{ minWidth: 0 }}>
            <Card style={{ overflow: "hidden" }}>
              <CardHeader>
                <CardTitle>
                  {editingId ? "Editar Trade" : "Novo Trade"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) =>
                        setForm({ ...form, date: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label>Ativo</Label>
                    <select
                      value={form.symbol}
                      onChange={(e) =>
                        setForm({ ...form, symbol: e.target.value })
                      }
                    >
                      <option>WIN</option>
                      <option>WDO</option>
                    </select>
                  </div>

                  <div>
                    <Label>Contratos</Label>
                    <Input
                      value={form.contracts}
                      onChange={(e) =>
                        setForm({ ...form, contracts: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label>Pontos (com sinal)</Label>
                    <Input
                      placeholder="Ex: 120,5 ou -80,25"
                      value={form.points}
                      onChange={(e) =>
                        setForm({ ...form, points: e.target.value })
                      }
                    />
                  </div>

                  <div style={{ padding: 12, border: "1px solid #ddd" }}>
                    <div>Preview P&L</div>
                    <strong>{fmtBRL(pnlPreview)}</strong>
                  </div>

                  <div>
                    <Label>Tag</Label>
                    <Input
                      value={form.tag}
                      onChange={(e) =>
                        setForm({ ...form, tag: e.target.value })
                      }
                    />
                  </div>

                  <Button onClick={addTrade}>
                    <Plus size={16} />{" "}
                    {editingId ? "Salvar" : "Adicionar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* -------- RIGHT COLUMN -------- */}
          <div style={{ minWidth: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle>Histórico</CardTitle>
              </CardHeader>
              <CardContent style={{ overflowX: "auto" }}>
                {/* FILTERS */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <Input
                    type="date"
                    value={histDate}
                    onChange={(e) => setHistDate(e.target.value)}
                  />

                  <select
                    value={histTag}
                    onChange={(e) => setHistTag(e.target.value)}
                  >
                    <option value="ALL">Todas as tags</option>
                    {tags.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>

                  <Button
                    variant="secondary"
                    onClick={() => {
                      setHistDate("");
                      setHistTag("ALL");
                    }}
                  >
                    Limpar filtros
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={() =>
                      deleteAllOfDay(histDate || todayISO())
                    }
                  >
                    <Trash2 size={16} /> Excluir tudo do dia
                  </Button>
                </div>

                {/* TABLE */}
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Ativo</th>
                      <th>Contr.</th>
                      <th>P&L</th>
                      <th>Tag</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradesFiltered.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          Nenhum trade encontrado
                        </td>
                      </tr>
                    )}
                    {tradesFiltered.map((t) => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td>{t.symbol}</td>
                        <td>{t.contracts}</td>
                        <td>
                          {fmtBRL(
                            parseNumberLoose(t.points) *
                              pointValue *
                              parseNumberLoose(t.contracts) -
                              parseNumberLoose(t.contracts) *
                                costPerOp
                          )}
                        </td>
                        <td>{t.tag || "–"}</td>
                        <td>
                          <Button
                            variant="secondary"
                            onClick={() => editTrade(t)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => deleteTrade(t.id)}
                          >
                            Excluir
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ========================= CONFIG ========================= */}
      {tab === "config" && (
        <Card>
          <CardHeader>
            <CardTitle>Configuração</CardTitle>
          </CardHeader>
          <CardContent style={{ display: "grid", gap: 12 }}>
            <Label>WIN R$/ponto</Label>
            <Input
              value={config.winPoint}
              onChange={(e) =>
                setConfig({ ...config, winPoint: e.target.value })
              }
            />
            <Label>WDO R$/ponto</Label>
            <Input
              value={config.wdoPoint}
              onChange={(e) =>
                setConfig({ ...config, wdoPoint: e.target.value })
              }
            />
            <Label>WIN custo/operação</Label>
            <Input
              value={config.winCost}
              onChange={(e) =>
                setConfig({ ...config, winCost: e.target.value })
              }
            />
            <Label>WDO custo/operação</Label>
            <Input
              value={config.wdoCost}
              onChange={(e) =>
                setConfig({ ...config, wdoCost: e.target.value })
              }
            />

            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <Button onClick={exportData}>
                <Download size={16} /> Exportar
              </Button>
              <label style={{ position: "relative" }}>
                <Button as="span">
                  <Upload size={16} /> Importar
                </Button>
                <input
                  type="file"
                  accept=".json"
                  onChange={importData}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}