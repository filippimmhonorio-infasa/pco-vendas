// src/lib/realizado.js — lê a planilha de REALIZADO e agrega por chave/mês
import * as XLSX from "xlsx";
import { mesKeyDeTexto } from "./periodo.js";

const FILIAL_LABEL = {
  "010101": "STA TEREZA", "020105": "CURITIBA", "020101": "CUIABÁ",
};
const FILIAIS_OK = ["STA TEREZA", "CURITIBA", "CUIABÁ"];
const CANAIS_OK = ["INDUSTRIA", "ATACAREJO", "VAREJO"];


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
    const mesKey = mesKeyDeTexto(row[col.mes]);
    if (!mesKey) { descartadas++; continue; }

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

    mesesSet.add(mesKey);
    const chave = `${filial}|${canal}|${sup}|${vend}|${produto}|${cliente}|${loja}`;
    const it = mapa[chave] || (mapa[chave] = {
      filial, canal, sup, vend, produto, cliente, loja, mesesVol: {}, mesesRec: {},
    });
    it.mesesVol[mesKey] = (it.mesesVol[mesKey] || 0) + vol;
    it.mesesRec[mesKey] = (it.mesesRec[mesKey] || 0) + rec;
  }

  const itens = Object.values(mapa);
  const meses = [...mesesSet].sort();
  const totVol = itens.reduce((a, it) => a + Object.values(it.mesesVol).reduce((x, y) => x + y, 0), 0);
  const totRec = itens.reduce((a, it) => a + Object.values(it.mesesRec).reduce((x, y) => x + y, 0), 0);

  const resumo = {
    linhasLidas: linhas.length, descartadas,
    itens: itens.length, meses,
    volTotal: totVol, recTotal: totRec, temVendedor: temVend,
  };
  return { itens, meses, resumo };
}
