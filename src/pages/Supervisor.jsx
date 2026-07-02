import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getCenarioAtivo, lerBase,
  lerProjecaoCliente, salvarProjecaoCliente,
} from "../lib/store.js";
import { MESES } from "../lib/rateio.js";
import { exportarExcel, importarExcel, idCliente } from "../lib/exportacao.js";
import {
  Package, ChevronDown, ChevronRight, Save, Search,
  CheckCircle2, Loader2, Download, Upload, AlertTriangle, Users,
  Copy, Filter, BarChart3, ListTree,
} from "lucide-react";

export default function Supervisor({ acesso }) {
  const supNome = acesso.supervisor;
  const [cenario, setCenario] = useState(null);
  const [estrutura, setEstrutura] = useState(null);
  const [projCli, setProjCli] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState("");
  const [buscaCli, setBuscaCli] = useState("");
  const [vendFiltro, setVendFiltro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [sujo, setSujo] = useState(false);         // há alterações não salvas?
  const [aba, setAba] = useState("projecao");      // projecao | resumo
  const [importInfo, setImportInfo] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    (async () => {
      try {
        const c = await getCenarioAtivo();
        setCenario(c);
        if (!c) { setCarregando(false); return; }
        const [base, proj] = await Promise.all([
          lerBase(c.id), lerProjecaoCliente(c.id, supNome),
        ]);
        const minha = {};
        for (const [k, v] of Object.entries(base)) {
          if (k.split("|")[2] === supNome) minha[k] = v;
        }
        setEstrutura(minha);
        setProjCli(proj);
      } catch (e) {
        setErro("Não consegui carregar sua projeção. Detalhe: " + (e?.message || e));
      }
      setCarregando(false);
    })();
  }, [supNome]);

  // lista de vendedores do supervisor (para o filtro)
  const vendedores = useMemo(() => {
    if (!estrutura) return [];
    const set = new Set();
    for (const cData of Object.values(estrutura))
      for (const pd of Object.values(cData.prods))
        for (const c of pd.cli) if (c.vend) set.add(c.vend);
    return [...set].sort();
  }, [estrutura]);

  // itens (produtos), aplicando filtros de vendedor/cliente
  const itens = useMemo(() => {
    if (!estrutura) return [];
    const qCli = buscaCli.trim().toLowerCase();
    const arr = [];
    for (const [combo, cData] of Object.entries(estrutura)) {
      const [filial, canal] = combo.split("|");
      for (const [pc, pd] of Object.entries(cData.prods)) {
        // filtra clientes do produto pelos critérios
        const cli = pd.cli.filter((c) =>
          (!vendFiltro || c.vend === vendFiltro) &&
          (!qCli || c.n.toLowerCase().includes(qCli))
        );
        if (!cli.length) continue;
        arr.push({ combo, filial, canal, pc, pd: { ...pd, cli } });
      }
    }
    const volDe = (it) => {
      let tot = 0;
      for (const c of it.pd.cli) {
        const id = idCliente(it.filial, it.canal, supNome, it.pc, c.cod, c.loja, c.vend);
        for (const m of MESES) tot += projCli[id]?.vol?.[m] ?? c.vbCli;
      }
      return tot;
    };
    arr.forEach((it) => { it._vol = volDe(it); });
    arr.sort((a, b) => b._vol - a._vol);
    return arr;
  }, [estrutura, projCli, supNome, vendFiltro, buscaCli]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((it) => it.pd.nome.toLowerCase().includes(q));
  }, [itens, busca]);

  // valor efetivo de um cliente/mês (projeção salva/editada ou média histórica)
  function volCliMes(filial, canal, pc, c, m) {
    const id = idCliente(filial, canal, supNome, pc, c.cod, c.loja, c.vend);
    return projCli[id]?.vol?.[m] ?? c.vbCli;
  }
  function precoCliMes(filial, canal, pc, c, m) {
    const id = idCliente(filial, canal, supNome, pc, c.cod, c.loja, c.vend);
    return projCli[id]?.preco?.[m] ?? c.pm;
  }

  // total geral (respeita filtros aplicados na lista)
  const totalGeral = useMemo(() => {
    let vol = 0, rec = 0;
    for (const it of itens)
      for (const c of it.pd.cli)
        for (const m of MESES) {
          const v = volCliMes(it.filial, it.canal, it.pc, c, m);
          const p = precoCliMes(it.filial, it.canal, it.pc, c, m);
          vol += v; rec += v * p;
        }
    return { vol, rec };
  }, [itens, projCli, supNome]);

  // resumo por vendedor (todos, independente do filtro de produto)
  const resumoVend = useMemo(() => {
    if (!estrutura) return [];
    const acc = {};
    for (const [combo, cData] of Object.entries(estrutura)) {
      const [filial, canal] = combo.split("|");
      for (const [pc, pd] of Object.entries(cData.prods)) {
        for (const c of pd.cli) {
          const v = acc[c.vend] || (acc[c.vend] = { vend: c.vend, vol: 0, rec: 0, nCli: new Set() });
          for (const m of MESES) {
            const vol = volCliMes(filial, canal, pc, c, m);
            const pr = precoCliMes(filial, canal, pc, c, m);
            v.vol += vol; v.rec += vol * pr;
          }
          v.nCli.add(c.cod);
        }
      }
    }
    return Object.values(acc)
      .map((v) => ({ ...v, nCli: v.nCli.size, pm: v.vol > 0 ? v.rec / v.vol : 0 }))
      .sort((a, b) => b.vol - a.vol);
  }, [estrutura, projCli, supNome]);

  if (carregando) return <div style={wrap}><p style={{ color: "var(--sub)" }}><span className="spin" /> Carregando sua projeção…</p></div>;
  if (erro) return <div style={wrap}><div style={aviso("bad")}><AlertTriangle size={16} /> {erro}</div></div>;
  if (!cenario) return <div style={wrap}><div className="card">Nenhum cenário ativo ainda. Aguarde o administrador liberar a base.</div></div>;
  if (!estrutura || Object.keys(estrutura).length === 0)
    return <div style={wrap}><div className="card">Não há produtos vinculados a você ({supNome}) neste cenário.</div></div>;

  // aplica alteração em um cliente/mês
  function setCampoCli(filial, canal, pc, c, tipo, m, valor, replicar = false) {
    const id = idCliente(filial, canal, supNome, pc, c.cod, c.loja, c.vend);
    setProjCli((prev) => {
      const cur = prev[id] || { vol: {}, preco: {} };
      const novo = { ...cur, vol: { ...cur.vol }, preco: { ...cur.preco }, sup: supNome };
      for (const mm of MESES) {
        if (novo.vol[mm] == null) novo.vol[mm] = c.vbCli;
        if (novo.preco[mm] == null) novo.preco[mm] = c.pm;
      }
      const val = num(valor);
      if (replicar) { for (const mm of MESES) novo[tipo][mm] = val; }
      else novo[tipo][m] = val;
      return { ...prev, [id]: novo };
    });
    setSujo(true); setSalvo(false);
  }
  // replica o valor atual de Julho (vol) para os demais meses
  function replicarJul(filial, canal, pc, c) {
    const julVal = volCliMes(filial, canal, pc, c, "Jul");
    setCampoCli(filial, canal, pc, c, "vol", "Jul", julVal, true);
  }

  async function salvarTudo() {
    setSalvando(true);
    try {
      const linhas = [];
      for (const [combo, cData] of Object.entries(estrutura)) {
        const [filial, canal] = combo.split("|");
        for (const [pc, pd] of Object.entries(cData.prods)) {
          for (const c of pd.cli) {
            const vol = {}, preco = {};
            for (const m of MESES) {
              vol[m] = volCliMes(filial, canal, pc, c, m);
              preco[m] = precoCliMes(filial, canal, pc, c, m);
            }
            linhas.push({
              filial, canal, sup: supNome, vend: c.vend,
              produto: pc, cliente: c.cod, loja: c.loja, vol, preco,
            });
          }
        }
      }
      await salvarProjecaoCliente(cenario.id, linhas, acesso.nome || supNome);
      setSalvo(true); setSujo(false); setTimeout(() => setSalvo(false), 2500);
    } catch (e) { alert("Falha ao salvar: " + e.message); }
    setSalvando(false);
  }

  function exportar() {
    exportarExcel(estrutura, projCli, `projecao_${supNome.replace(/\s+/g, "_")}.xlsx`);
  }
  function escolherArquivo(e) {
    setImportInfo(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { itens: imp, erros } = importarExcel(reader.result, supNome);
        if (erros.length) {
          setImportInfo({ tipo: "erro", msg: `Encontrei ${erros.length} problema(s). Nenhum dado foi salvo.`, erros: erros.slice(0, 8) });
          if (fileRef.current) fileRef.current.value = ""; return;
        }
        if (!imp.length) {
          setImportInfo({ tipo: "erro", msg: "A planilha não tinha linhas válidas para importar." });
          if (fileRef.current) fileRef.current.value = ""; return;
        }
        setSalvando(true);
        await salvarProjecaoCliente(cenario.id, imp, acesso.nome || supNome,
          (fe, t) => setImportInfo({ tipo: "prog", msg: `Importando ${fe}/${t}…` }));
        const proj = await lerProjecaoCliente(cenario.id, supNome);
        setProjCli(proj); setSujo(false);
        setImportInfo({ tipo: "ok", msg: `${imp.length} linha(s) importada(s) e salva(s) com sucesso.` });
      } catch (err) {
        setImportInfo({ tipo: "erro", msg: "Falha ao ler o arquivo: " + err.message });
      }
      setSalvando(false);
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsArrayBuffer(f);
  }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--amber)", letterSpacing: ".04em" }}>
          PROJEÇÃO POR PRODUTO · CLIENTE · VENDEDOR
        </div>
        <h1 style={{ margin: "2px 0 0", fontSize: 24 }}>Projeção de vendas Jul–Dez</h1>
        <p style={{ color: "var(--sub)", fontSize: 14, marginTop: 6, maxWidth: 720 }}>
          Cada cliente vem preenchido com a média dos últimos meses. Ajuste na tela ou,
          se preferir, exporte para Excel, edite e reimporte. Não esqueça de salvar.
        </p>
      </div>

      {/* aviso de não salvo */}
      {sujo && (
        <div style={aviso("info")}>
          <AlertTriangle size={16} /> Você tem alterações não salvas. Clique em "Salvar projeção" para gravá-las.
        </div>
      )}

      {/* abas */}
      <div style={{ display: "flex", gap: 6, margin: "12px 0", borderBottom: "1px solid var(--line)" }}>
        {[["projecao", "Projeção", ListTree], ["resumo", "Resumo por vendedor", BarChart3]].map(([id, nome, Ic]) => {
          const at = aba === id;
          return (
            <button key={id} onClick={() => setAba(id)} style={{
              border: "none", background: "none", padding: "9px 14px", fontWeight: 600, fontSize: 14,
              color: at ? "var(--blue)" : "var(--sub)", borderBottom: at ? "2px solid var(--blue)" : "2px solid transparent",
              marginBottom: -1, display: "flex", alignItems: "center", gap: 7,
            }}><Ic size={16} /> {nome}</button>
          );
        })}
      </div>

      {/* barra de ações (comum às duas abas) */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "6px 0 16px" }}>
        <span style={{ fontSize: 13, color: "var(--sub)", marginRight: "auto" }}>
          {supNome} · {vendedores.length} vendedor(es)
        </span>
        <button className="btn btn-ghost" onClick={exportar}>
          <Download size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} /> Exportar Excel
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={escolherArquivo} style={{ display: "none" }} id="impFile" />
        <label htmlFor="impFile" className="btn btn-ghost" style={{ cursor: "pointer" }}>
          <Upload size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} /> Importar Excel
        </label>
        <button className="btn" onClick={salvarTudo} disabled={salvando}>
          {salvando ? <Loader2 size={16} className="spin" style={{ verticalAlign: "-3px", marginRight: 6 }} />
            : salvo ? <CheckCircle2 size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            : <Save size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />}
          {salvando ? "Salvando…" : salvo ? "Salvo!" : "Salvar projeção"}
        </button>
      </div>

      {importInfo && (
        <div style={aviso(importInfo.tipo === "erro" ? "bad" : importInfo.tipo === "ok" ? "ok" : "info")}>
          {importInfo.tipo === "erro" ? <AlertTriangle size={16} /> : importInfo.tipo === "ok" ? <CheckCircle2 size={16} /> : <Loader2 size={16} className="spin" />}
          <div>{importInfo.msg}
            {importInfo.erros && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{importInfo.erros.map((e, i) => <li key={i} style={{ fontSize: 12.5 }}>{e}</li>)}</ul>}
          </div>
        </div>
      )}

      {aba === "resumo" ? (
        <ResumoVendedores dados={resumoVend} sujo={sujo} total={totalGeral}
          onVer={(v) => { setVendFiltro(v); setAba("projecao"); }} />
      ) : (
        <>
          {/* totais + filtros */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 14 }}>
            <Stat label={`Volume projetado${vendFiltro ? " (filtrado)" : ""}`} v={fmt(totalGeral.vol) + " t"} />
            <Stat label="Receita projetada" v={fmtBRL(totalGeral.rec)} />
            <Stat label="Preço médio" v={fmtBRL(totalGeral.vol > 0 ? totalGeral.rec / totalGeral.vol : 0)} />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--sub)", fontSize: 13 }}>
              <Filter size={15} /> Filtros:
            </div>
            <select className="input" style={{ width: 240 }} value={vendFiltro} onChange={(e) => setVendFiltro(e.target.value)}>
              <option value="">Todos os vendedores</option>
              {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <div style={{ position: "relative", minWidth: 200 }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--sub)" }} />
              <input className="input" style={{ paddingLeft: 32, width: 200 }} placeholder="Buscar cliente…"
                value={buscaCli} onChange={(e) => setBuscaCli(e.target.value)} />
            </div>
            <div style={{ position: "relative", minWidth: 200 }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--sub)" }} />
              <input className="input" style={{ paddingLeft: 32, width: 200 }} placeholder="Buscar produto…"
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {(vendFiltro || buscaCli || busca) && (
              <button className="btn btn-ghost" style={{ padding: "6px 12px" }}
                onClick={() => { setVendFiltro(""); setBuscaCli(""); setBusca(""); }}>Limpar</button>
            )}
            <span style={{ fontSize: 13, color: "var(--sub)", marginLeft: "auto" }}>{filtrados.length} produto(s)</span>
          </div>

          {filtrados.length === 0
            ? <div className="card" style={{ color: "var(--sub)" }}>Nenhum produto para os filtros selecionados.</div>
            : filtrados.map((it) => (
              <LinhaProduto key={it.combo + "|" + it.pc} it={it}
                volCliMes={volCliMes} precoCliMes={precoCliMes}
                setCampoCli={setCampoCli} replicarJul={replicarJul} supNome={supNome} />
            ))}
        </>
      )}
    </div>
  );
}

function ResumoVendedores({ dados, sujo, total, onVer }) {
  return (
    <div>
      {sujo && <div style={{ ...aviso("info"), marginBottom: 12 }}>
        <AlertTriangle size={16} /> Valores refletem suas edições atuais (ainda não salvas).
      </div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 16 }}>
        <Stat label="Total volume (6m)" v={fmt(total.vol) + " t"} />
        <Stat label="Total receita (6m)" v={fmtBRL(total.rec)} />
        <Stat label="Preço médio" v={fmtBRL(total.vol > 0 ? total.rec / total.vol : 0)} />
        <Stat label="Vendedores" v={dados.length} />
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th>Vendedor</th><th className="num">Clientes</th>
            <th className="num">Volume (t)</th><th className="num">Receita</th>
            <th className="num">Preço médio</th><th></th>
          </tr></thead>
          <tbody>
            {dados.map((v) => (
              <tr key={v.vend}>
                <td style={{ fontWeight: 600 }}>
                  <Users size={13} style={{ verticalAlign: "-2px", marginRight: 6, color: "var(--sub)" }} />{v.vend}
                </td>
                <td className="num">{v.nCli}</td>
                <td className="num" style={{ fontWeight: 600 }}>{fmt(v.vol)}</td>
                <td className="num">{fmtBRL(v.rec)}</td>
                <td className="num">{fmtBRL(v.pm)}</td>
                <td className="num">
                  <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12.5 }}
                    onClick={() => onVer(v.vend)}>Ver</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinhaProduto({ it, volCliMes, precoCliMes, setCampoCli, replicarJul, supNome }) {
  const [aberto, setAberto] = useState(false);
  const { filial, canal, pc, pd } = it;

  let volProd = 0, recProd = 0;
  for (const c of pd.cli)
    for (const m of MESES) {
      const v = volCliMes(filial, canal, pc, c, m);
      const pr = precoCliMes(filial, canal, pc, c, m);
      volProd += v; recProd += v * pr;
    }

  return (
    <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
      <div onClick={() => setAberto(!aberto)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}>
        {aberto ? <ChevronDown size={18} color="var(--sub)" /> : <ChevronRight size={18} color="var(--sub)" />}
        <Package size={18} color="var(--amber)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{pd.nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 2 }}>
            <span className="tag">{canal}</span> {pd.cli.length} cliente(s) · PM {fmtBRL(pd.pm)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700 }}>{fmt(volProd)} t</div>
          <div style={{ fontSize: 12.5, color: "var(--sub)" }}>{fmtBRL(recProd)}</div>
        </div>
      </div>

      {aberto && (
        <div style={{ borderTop: "1px solid var(--line)", padding: 16, background: "#fbfdff", overflowX: "auto" }}>
          <table style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 190 }}>Cliente</th>
                <th style={{ minWidth: 150 }}>Vendedor</th>
                {MESES.map((m) => <th key={m} className="num">{m}</th>)}
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pd.cli.map((c) => {
                const totCli = MESES.reduce((a, m) => a + volCliMes(filial, canal, pc, c, m), 0);
                return (
                  <tr key={`${c.cod}|${c.loja}|${c.vend}`}>
                    <td>{c.n}</td>
                    <td style={{ fontSize: 12.5, color: "var(--sub)" }}>
                      <Users size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />{c.vend}
                    </td>
                    {MESES.map((m) => (
                      <td key={m} className="num">
                        <input className="input" style={inNum} type="number" step="0.001"
                          value={round(volCliMes(filial, canal, pc, c, m), 3)}
                          onChange={(e) => setCampoCli(filial, canal, pc, c, "vol", m, e.target.value)} />
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 600 }}>{fmt(totCli)}</td>
                    <td className="num">
                      <button className="btn btn-ghost" style={{ padding: "4px 8px" }}
                        title="Replicar o volume de Julho para os demais meses"
                        onClick={() => replicarJul(filial, canal, pc, c)}>
                        <Copy size={14} color="var(--blue)" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "var(--sub)", marginTop: 10 }}>
            O botão <Copy size={12} style={{ verticalAlign: "-2px" }} /> replica o volume de <b>Julho</b> daquele cliente para Ago–Dez.
            Para editar preços por mês, use "Exportar Excel" (traz as colunas de preço), edite e reimporte.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, v }) {
  return <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
    <div style={{ fontSize: 11, color: "var(--sub)", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{v}</div>
  </div>;
}
function num(v) { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; }
function round(n, d) { const f = 10 ** d; return Math.round((n || 0) * f) / f; }
const fmt = (n) => (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const fmtBRL = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const wrap = { maxWidth: 1080, margin: "0 auto", padding: "22px 20px 60px" };
const inNum = { width: 80, textAlign: "right", padding: "5px 6px", display: "inline-block" };
const aviso = (tipo) => ({
  marginBottom: 14, padding: "10px 14px", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13,
  background: tipo === "bad" ? "#fdecea" : tipo === "ok" ? "#eafaf1" : "#fff7e8",
  color: tipo === "bad" ? "var(--bad)" : tipo === "ok" ? "var(--ok)" : "#8a5a00",
});
