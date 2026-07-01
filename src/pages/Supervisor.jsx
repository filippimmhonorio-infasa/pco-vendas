import React, { useEffect, useMemo, useState } from "react";
import {
  getCenarioAtivo, lerBase, lerProjecao, salvarProjecao,
  lerOverrides, salvarOverride,
} from "../lib/store.js";
import { MESES, MES_NUM, ratear } from "../lib/rateio.js";
import {
  Package, ChevronDown, ChevronRight, Save, Lock, Unlock,
  Search, CheckCircle2, Loader2, RotateCcw,
} from "lucide-react";

export default function Supervisor({ acesso }) {
  const supNome = acesso.supervisor;
  const [cenario, setCenario] = useState(null);
  const [estrutura, setEstrutura] = useState(null);
  const [proj, setProj] = useState({});         // linhaId -> {vol,preco}
  const [ovs, setOvs] = useState({});           // ovId -> override
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    (async () => {
      const c = await getCenarioAtivo();
      setCenario(c);
      if (!c) { setCarregando(false); return; }
      const [base, projSalva, ovsSalvos] = await Promise.all([
        lerBase(c.id), lerProjecao(c.id, supNome), lerOverrides(c.id, supNome),
      ]);
      // filtra só os combos do supervisor
      const minha = {};
      for (const [k, v] of Object.entries(base)) {
        if (k.split("|")[2] === supNome) minha[k] = v;
      }
      setEstrutura(minha);
      setProj(projSalva);
      setOvs(ovsSalvos);
      setCarregando(false);
    })();
  }, [supNome]);

  // monta a lista de produtos (combo × produto), ordenada por volume projetado desc
  const itens = useMemo(() => {
    if (!estrutura) return [];
    const arr = [];
    for (const [combo, cData] of Object.entries(estrutura)) {
      const [filial, canal] = combo.split("|");
      for (const [pc, pd] of Object.entries(cData.prods)) {
        arr.push({ combo, filial, canal, pc, pd });
      }
    }
    // volume projetado do produto = soma dos 6 meses (proj salva ou vb default)
    const volDe = (it) => MESES.reduce((a, m) => {
      const id = linhaId(it.combo, it.pc, MES_NUM[m]);
      return a + (proj[id]?.vol ?? it.pd.vb);
    }, 0);
    arr.forEach((it) => { it._vol = volDe(it); });
    arr.sort((a, b) => b._vol - a._vol);
    return arr;
  }, [estrutura, proj]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((it) => it.pd.nome.toLowerCase().includes(q));
  }, [itens, busca]);

  if (carregando) return <div style={wrap}><p style={{ color: "var(--sub)" }}><span className="spin" /> Carregando sua projeção…</p></div>;
  if (!cenario) return <div style={wrap}><div className="card">Nenhum cenário ativo ainda. Aguarde o administrador liberar a base.</div></div>;
  if (!estrutura || Object.keys(estrutura).length === 0)
    return <div style={wrap}><div className="card">Não há produtos vinculados a você ({supNome}) neste cenário. Fale com o administrador se isso estiver errado.</div></div>;

  async function salvarTudo() {
    setSalvando(true);
    try {
      const linhas = [];
      for (const it of itens) {
        for (const m of MESES) {
          const id = linhaId(it.combo, it.pc, MES_NUM[m]);
          const cur = proj[id];
          linhas.push({
            filial: it.filial, canal: it.canal, sup: supNome,
            produto: it.pc, produtoNome: it.pd.nome, mes: MES_NUM[m],
            vol: cur?.vol ?? it.pd.vb, preco: cur?.preco ?? it.pd.pm,
          });
        }
      }
      await salvarProjecao(cenario.id, linhas, acesso.nome || supNome);
      setSalvo(true); setTimeout(() => setSalvo(false), 2500);
    } catch (e) {
      alert("Falha ao salvar: " + e.message);
    }
    setSalvando(false);
  }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--amber)", letterSpacing: ".04em" }}>
          PROJEÇÃO POR PRODUTO
        </div>
        <h1 style={{ margin: "2px 0 0", fontSize: 24 }}>Projeção de vendas Jul–Dez</h1>
        <p style={{ color: "var(--sub)", fontSize: 14, marginTop: 6, maxWidth: 680 }}>
          Cada produto vem preenchido com a média dos últimos meses. Ajuste volume e preço;
          fixe clientes-chave e ajuste o preço médio por cliente quando necessário.
          Não esqueça de salvar.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "16px 0" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <Search size={16} style={{ position: "absolute", left: 10, top: 10, color: "var(--sub)" }} />
          <input className="input" style={{ paddingLeft: 34 }} placeholder="Buscar produto…"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--sub)" }}>
          {supNome} · {itens.length} produto(s)
        </div>
        <button className="btn" onClick={salvarTudo} disabled={salvando}>
          {salvando ? <Loader2 size={16} className="spin" style={{ verticalAlign: "-3px", marginRight: 6 }} />
            : salvo ? <CheckCircle2 size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            : <Save size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />}
          {salvando ? "Salvando…" : salvo ? "Salvo!" : "Salvar projeção"}
        </button>
      </div>

      {filtrados.map((it) => (
        <LinhaProduto key={it.combo + "|" + it.pc} it={it}
          proj={proj} setProj={setProj} ovs={ovs} setOvs={setOvs}
          cenarioId={cenario.id} supNome={supNome} quem={acesso.nome || supNome} />
      ))}
    </div>
  );
}

function LinhaProduto({ it, proj, setProj, ovs, setOvs, cenarioId, supNome, quem }) {
  const [aberto, setAberto] = useState(false);
  const { combo, filial, canal, pc, pd } = it;

  // volume/preço por mês (usa proj salva ou default vb/pm)
  const getVol = (m) => proj[linhaId(combo, pc, MES_NUM[m])]?.vol ?? pd.vb;
  const getPreco = (m) => proj[linhaId(combo, pc, MES_NUM[m])]?.preco ?? pd.pm;

  function setCampo(m, campo, valor) {
    const id = linhaId(combo, pc, MES_NUM[m]);
    setProj((p) => ({
      ...p,
      [id]: {
        vol: campo === "vol" ? num(valor) : (p[id]?.vol ?? pd.vb),
        preco: campo === "preco" ? num(valor) : (p[id]?.preco ?? pd.pm),
      },
    }));
  }

  const volTotal = MESES.reduce((a, m) => a + getVol(m), 0);
  const recTotal = MESES.reduce((a, m) => a + getVol(m) * getPreco(m), 0);

  return (
    <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
      <div onClick={() => setAberto(!aberto)} style={{
        display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer",
      }}>
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
          <div style={{ fontWeight: 700 }}>{fmt(volTotal)} t</div>
          <div style={{ fontSize: 12.5, color: "var(--sub)" }}>{fmtBRL(recTotal)}</div>
        </div>
      </div>

      {aberto && (
        <div style={{ borderTop: "1px solid var(--line)", padding: 16, background: "#fbfdff" }}>
          {/* grade de meses */}
          <table style={{ marginBottom: 14 }}>
            <thead><tr><th>Mês</th><th className="num">Volume (t)</th><th className="num">Preço médio (R$/t)</th><th className="num">Receita</th></tr></thead>
            <tbody>
              {MESES.map((m) => (
                <tr key={m}>
                  <td style={{ fontWeight: 600 }}>{m}</td>
                  <td className="num">
                    <input className="input" style={inNum} type="number" step="0.001"
                      value={round(getVol(m), 3)} onChange={(e) => setCampo(m, "vol", e.target.value)} />
                  </td>
                  <td className="num">
                    <input className="input" style={inNum} type="number" step="0.01"
                      value={round(getPreco(m), 2)} onChange={(e) => setCampo(m, "preco", e.target.value)} />
                  </td>
                  <td className="num">{fmtBRL(getVol(m) * getPreco(m))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ClientesProduto it={it} getVol={getVol}
            ovs={ovs} setOvs={setOvs} cenarioId={cenarioId} supNome={supNome} quem={quem} />
        </div>
      )}
    </div>
  );
}

function ClientesProduto({ it, getVol, ovs, setOvs, cenarioId, supNome, quem }) {
  const { combo, filial, canal, pc, pd } = it;
  const [mesSel, setMesSel] = useState("Jul");

  const ovId = (cliCod, loja, m) => `${enc(filial)}__${enc(canal)}__${enc(supNome)}__${enc(pc)}__${enc(cliCod)}__${MES_NUM[m]}`;

  // fixos do mês selecionado
  const fixos = {};
  for (const c of pd.cli) {
    const id = ovId(c.cod, c.loja, mesSel);
    const o = ovs[id];
    if (o?.volFixo != null) fixos[`${c.cod}|${c.loja}`] = o.volFixo;
  }
  const rateado = ratear(pd.cli, getVol(mesSel), fixos);

  async function toggleFix(c) {
    const key = `${c.cod}|${c.loja}`;
    const id = ovId(c.cod, c.loja, mesSel);
    const jaFixo = ovs[id]?.volFixo != null;
    const novo = { ...ovs };
    if (jaFixo) {
      // desafixa: remove volFixo (mantém pmOverride se houver)
      const pm = ovs[id]?.pmOverride ?? null;
      if (pm == null) { delete novo[id]; }
      else novo[id] = { ...ovs[id], volFixo: null };
      setOvs(novo);
      await salvarOverride(cenarioId, {
        filial, canal, sup: supNome, produto: pc, cliente: c.cod, loja: c.loja,
        mes: MES_NUM[mesSel], volFixo: null, pmOverride: pm,
      }, quem);
    } else {
      const v = round(rateado[key] || 0, 3);
      novo[id] = { ...(ovs[id] || {}), volFixo: v, sup: supNome };
      setOvs(novo);
      await salvarOverride(cenarioId, {
        filial, canal, sup: supNome, produto: pc, cliente: c.cod, loja: c.loja,
        mes: MES_NUM[mesSel], volFixo: v, pmOverride: ovs[id]?.pmOverride ?? null,
      }, quem);
    }
  }

  async function setFixoVal(c, valor) {
    const id = ovId(c.cod, c.loja, mesSel);
    const v = num(valor);
    setOvs((o) => ({ ...o, [id]: { ...(o[id] || {}), volFixo: v, sup: supNome } }));
    await salvarOverride(cenarioId, {
      filial, canal, sup: supNome, produto: pc, cliente: c.cod, loja: c.loja,
      mes: MES_NUM[mesSel], volFixo: v, pmOverride: ovs[id]?.pmOverride ?? null,
    }, quem);
  }

  async function setPmOverride(c, valor) {
    const id = ovId(c.cod, c.loja, mesSel);
    const pm = valor === "" ? null : num(valor);
    setOvs((o) => ({ ...o, [id]: { ...(o[id] || {}), pmOverride: pm, sup: supNome } }));
    await salvarOverride(cenarioId, {
      filial, canal, sup: supNome, produto: pc, cliente: c.cod, loja: c.loja,
      mes: MES_NUM[mesSel], volFixo: ovs[id]?.volFixo ?? null, pmOverride: pm,
    }, quem);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--sub)" }}>Clientes — mês:</span>
        <select className="input" style={{ width: 100 }} value={mesSel} onChange={(e) => setMesSel(e.target.value)}>
          {MESES.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
          Fixe um cliente para travar o volume dele; o restante é rateado pela participação histórica.
        </span>
      </div>
      <table>
        <thead><tr>
          <th>Cliente</th><th className="num">Part.</th>
          <th className="num">Volume (t)</th><th className="num">Preço (R$/t)</th><th></th>
        </tr></thead>
        <tbody>
          {pd.cli.map((c) => {
            const key = `${c.cod}|${c.loja}`;
            const id = ovId(c.cod, c.loja, mesSel);
            const o = ovs[id];
            const fixo = o?.volFixo != null;
            const vol = fixo ? o.volFixo : (rateado[key] || 0);
            const pm = o?.pmOverride != null ? o.pmOverride : c.pm;
            return (
              <tr key={key} style={fixo ? { background: "#fff7e8" } : undefined}>
                <td>{c.n}</td>
                <td className="num">{(c.s * 100).toFixed(1)}%</td>
                <td className="num">
                  {fixo
                    ? <input className="input" style={inNum} type="number" step="0.001"
                        value={round(vol, 3)} onChange={(e) => setFixoVal(c, e.target.value)} />
                    : fmt(vol)}
                </td>
                <td className="num">
                  <input className="input" style={{ ...inNum, background: o?.pmOverride != null ? "#fff7e8" : "#fff" }}
                    type="number" step="0.01" value={round(pm, 2)}
                    onChange={(e) => setPmOverride(c, e.target.value)} />
                </td>
                <td className="num">
                  <button className="btn btn-ghost" style={{ padding: "4px 8px" }}
                    onClick={() => toggleFix(c)} title={fixo ? "Desafixar" : "Fixar volume"}>
                    {fixo ? <Lock size={14} color="var(--amber)" /> : <Unlock size={14} color="var(--sub)" />}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- helpers ---------- */
function linhaId(combo, pc, mesNum) {
  const [f, c, s] = combo.split("|");
  return `${enc(f)}__${enc(c)}__${enc(s)}__${enc(pc)}__${mesNum}`;
}
function enc(s) { return String(s ?? "").replace(/[/\\.#$[\]\s]+/g, "_"); }
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function round(n, d) { const f = 10 ** d; return Math.round((n || 0) * f) / f; }
const fmt = (n) => (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const fmtBRL = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const wrap = { maxWidth: 980, margin: "0 auto", padding: "22px 20px 60px" };
const inNum = { width: 110, textAlign: "right", padding: "5px 8px", display: "inline-block" };
