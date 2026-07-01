import React, { useEffect, useRef, useState } from "react";
import { processarPlanilha } from "../lib/planilha.js";
import {
  getCenarioAtivo, criarCenario, gravarBase, lerBase,
  listarAcessos, salvarAcesso,
} from "../lib/store.js";
import {
  Upload, FileSpreadsheet, CheckCircle2, Users, BarChart3,
  Building2, AlertTriangle, Plus, Loader2,
} from "lucide-react";

const ABAS = [
  { id: "base", nome: "Base do cenário", icon: FileSpreadsheet },
  { id: "consolidado", nome: "Consolidação", icon: BarChart3 },
  { id: "usuarios", nome: "Supervisores", icon: Users },
];

export default function Admin({ acesso }) {
  const [aba, setAba] = useState("base");
  const [cenario, setCenario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    getCenarioAtivo().then((c) => { setCenario(c); setCarregando(false); });
  }, []);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "22px 20px 60px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--line)" }}>
        {ABAS.map((a) => {
          const Ic = a.icon;
          const ativo = aba === a.id;
          return (
            <button key={a.id} onClick={() => setAba(a.id)} style={{
              border: "none", background: "none", padding: "10px 14px",
              fontWeight: 600, fontSize: 14, color: ativo ? "var(--blue)" : "var(--sub)",
              borderBottom: ativo ? "2px solid var(--blue)" : "2px solid transparent",
              marginBottom: -1, display: "flex", alignItems: "center", gap: 7,
            }}>
              <Ic size={16} /> {a.nome}
            </button>
          );
        })}
      </div>

      {carregando
        ? <p style={{ color: "var(--sub)" }}><span className="spin" /> Carregando cenário…</p>
        : aba === "base" ? <AbaBase cenario={cenario} setCenario={setCenario} adminEmail={acesso ? undefined : undefined} />
        : aba === "consolidado" ? <AbaConsolidado cenario={cenario} />
        : <AbaUsuarios cenario={cenario} />}
    </div>
  );
}

/* ---------- Aba: Base (upload da planilha) ---------- */
function AbaBase({ cenario, setCenario }) {
  const fileRef = useRef();
  const [preview, setPreview] = useState(null);
  const [erro, setErro] = useState(null);
  const [nome, setNome] = useState("PCO Jul-Dez/2026");
  const [gravando, setGravando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [ok, setOk] = useState(false);

  function escolher(e) {
    setErro(null); setOk(false); setPreview(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const r = processarPlanilha(reader.result);
        setPreview(r);
      } catch (err) { setErro(err.message); }
    };
    reader.onerror = () => setErro("Não consegui ler o arquivo. Tente de novo.");
    reader.readAsArrayBuffer(f);
  }

  async function confirmar() {
    if (!preview) return;
    setGravando(true); setErro(null);
    try {
      const cenarioId = nome.trim().replace(/[/\\.#$[\]\s]+/g, "_");
      await criarCenario(cenarioId, {
        nome: nome.trim(), ano: 2026, mesIni: 7, mesFim: 12,
        baseMeses: `${preview.resumo.nMeses} meses`,
        resumo: preview.resumo,
      });
      await gravarBase(cenarioId, preview.dims, preview.estrutura, preview.histfc,
        (feito, total) => setProgresso({ feito, total }));
      const c = await getCenarioAtivo();
      setCenario(c); setOk(true); setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setErro("Falha ao gravar: " + err.message);
    }
    setGravando(false); setProgresso(null);
  }

  return (
    <div>
      {cenario && (
        <div className="card" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--sub)", fontWeight: 600 }}>CENÁRIO ATIVO</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{cenario.nome}</div>
            {cenario.resumo && (
              <div style={{ fontSize: 13, color: "var(--sub)", marginTop: 4 }}>
                {cenario.resumo.combos} combinações · {cenario.resumo.produtos} produtos ·{" "}
                {cenario.resumo.clientes} clientes · {fmt(cenario.resumo.volMedMensal)} t/mês
              </div>
            )}
          </div>
          <CheckCircle2 size={26} color="var(--ok)" />
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>
          {cenario ? "Substituir base do cenário" : "Criar cenário e importar base"}
        </h2>
        <p style={{ color: "var(--sub)", fontSize: 13, marginTop: 4 }}>
          Envie a planilha com o histórico de vendas (filial, canal, supervisor, produto,
          cliente, volume e preço médio). O sistema calcula a média por produto e a
          participação de cada cliente, que serão o ponto de partida dos supervisores.
        </p>

        <label style={lbl}>Nome do cenário</label>
        <input className="input" style={{ maxWidth: 320 }} value={nome}
          onChange={(e) => setNome(e.target.value)} />

        <div style={{ marginTop: 16 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={escolher}
            style={{ display: "none" }} id="fileInput" />
          <label htmlFor="fileInput" className="btn btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Upload size={16} /> Escolher planilha (.xlsx)
          </label>
        </div>

        {erro && (
          <div style={aviso("bad")}>
            <AlertTriangle size={16} /> {erro}
          </div>
        )}

        {ok && (
          <div style={aviso("ok")}>
            <CheckCircle2 size={16} /> Base gravada com sucesso. Os supervisores já podem projetar.
          </div>
        )}

        {preview && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Conferência antes de gravar</div>
            <div style={grid}>
              <Stat label="Linhas lidas" v={preview.resumo.linhasLidas} />
              <Stat label="Descartadas" v={preview.resumo.descartadas} />
              <Stat label="Meses" v={preview.resumo.nMeses} />
              <Stat label="Combinações" v={preview.resumo.combos} />
              <Stat label="Filiais" v={preview.resumo.filiais} />
              <Stat label="Canais" v={preview.resumo.canais} />
              <Stat label="Supervisores" v={preview.resumo.supervisores} />
              {preview.resumo.vendedores != null && <Stat label="Vendedores" v={preview.resumo.vendedores} />}
              <Stat label="Produtos" v={preview.resumo.produtos} />
              <Stat label="Clientes" v={preview.resumo.clientes} />
              <Stat label="Volume médio/mês" v={fmt(preview.resumo.volMedMensal) + " t"} />
            </div>
            <div style={{ fontSize: 13, color: "var(--sub)", margin: "10px 0" }}>
              Canais: {preview.dims.canais.join(", ")} · Filiais: {preview.dims.filiais.join(", ")}
            </div>
            <button className="btn" onClick={confirmar} disabled={gravando}>
              {gravando
                ? <><Loader2 size={16} className="spin" style={{ verticalAlign: "-3px", marginRight: 6 }} />
                    {progresso ? `Gravando ${progresso.feito}/${progresso.total}…` : "Gravando…"}</>
                : <>Gravar base e ativar cenário</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Aba: Consolidação ---------- */
function AbaConsolidado({ cenario }) {
  const [estrutura, setEstrutura] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!cenario) { setCarregando(false); return; }
    lerBase(cenario.id).then((e) => { setEstrutura(e); setCarregando(false); });
  }, [cenario]);

  if (!cenario) return <SemCenario />;
  if (carregando) return <p style={{ color: "var(--sub)" }}><span className="spin" /> Carregando…</p>;

  // agrega por filial > canal > supervisor
  const arvore = {};
  let totVol = 0, totRec = 0;
  for (const [combo, cData] of Object.entries(estrutura || {})) {
    const [fil, can, sup] = combo.split("|");
    let vol = 0, rec = 0;
    for (const p of Object.values(cData.prods || {})) {
      const v = p.vb * 6; // 6 meses no ponto de partida
      vol += v; rec += v * p.pm;
    }
    totVol += vol; totRec += rec;
    arvore[fil] = arvore[fil] || { vol: 0, rec: 0, canais: {} };
    arvore[fil].vol += vol; arvore[fil].rec += rec;
    arvore[fil].canais[can] = arvore[fil].canais[can] || { vol: 0, rec: 0, sups: {} };
    arvore[fil].canais[can].vol += vol; arvore[fil].canais[can].rec += rec;
    arvore[fil].canais[can].sups[sup] = { vol, rec };
  }

  return (
    <div>
      <div style={grid}>
        <Stat label="Volume orçado (6 meses)" v={fmt(totVol) + " t"} big />
        <Stat label="Receita orçada (6 meses)" v={fmtBRL(totRec)} big />
        <Stat label="Preço médio" v={fmtBRL(totVol > 0 ? totRec / totVol : 0)} big />
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <table>
          <thead><tr>
            <th>Filial / Canal / Supervisor</th>
            <th className="num">Volume (t)</th>
            <th className="num">Receita</th>
            <th className="num">Preço médio</th>
          </tr></thead>
          <tbody>
            {Object.entries(arvore).sort((a,b)=>b[1].vol-a[1].vol).map(([fil, fd]) => (
              <React.Fragment key={fil}>
                <tr style={{ background: "var(--cloud)" }}>
                  <td style={{ fontWeight: 700 }}><Building2 size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />{filLabel(fil)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmt(fd.vol)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtBRL(fd.rec)}</td>
                  <td className="num">{fmtBRL(fd.vol>0?fd.rec/fd.vol:0)}</td>
                </tr>
                {Object.entries(fd.canais).sort((a,b)=>b[1].vol-a[1].vol).map(([can, cd]) => (
                  <React.Fragment key={can}>
                    <tr>
                      <td style={{ paddingLeft: 28, fontWeight: 600, color: "var(--blue)" }}>{can}</td>
                      <td className="num">{fmt(cd.vol)}</td>
                      <td className="num">{fmtBRL(cd.rec)}</td>
                      <td className="num">{fmtBRL(cd.vol>0?cd.rec/cd.vol:0)}</td>
                    </tr>
                    {Object.entries(cd.sups).sort((a,b)=>b[1].vol-a[1].vol).map(([sup, sd]) => (
                      <tr key={sup}>
                        <td style={{ paddingLeft: 52, color: "var(--sub)" }}>{sup || "(sem supervisor)"}</td>
                        <td className="num">{fmt(sd.vol)}</td>
                        <td className="num">{fmtBRL(sd.rec)}</td>
                        <td className="num">{fmtBRL(sd.vol>0?sd.rec/sd.vol:0)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Aba: Supervisores (gestão de acesso) ---------- */
function AbaUsuarios({ cenario }) {
  const [lista, setLista] = useState(null);
  const [novoEmail, setNovoEmail] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoSup, setNovoSup] = useState("");
  const [msg, setMsg] = useState(null);

  const sups = cenario?.dims?.supervisores || [];

  useEffect(() => { listarAcessos().then(setLista); }, []);

  async function adicionar() {
    if (!novoEmail || !novoSup) return;
    await salvarAcesso(novoEmail, {
      nome: novoNome || novoEmail, papel: "supervisor",
      supervisor: novoSup, ativo: true,
    });
    setMsg(`Acesso liberado para ${novoEmail}.`);
    setNovoEmail(""); setNovoNome(""); setNovoSup("");
    listarAcessos().then(setLista);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Liberar acesso de supervisor</h2>
        <p style={{ color: "var(--sub)", fontSize: 13, marginTop: 4 }}>
          Crie a conta do supervisor no Firebase (Authentication) e vincule o e-mail dele
          ao supervisor correspondente. Ele verá apenas a projeção da equipe dele.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, marginTop: 8, alignItems: "end" }}>
          <div><label style={lbl}>E-mail</label>
            <input className="input" value={novoEmail} onChange={(e)=>setNovoEmail(e.target.value)} placeholder="supervisor@empresa.com" /></div>
          <div><label style={lbl}>Nome</label>
            <input className="input" value={novoNome} onChange={(e)=>setNovoNome(e.target.value)} /></div>
          <div><label style={lbl}>Supervisor (da base)</label>
            <select className="input" value={novoSup} onChange={(e)=>setNovoSup(e.target.value)}>
              <option value="">Selecione…</option>
              {sups.map((s)=><option key={s} value={s}>{s}</option>)}
            </select></div>
          <button className="btn" onClick={adicionar} disabled={!novoEmail || !novoSup}>
            <Plus size={16} style={{ verticalAlign: "-3px" }} /> Liberar
          </button>
        </div>
        {msg && <div style={aviso("ok")}><CheckCircle2 size={16} /> {msg}</div>}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Acessos cadastrados</h2>
        {!lista ? <p style={{ color: "var(--sub)" }}><span className="spin" /> Carregando…</p>
          : lista.length === 0 ? <p style={{ color: "var(--sub)" }}>Nenhum acesso cadastrado ainda.</p>
          : (
          <table>
            <thead><tr><th>E-mail</th><th>Nome</th><th>Papel</th><th>Supervisor</th><th>Ativo</th></tr></thead>
            <tbody>
              {lista.map((a)=>(
                <tr key={a.email}>
                  <td>{a.email}</td><td>{a.nome}</td>
                  <td><span className="tag">{a.papel}</span></td>
                  <td>{a.supervisor || "—"}</td>
                  <td>{a.ativo === false ? "Não" : "Sim"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function SemCenario() {
  return <div className="card" style={{ textAlign: "center", color: "var(--sub)" }}>
    <FileSpreadsheet size={28} style={{ opacity: .5 }} />
    <p>Nenhum cenário ativo. Importe a base na aba "Base do cenário".</p>
  </div>;
}
function Stat({ label, v, big }) {
  return <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
    <div style={{ fontSize: 11, color: "var(--sub)", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: big ? 22 : 18, fontWeight: 700, marginTop: 3 }}>{v}</div>
  </div>;
}
const FL = { "STA TEREZA":"Sta Tereza","CURITIBA":"Curitiba","CUIABÁ":"Cuiabá" };
function filLabel(f){ return FL[f] || f; }
const fmt = (n)=>(n||0).toLocaleString("pt-BR",{maximumFractionDigits:0});
const fmtBRL = (n)=>(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
const lbl = { display:"block", fontSize:12, fontWeight:600, color:"var(--sub)", marginBottom:5, marginTop:12 };
const grid = { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10 };
const aviso = (tipo)=>({ marginTop:12, padding:"9px 13px", borderRadius:8, display:"flex", gap:8, alignItems:"center", fontSize:13,
  background: tipo==="bad"?"#fdecea":"#eafaf1", color: tipo==="bad"?"var(--bad)":"var(--ok)" });
