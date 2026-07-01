// src/lib/exportacao.js — exporta/importa a projeção do supervisor em Excel
// Layout LARGO: uma linha por produto×cliente×vendedor, com 6 colunas de volume
// (Jul..Dez) e 6 de preço. Pré-preenchido com a média histórica do cliente.
import * as XLSX from "xlsx";
import { MESES, MES_NUM } from "./rateio.js";

// Cabeçalhos fixos + dinâmicos (meses)
const COLS_CHAVE = [
  "Filial", "Canal", "Supervisor", "Vendedor",
  "Cód Produto", "Produto", "Cód Cliente", "Loja", "Cliente",
];
const COLS_VOL = MESES.map((m) => `Vol ${m}`);
const COLS_PRC = MESES.map((m) => `Preço ${m}`);

/**
 * Monta as linhas da planilha a partir da estrutura do supervisor + projeção salva.
 * @param estrutura  combos do supervisor (já filtrados) -> { prods: { pc: {nome, cli:[...] } } }
 * @param projCli    projeção por cliente já salva: mapa id -> { vol:{Jul..}, preco:{Jul..} } (opcional)
 */
export function montarLinhas(estrutura, projCli = {}) {
  const linhas = [];
  for (const [combo, cData] of Object.entries(estrutura)) {
    const [filial, canal, sup] = combo.split("|");
    for (const [pc, pd] of Object.entries(cData.prods)) {
      for (const c of pd.cli) {
        const id = idCliente(filial, canal, sup, pc, c.cod, c.loja, c.vend);
        const salvo = projCli[id];
        const linha = {
          Filial: filial, Canal: canal, Supervisor: sup, Vendedor: c.vend,
          "Cód Produto": pc, Produto: pd.nome,
          "Cód Cliente": c.cod, Loja: c.loja, Cliente: c.n,
        };
        for (const m of MESES) {
          // volume: salvo, senão a média histórica do cliente (vbCli)
          linha[`Vol ${m}`] = round(salvo?.vol?.[m] ?? c.vbCli, 3);
          // preço: salvo, senão o PM histórico do cliente
          linha[`Preço ${m}`] = round(salvo?.preco?.[m] ?? c.pm, 2);
        }
        linhas.push(linha);
      }
    }
  }
  return linhas;
}

/** Gera e baixa o arquivo .xlsx no navegador. */
export function exportarExcel(estrutura, projCli, nomeArquivo = "projecao.xlsx") {
  const linhas = montarLinhas(estrutura, projCli);
  const ws = XLSX.utils.json_to_sheet(linhas, {
    header: [...COLS_CHAVE, ...COLS_VOL, ...COLS_PRC],
  });
  // largura de colunas p/ leitura
  ws["!cols"] = [
    { wch: 11 }, { wch: 11 }, { wch: 26 }, { wch: 26 },
    { wch: 14 }, { wch: 36 }, { wch: 13 }, { wch: 6 }, { wch: 30 },
    ...COLS_VOL.map(() => ({ wch: 9 })),
    ...COLS_PRC.map(() => ({ wch: 10 })),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Projeção");
  XLSX.writeFile(wb, nomeArquivo);
}

/**
 * Lê um Excel reimportado e devolve as projeções por cliente.
 * Valida que as linhas pertencem ao supervisor informado (segurança).
 * @returns { itens: [{filial,canal,sup,produto,cliente,loja,vend, vol:{}, preco:{}}], erros:[] }
 */
export function importarExcel(arrayBuffer, supEsperado) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { defval: null });
  const itens = [];
  const erros = [];

  linhas.forEach((row, i) => {
    const filial = txt(row["Filial"]);
    const canal = txt(row["Canal"]);
    const sup = txt(row["Supervisor"]);
    const vend = txt(row["Vendedor"]);
    const produto = txt(row["Cód Produto"]);
    const cliente = txt(row["Cód Cliente"]);
    const loja = txt(row["Loja"]) || "01";
    if (!filial || !canal || !sup || !produto || !cliente) return; // linha vazia/rodapé

    // segurança: supervisor da linha precisa bater com o dono do arquivo
    if (supEsperado && sup !== supEsperado) {
      erros.push(`Linha ${i + 2}: supervisor "${sup}" não confere com o seu (${supEsperado}).`);
      return;
    }

    const vol = {}, preco = {};
    let temAlgum = false;
    for (const m of MESES) {
      const v = row[`Vol ${m}`];
      const p = row[`Preço ${m}`];
      if (v != null && v !== "") { vol[m] = num(v); temAlgum = true; }
      if (p != null && p !== "") { preco[m] = num(p); }
    }
    if (!temAlgum) return; // nada preenchido
    itens.push({ filial, canal, sup, vend, produto, cliente, loja, vol, preco });
  });

  return { itens, erros, total: itens.length };
}

// id determinístico do cliente (inclui vendedor, pois cliente+vendedor é a chave)
export function idCliente(filial, canal, sup, produto, cliente, loja, vend) {
  return [filial, canal, sup, produto, cliente, loja, vend].map(enc).join("__");
}

function enc(s) { return String(s ?? "").replace(/[/\\.#$[\]\s]+/g, "_"); }
function txt(v) { return v == null ? "" : String(v).trim(); }
function num(v) { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; }
function round(n, d) { const f = 10 ** d; return Math.round((n || 0) * f) / f; }
