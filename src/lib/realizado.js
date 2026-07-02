// src/lib/realizado.js — lê a planilha de REALIZADO e agrega por chave/mês
import * as XLSX from "xlsx";

const FILIAL_LABEL = {
  "010101": "STA TEREZA", "020105": "CURITIBA", "020101": "CUIABÁ",
};
const FILIAIS_OK = ["STA TEREZA", "CURITIBA", "CUIABÁ"];
const CANAIS_OK = ["INDUSTRIA", "ATACAREJO", "VAREJO"];

// mapeia "mmm aaaa" (pt) -> número do mês
const MES_PT = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const COLS = {
  filial: ["filial", "Filial"],
  canal: ["canal", "Canal"],
  produto: ["produto", "Produto", "Código do Produto - Descrição"],
  cliente: ["cliente", "Cliente", "Código do Cliente - Nome Cliente"],
  supervisor: ["supervisor", "Supervisor"],
  vendedor: ["vendedor", "Vendedor", "nomevend"],
  vol: ["vol", "Volume Faturado (Tons)", "peso", "volume"],
  fat: ["fat", "Fat. Bruto", "faturamento", "prctotal", "receita"],
  pm: ["pm", "Preço Médio por Tonelada", "prcunit", "preco_medio"],
  mes: ["mes", "Mês Ano", "Mes Ano", "mes_ano"],
};

function achaCol(headers, cand) {
  const norm = (s) => String(s).trim().toLowerCase();
  for (const c of cand) { const h = headers.find((x) => norm(x) === norm(c)); if (h) return h; }
  return null;
}
function codProduto(p) { const s = String(p); return s.includes(" - ") ? s.split(" - ")[0].trim() : s.trim(); }
function codCliente(c) { const s = String(c); return s.includes(" - ") ? s.split(" - ")[0].trim() : s.trim(); }
function filialLabel(f) { return FILIAL_LABEL[String(f).trim()] || String(f).trim(); }

function mesNum(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  // "jul 2026" | "jul/2026" | "07/2026" | "2026-07"
  const m3 = s.slice(0, 3);
  if (MES_PT[m3]) return MES_PT[m3];
  const mBarra = s.match(/(\d{1,2})[\/\-](\d{4})/);
  if (mBarra) return parseInt(mBarra[1], 10);
  const mIso = s.match(/(\d{4})[\/\-](\d{1,2})/);
  if (mIso) return parseInt(mIso[2], 10);
  return null;
}

/**
 * Processa a planilha de realizado.
 * Agrega por chave (filial|canal|sup|vend|produto|cliente|loja) e por mês.
 * @returns { itens: [{filial,canal,sup,vend,produto,cliente,loja, mesesVol:{7:..},
 *            mesesRec:{7:..}}], meses:[7,8..], resumo:{} }
 */
export function processarRealizado(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!linhas.length) throw new Error("A planilha de realizado está vazia.");

  const headers = Object.keys(linhas[0]);
  const col = {};
  for (const k of Object.keys(COLS)) col[k] = achaCol(headers, COLS[k]);
  for (const k of ["filial", "canal", "produto", "cliente", "supervisor", "vol", "mes"]) {
    if (!col[k]) throw new Error(`Não encontrei a coluna "${k}". Cabeçalhos: ${headers.join(", ")}`);
  }
  const temVend = !!col.vendedor;
  const temFat = !!col.fat;

  const mapa = {};   // chave -> { ...dims, mesesVol:{}, mesesRec:{} }
  const mesesSet = new Set();
  let descartadas = 0;

  for (const row of linhas) {
    const filial = filialLabel(row[col.filial]);
    if (!FILIAIS_OK.includes(filial)) { descartadas++; continue; }
    const canal = String(row[col.canal] ?? "").trim().toUpperCase();
    if (!CANAIS_OK.includes(canal)) { descartadas++; continue; }
    const mes = mesNum(row[col.mes]);
    if (!mes) { descartadas++; continue; }

    const sup = String(row[col.supervisor] ?? "").trim();
    const vend = temVend ? String(row[col.vendedor] ?? "").trim() : sup;
    const produto = codProduto(row[col.produto]);
    const cliente = codCliente(row[col.cliente]);
    const loja = "01";

    let vol = Number(row[col.vol]) || 0;
    if (vol < 0) vol = 0;
    let rec;
    if (temFat) rec = Number(row[col.fat]) || 0;
    else { const pm = Number(row[col.pm]) || 0; rec = vol * pm; }

    mesesSet.add(mes);
    const chave = `${filial}|${canal}|${sup}|${vend}|${produto}|${cliente}|${loja}`;
    const it = mapa[chave] || (mapa[chave] = {
      filial, canal, sup, vend, produto, cliente, loja, mesesVol: {}, mesesRec: {},
    });
    it.mesesVol[mes] = (it.mesesVol[mes] || 0) + vol;
    it.mesesRec[mes] = (it.mesesRec[mes] || 0) + rec;
  }

  const itens = Object.values(mapa);
  const meses = [...mesesSet].sort((a, b) => a - b);
  const totVol = itens.reduce((a, it) => a + Object.values(it.mesesVol).reduce((x, y) => x + y, 0), 0);
  const totRec = itens.reduce((a, it) => a + Object.values(it.mesesRec).reduce((x, y) => x + y, 0), 0);

  const resumo = {
    linhasLidas: linhas.length, descartadas,
    itens: itens.length, meses,
    volTotal: totVol, recTotal: totRec, temVendedor: temVend,
  };
  return { itens, meses, resumo };
}
