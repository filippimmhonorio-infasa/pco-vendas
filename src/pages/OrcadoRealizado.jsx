import React, { useEffect, useMemo, useState } from "react";
import { lerProjecaoCliente, lerRealizado, getCenarioAtivo } from "../lib/store.js";
import { montarComparativo } from "../lib/comparativo.js";
import { mesesDoCenario } from "../lib/periodo.js";
import { TrendingUp, TrendingDown, Minus, BarChart3, AlertTriangle } from "lucide-react";

const NIVEIS = [
  { id: "filial", nome: "Filial" },
  { id: "canal", nome: "Canal" },
  { id: "supervisor", nome: "Supervisor" },
  { id: "vendedor", nome: "Vendedor" },
  { id: "produto", nome: "Produto" },
];

// supNome: se passado, filtra tudo pelo supervisor (visão do supervisor)
export default function OrcadoRealizado({ supNome = null }) {
  const [cenario, setCenario] = useState(null);
  const [projcli, setProjcli] = useState([]);
  const [realizado, setRealizado] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [nivel, setNivel] = useState(supNome ? "vendedor" : "filial");

  useEffect(() => {
    (async () => {
      try {
        const c = await getCenarioAtivo();
        setCenario(c);
        if (!c) { setCarregando(false); return; }
        const [pc, re] = await Promise.all([
          lerProjecaoClienteArr(c.id, supNome),
          lerRealizado(c.id, supNome),
        ]);
        setProjcli(pc); setRealizado(re);
      } catch (e) {
        setErro("Não consegui carregar o comparativo. Detalhe: " + (e?.message || e));
      }
      setCarregando(false);
    })();
  }, [supNome]);

  // meses do período do cenário
  const mesesPeriodo = useMemo(() => (cenario ? mesesDoCenario(cenario) : []), [cenario]);

  // chaves de mês que têm realizado
  const mesesRealizados = useMemo(() => {
    const set = new Set();
    for (const r of realizado)
      for (const k of Object.keys(r.mesesVol || {})) set.add(k);
    return [...set].sort();
  }, [realizado]);

  // interseção: meses do período que já têm realizado (comparação justa)
  const mesKeysComparar = useMemo(() => {
    const doPeriodo = new Set(mesesPeriodo.map((m) => m.key));
    return mesesRealizados.filter((k) => doPeriodo.has(k));
  }, [mesesPeriodo, mesesRealizados]);

  const comp = useMemo(() => {
    if (!mesKeysComparar.length) return null;
    return montarComparativo(projcli, realizado, mesKeysComparar, nivel);
  }, [projcli, realizado, mesKeysComparar, nivel]);

  if (carregando) return <p style={{ color: "var(--sub)" }}><span className="spin" /> Carregando comparativo…</p>;
  if (erro) return <div style={aviso("bad")}><AlertTriangle size={16} /> {erro}</div>;
  if (!cenario) return <div className="card">Nenhum cenário ativo.</div>;
  if (!realizado.length)
    return <div className="card" style={{ textAlign: "center", color: "var(--sub)" }}>
      <BarChart3 size={26} style={{ opacity: .5 }} />
      <p>Ainda não há dados de realizado importados.{!supNome && " Importe na aba \"Realizado\"."}</p>
    </div>;
  if (!comp)
    return <div className="card" style={{ textAlign: "center", color: "var(--sub)" }}>
      <BarChart3 size={26} style={{ opacity: .5 }} />
      <p>O realizado importado não coincide com os meses do período deste cenário
      ({mesesPeriodo.map((m) => m.label).join(", ")}). Verifique se a planilha de
      realizado é do período certo.</p>
    </div>;

  const periodo = mesesPeriodo.filter((m) => mesKeysComparar.includes(m.key)).map((m) => m.label).join(", ");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--sub)" }}>
          Comparando o período com realizado: <b>{periodo}</b> (orçado e realizado nos mesmos meses).
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--sub)" }}>Ver por:</span>
          <select className="input" style={{ width: 150 }} value={nivel} onChange={(e) => setNivel(e.target.value)}>
            {NIVEIS.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
          </select>
        </div>
      </div>

      {/* cards de totais */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 16 }}>
        <CardTotal label="Volume orçado" v={fmt(comp.totais.volOrc) + " t"} />
        <CardTotal label="Volume realizado" v={fmt(comp.totais.volReal) + " t"} />
        <CardTotal label="Atingimento vol." v={pct(comp.totais.atingVol)} destaque={cor(comp.totais.atingVol)} />
        <CardTotal label="Receita realizada" v={fmtBRL(comp.totais.recReal)} />
        <CardTotal label="Atingimento rec." v={pct(comp.totais.atingRec)} destaque={cor(comp.totais.atingRec)} />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden", overflowX: "auto" }}>
        <table style={{ minWidth: 820 }}>
          <thead><tr>
            <th>{NIVEIS.find((n) => n.id === nivel).nome}</th>
            <th className="num">Vol. orçado</th>
            <th className="num">Vol. realizado</th>
            <th className="num">Desvio</th>
            <th className="num">Ating.</th>
            <th className="num">Rec. orçada</th>
            <th className="num">Rec. realizada</th>
            <th className="num">Ating.</th>
          </tr></thead>
          <tbody>
            {comp.linhas.map((l) => (
              <tr key={l.chave}>
                <td style={{ fontWeight: 600 }}>{l.label}</td>
                <td className="num">{fmt(l.volOrc)}</td>
                <td className="num">{fmt(l.volReal)}</td>
                <td className="num" style={{ color: l.difVol >= 0 ? "var(--ok)" : "var(--bad)" }}>
                  {seta(l.difVol)} {fmt(Math.abs(l.difVol))}
                </td>
                <td className="num" style={{ fontWeight: 600, color: corHex(l.atingVol) }}>{pct(l.atingVol)}</td>
                <td className="num">{fmtBRL(l.recOrc)}</td>
                <td className="num">{fmtBRL(l.recReal)}</td>
                <td className="num" style={{ fontWeight: 600, color: corHex(l.atingRec) }}>{pct(l.atingRec)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "var(--cloud)", fontWeight: 700 }}>
              <td>Total</td>
              <td className="num">{fmt(comp.totais.volOrc)}</td>
              <td className="num">{fmt(comp.totais.volReal)}</td>
              <td className="num" style={{ color: comp.totais.difVol >= 0 ? "var(--ok)" : "var(--bad)" }}>
                {seta(comp.totais.difVol)} {fmt(Math.abs(comp.totais.difVol))}
              </td>
              <td className="num" style={{ color: corHex(comp.totais.atingVol) }}>{pct(comp.totais.atingVol)}</td>
              <td className="num">{fmtBRL(comp.totais.recOrc)}</td>
              <td className="num">{fmtBRL(comp.totais.recReal)}</td>
              <td className="num" style={{ color: corHex(comp.totais.atingRec) }}>{pct(comp.totais.atingRec)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// lê projeção por cliente como ARRAY (a store devolve mapa por id)
async function lerProjecaoClienteArr(cenarioId, supNome) {
  const mapa = await lerProjecaoCliente(cenarioId, supNome);
  return Object.values(mapa);
}

function CardTotal({ label, v, destaque }) {
  return <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
    <div style={{ fontSize: 11, color: "var(--sub)", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 700, marginTop: 3, color: destaque || "var(--ink)" }}>{v}</div>
  </div>;
}
function seta(d) {
  if (Math.abs(d) < 0.05) return <Minus size={12} style={{ verticalAlign: "-1px" }} />;
  return d > 0 ? <TrendingUp size={12} style={{ verticalAlign: "-1px" }} /> : <TrendingDown size={12} style={{ verticalAlign: "-1px" }} />;
}
function cor(at) { if (at == null) return null; return at >= 1 ? "var(--ok)" : at >= 0.85 ? "var(--amber)" : "var(--bad)"; }
function corHex(at) { if (at == null) return "var(--sub)"; return at >= 1 ? "var(--ok)" : at >= 0.85 ? "#8a5a00" : "var(--bad)"; }
const fmt = (n) => (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const fmtBRL = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (n) => n == null ? "—" : (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
const aviso = (t) => ({ marginBottom: 14, padding: "10px 14px", borderRadius: 8, display: "flex", gap: 8, alignItems: "center", fontSize: 13, background: "#fdecea", color: "var(--bad)" });
