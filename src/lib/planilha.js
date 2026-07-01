// src/lib/planilha.js — lê o Excel da base histórica e monta a estrutura do cenário
import * as XLSX from "xlsx";

// Mapeamento de filial (código -> nome de exibição)
const FILIAL_LABEL = {
  "010101": "STA TEREZA",
  "020105": "CURITIBA",
  "020101": "CUIABÁ",
};
// Canais aceitos no PCO
const CANAIS_OK = ["INDUSTRIA", "ATACAREJO", "VAREJO", "FARELO"];

// Nomes esperados de coluna (aceita algumas variações comuns)
const COLS = {
  filial: ["filial", "Filial"],
  canal: ["canal", "Canal"],
  produto: ["produto", "Produto", "Código do Produto - Descrição", "cod_produto"],
  cliente: ["cliente", "Cliente", "Código do Cliente - Nome Cliente", "cod_cliente"],
  supervisor: ["supervisor", "Supervisor", "codsuper", "nomesuper"],
  vol: ["vol", "Volume Faturado (Tons)", "peso", "volume"],
  pm: ["pm", "Preço Médio por Tonelada", "prcunit", "preco_medio"],
  mes: ["mes", "Mês Ano", "Mes Ano", "mes_ano"],
};

// acha o nome real da coluna no cabeçalho da planilha
function achaCol(headers, candidatos) {
  const norm = (s) => String(s).trim().toLowerCase();
  for (const c of candidatos) {
    const hit = headers.find((h) => norm(h) === norm(c));
    if (hit) return hit;
  }
  return null;
}

function nomeProduto(p) {
  let s = String(p);
  if (s.includes(" - ")) s = s.split(" - ").slice(1).join(" - ");
  return s.trim();
}
function codProduto(p) {
  const s = String(p);
  return s.includes(" - ") ? s.split(" - ")[0].trim() : s.trim();
}
function nomeCliente(c) {
  let s = String(c);
  if (s.includes(" - ")) s = s.split(" - ").slice(1).join(" - ");
  return s.trim().slice(0, 60);
}
function codCliente(c) {
  const s = String(c);
  return s.includes(" - ") ? s.split(" - ")[0].trim() : s.trim();
}
function filialLabel(f) {
  return FILIAL_LABEL[String(f).trim()] || String(f).trim();
}

/**
 * Lê um ArrayBuffer de Excel e devolve { dims, estrutura, histfc, resumo }.
 * A estrutura é a mesma que o protótipo usa:
 *   estrutura["FILIAL|CANAL|SUP"] = { prods: { cod: { nome, vb, pm, cli:[{n,s,pm,cod,loja}] } } }
 * onde vb = volume médio mensal, s = share do cliente.
 */
export function processarPlanilha(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!linhas.length) throw new Error("A planilha está vazia.");

  const headers = Object.keys(linhas[0]);
  const col = {};
  for (const k of Object.keys(COLS)) {
    col[k] = achaCol(headers, COLS[k]);
    if (!col[k] && k !== "supervisor") {
      throw new Error(
        `Não encontrei a coluna de "${k}" na planilha. ` +
        `Cabeçalhos lidos: ${headers.join(", ")}`
      );
    }
  }
  // supervisor: aceita separado cod/nome ou uma coluna única
  const colSupCod = achaCol(headers, ["codsuper", "cod_supervisor"]);
  const colSupNome = achaCol(headers, ["nomesuper", "Supervisor", "supervisor"]);

  // detecta quantos meses distintos existem (para a média)
  const mesesSet = new Set();

  // agrega por combo -> produto -> cliente
  const acc = {}; // combo -> prodCod -> { nome, cli: {cliCod -> {nome,loja,volSum,recSum}}, volSum, recSum }
  const histfc = {}; // "FILIAL|CANAL" -> { mes: vol }
  let descartadas = 0;

  for (const row of linhas) {
    const filRaw = row[col.filial];
    const canRaw = row[col.canal];
    if (filRaw == null || canRaw == null) { descartadas++; continue; }
    if (String(filRaw).trim().toLowerCase() === "total") { descartadas++; continue; }

    const canal = String(canRaw).trim().toUpperCase();
    if (!CANAIS_OK.includes(canal)) { descartadas++; continue; }

    const filial = filialLabel(filRaw);
    const sup = colSupNome ? String(row[colSupNome] ?? "").trim() : "";
    const supCod = colSupCod ? String(row[colSupCod] ?? "").trim() : sup;
    const prodCod = codProduto(row[col.produto]);
    const prodNome = nomeProduto(row[col.produto]);
    const cliCod = codCliente(row[col.cliente]);
    const cliNome = nomeCliente(row[col.cliente]);

    let vol = Number(row[col.vol]) || 0;
    if (vol < 0) vol = 0; // devolução -> 0
    const pm = Number(row[col.pm]) || 0;
    const rec = vol * pm;

    if (row[col.mes] != null) mesesSet.add(String(row[col.mes]).trim());

    const comboKey = `${filial}|${canal}|${sup}`;
    acc[comboKey] = acc[comboKey] || { supCod, prods: {} };
    const P = acc[comboKey].prods;
    P[prodCod] = P[prodCod] || { nome: prodNome, volSum: 0, recSum: 0, cli: {} };
    P[prodCod].volSum += vol;
    P[prodCod].recSum += rec;

    const ck = `${cliCod}|01`;
    P[prodCod].cli[ck] = P[prodCod].cli[ck] ||
      { cod: cliCod, loja: "01", n: cliNome, volSum: 0, recSum: 0 };
    P[prodCod].cli[ck].volSum += vol;
    P[prodCod].cli[ck].recSum += rec;

    // histórico por filial|canal|mes
    if (row[col.mes] != null) {
      const hk = `${filial}|${canal}`;
      const m = String(row[col.mes]).trim();
      histfc[hk] = histfc[hk] || {};
      histfc[hk][m] = (histfc[hk][m] || 0) + vol;
    }
  }

  const nMeses = Math.max(1, mesesSet.size);

  // monta estrutura final com médias e shares
  const estrutura = {};
  const dimsFil = new Set(), dimsCan = new Set(), dimsSup = new Set();
  const dimProdutos = {}, dimClientes = {};

  for (const [comboKey, cData] of Object.entries(acc)) {
    const [filial, canal, sup] = comboKey.split("|");
    const prods = {};
    for (const [pc, pd] of Object.entries(cData.prods)) {
      const vbMes = pd.volSum / nMeses;
      if (vbMes <= 0) continue;
      const pmProd = pd.volSum > 0 ? pd.recSum / pd.volSum : 0;
      const cli = Object.values(pd.cli)
        .filter((c) => c.volSum > 0)
        .map((c) => ({
          cod: c.cod,
          loja: c.loja,
          n: c.n,
          s: pd.volSum > 0 ? c.volSum / pd.volSum : 0,
          pm: c.volSum > 0 ? c.recSum / c.volSum : pmProd,
        }))
        .sort((a, b) => b.s - a.s);
      if (!cli.length) continue;
      prods[pc] = { nome: pd.nome, vb: vbMes, pm: pmProd, cli };
      dimProdutos[pc] = pd.nome;
      cli.forEach((c) => { dimClientes[`${c.cod}|${c.loja}`] = c.n; });
    }
    if (Object.keys(prods).length) {
      estrutura[comboKey] = { prods, supCod: cData.supCod };
      dimsFil.add(filial); dimsCan.add(canal); dimsSup.add(sup);
    }
  }

  const dims = {
    filiais: [...dimsFil].sort(),
    canais: [...dimsCan].sort(),
    supervisores: [...dimsSup].sort(),
  };

  const totVol = Object.values(estrutura)
    .reduce((a, c) => a + Object.values(c.prods).reduce((b, p) => b + p.vb, 0), 0);
  const nClientes = Object.keys(dimClientes).length;
  const nProdutos = Object.keys(dimProdutos).length;

  const resumo = {
    linhasLidas: linhas.length,
    descartadas,
    nMeses,
    combos: Object.keys(estrutura).length,
    filiais: dims.filiais.length,
    canais: dims.canais.length,
    supervisores: dims.supervisores.length,
    produtos: nProdutos,
    clientes: nClientes,
    volMedMensal: totVol,
  };

  return { dims, estrutura, histfc, resumo };
}
