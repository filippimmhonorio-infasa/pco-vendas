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
} from "lucide-react";

export default function Supervisor({ acesso }) {
  const supNome = acesso.supervisor;
  const [cenario, setCenario] = useState(null);
  const [estrutura, setEstrutura] = useState(null);
  const [projCli, setProjCli] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [importInfo, setImportInfo] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    (async () => {
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
      setCarregando(false);
    })();
  }, [supNome]);

  const itens = useMemo(() => {
    if (!estrutura) return [];
    const arr = [];
    for (const [combo, cData] of Object.entries(estrutura)) {
      const [filial, canal] = combo.split("|");
      for (const [pc, pd] of Object.entries(cData.prods)) {
        arr.push({ combo, filial, canal, pc, pd });
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
  }, [estrutura, projCli, supNome]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((it) => it.pd.nome.toLowerCase().includes(q));
  }, [itens, busca]);

  const totalGeral = useMemo(() => {
    let vol = 0, rec = 0;
    for (const it of itens) {
      for (const c of it.pd.cli) {
        const id = idCliente(it.filial, it.canal, supNome, it.pc, c.cod, c.loja, c.vend);
        const pcli = projCli[id];
        for (const m of MESES) {
          const v = pcli?.vol?.[m] ?? c.vbCli;
          const p = pcli?.preco?.[m] ?? c.pm;
          vol += v; rec += v * p;
        }
      }
    }
    return { vol, rec };
  }, [itens, projCli, supNome]);

  if (carregando) return <div style={wrap}><p style={{ color: "var(--sub)" }}><span className="spin" /> Carregando sua projeção…</p></div>;
  if (!cenario) return <div style={wrap}><div className="card">Nenhum cenário ativo ainda. Aguarde o administrador liberar a base.</div></div>;
  if (!estrutura || Object.keys(estrutura).length === 0)
    return <div style={wrap}><div className="card">Não há produtos vinculados a você ({supNome}) neste cenário.</div></div>;

  async function salvarTudo() {
    setSalvando(true);
    try {
      const linhas = [];
      for (const it of itens) {
        for (const c of it.pd.cli) {
          const id = idCliente(it.filial, it.canal, supNome, it.pc, c.cod, c.loja, c.vend);
          const pcli = projCli[id];
          const vol = {}, preco = {};
          for (const m of MESES) {
            vol[m] = pcli?.vol?.[m] ?? c.vbCli;
            preco[m] = pcli?.preco?.[m] ?? c.pm;
          }
          linhas.push({
            filial: it.filial, canal: it.canal, sup: supNome, vend: c.vend,
            produto: it.pc, cliente: c.cod, loja: c.loja, vol, preco,
          });
        }
      }
      await salvarProjecaoCliente(cenario.id, linhas, acesso.nome || supNome);
      setSalvo(true); setTimeout(() => setSalvo(false), 2500);
    } catch (e) { alert("Falha ao salvar: " + e.message); }
    setSalvando(false);
  }

  function exportar() {
    const nome = `projecao_${supNome.replace(/\s+/g, "_")}.xlsx`;
    exportarExcel(estrutura, projCli, nome);
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
          if (fileRef.current) fileRef.current.value = "";
          return;
        }
        if (!imp.length) {
          setImportInfo({ tipo: "erro", msg: "A planilha não tinha linhas válidas para importar." });
          if (fileRef.current) fileRef.current.value = "";
          return;
        }
        setSalvando(true);
        await salvarProjecaoCliente(cenario.id, imp, acesso.nome || supNome,
          (fe, t) => setImportInfo({ tipo: "prog", msg: `Importando ${fe}/${t}…` }));
        const proj = await lerProjecaoCliente(cenario.id, supNome);
        setProjCli(proj);
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, margin: "14px 0" }}>
        <Stat label="Volume projetado (6 meses)" v={fmt(totalGeral.vol) + " t"} />
        <Stat label="Receita projetada (6 meses)" v={fmtBRL(totalGeral.rec)} />
        <Stat label="Preço médio" v={fmtBRL(totalGeral.vol > 0 ? totalGeral.rec / totalGeral.vol : 0)} />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "12px 0 18px" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 340 }}>
          <Search size={16} style={{ position: "absolute", left: 10, top: 10, color: "var(--sub)" }} />
          <input className="input" style={{ paddingLeft: 34 }} placeholder="Buscar produto…"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <span style={{ fontSize: 13, color: "var(--sub)", marginRight: "auto" }}>
          {supNome} · {itens.length} produto(s)
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
          <div>
            {importInfo.msg}
            {importInfo.erros && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {importInfo.erros.map((e, i) => <li key={i} style={{ fontSize: 12.5 }}>{e}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {filtrados.map((it) => (
        <LinhaProduto key={it.combo + "|" + it.pc} it={it}
          projCli={projCli} setProjCli={setProjCli} supNome={supNome} />
      ))}
    </div>
  );
}

function LinhaProduto({ it, projCli, setProjCli, supNome }) {
  const [aberto, setAberto] = useState(false);
  const { filial, canal, pc, pd } = it;

  function getCli(c) {
    const id = idCliente(filial, canal, supNome, pc, c.cod, c.loja, c.vend);
    return { id, p: projCli[id] };
  }
  function setCampo(c, tipo, m, valor) {
    const id = idCliente(filial, canal, supNome, pc, c.cod, c.loja, c.vend);
    setProjCli((prev) => {
      const cur = prev[id] || { vol: {}, preco: {} };
      const novo = { ...cur, vol: { ...cur.vol }, preco: { ...cur.preco }, sup: supNome };
      for (const mm of MESES) {
        if (novo.vol[mm] == null) novo.vol[mm] = c.vbCli;
        if (novo.preco[mm] == null) novo.preco[mm] = c.pm;
      }
      novo[tipo][m] = num(valor);
      return { ...prev, [id]: novo };
    });
  }

  let volProd = 0, recProd = 0;
  for (const c of pd.cli) {
    const { p } = getCli(c);
    for (const m of MESES) {
      const v = p?.vol?.[m] ?? c.vbCli;
      const pr = p?.preco?.[m] ?? c.pm;
      volProd += v; recProd += v * pr;
    }
  }

  return (
    <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
      <div onClick={() => setAberto(!aberto)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}>
        {aberto ? <ChevronDown size={18} color="var(--sub)" /> : <ChevronRight size={18} color="var(--sub)" />}
        <Package size={18} color="var(--amber)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{pd.nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 2 }}>
            <span className="tag">{canal}</span>{" "}
            {pd.cli.length} cliente(s) · PM {fmtBRL(pd.pm)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700 }}>{fmt(volProd)} t</div>
          <div style={{ fontSize: 12.5, color: "var(--sub)" }}>{fmtBRL(recProd)}</div>
        </div>
      </div>

      {aberto && (
        <div style={{ borderTop: "1px solid var(--line)", padding: 16, background: "#fbfdff", overflowX: "auto" }}>
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Cliente</th>
                <th style={{ minWidth: 150 }}>Vendedor</th>
                {MESES.map((m) => <th key={m} className="num">{m} · vol</th>)}
                <th className="num">Total (t)</th>
              </tr>
            </thead>
            <tbody>
              {pd.cli.map((c) => {
                const { p } = getCli(c);
                const totCli = MESES.reduce((a, m) => a + (p?.vol?.[m] ?? c.vbCli), 0);
                return (
                  <tr key={`${c.cod}|${c.loja}|${c.vend}`}>
                    <td>{c.n}</td>
                    <td style={{ fontSize: 12.5, color: "var(--sub)" }}>
                      <Users size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />{c.vend}
                    </td>
                    {MESES.map((m) => (
                      <td key={m} className="num">
                        <input className="input" style={inNum} type="number" step="0.001"
                          value={round(p?.vol?.[m] ?? c.vbCli, 3)}
                          onChange={(e) => setCampo(c, "vol", m, e.target.value)} />
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 600 }}>{fmt(totCli)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "var(--sub)", marginTop: 10 }}>
            Dica: para editar o preço por mês/cliente com mais conforto, use "Exportar Excel"
            (o arquivo traz também as colunas de preço Jul–Dez), edite e reimporte.
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
const inNum = { width: 92, textAlign: "right", padding: "5px 7px", display: "inline-block" };
const aviso = (tipo) => ({
  marginBottom: 14, padding: "10px 14px", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13,
  background: tipo === "bad" ? "#fdecea" : tipo === "ok" ? "#eafaf1" : "#eef4fb",
  color: tipo === "bad" ? "var(--bad)" : tipo === "ok" ? "var(--ok)" : "var(--blue)",
});
