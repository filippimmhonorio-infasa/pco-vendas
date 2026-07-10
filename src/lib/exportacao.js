// src/lib/exportacao.js — exporta/importa a projeção do supervisor em Excel
// Layout LARGO: uma linha por produto×cliente×vendedor, com N colunas de volume
// e N de preço, conforme os meses do período do cenário.
import * as XLSX from "xlsx";

const COLS_CHAVE = [
  "Filial", "Canal", "Supervisor", "Vendedor",
  "Cód Produto", "Produto", "Cód Cliente", "Loja", "Cliente",
];

export function montarLinhas(estrutura, projCli = {}, meses = []) {
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
        for (const m of meses) {
          linha[`Vol ${m.label}`] = round(salvo?.vol?.[m.key] ?? c.vbCli, 3);
          linha[`Preço ${m.label}`] = round(salvo?.preco?.[m.key] ?? c.pm, 2);
        }
        linhas.push(linha);
      }
    }
  }
  return linhas;
}

export function exportarExcel(estrutura, projCli, meses, nomeArquivo = "projecao.xlsx") {
  const linhas = montarLinhas(estrutura, projCli, meses);
  const colsVol = meses.map((m) => `Vol ${m.label}`);
  const colsPrc = meses.map((m) => `Preço ${m.label}`);
  const ws = XLSX.utils.json_to_sheet(linhas, { header: [...COLS_CHAVE, ...colsVol, ...colsPrc] });
  ws["!cols"] = [
    { wch: 11 }, { wch: 11 }, { wch: 26 }, { wch: 26 },
    { wch: 14 }, { wch: 36 }, { wch: 13 }, { wch: 6 }, { wch: 30 },
    ...colsVol.map(() => ({ wch: 10 })), ...colsPrc.map(() => ({ wch: 11 })),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Projeção");
  XLSX.writeFile(wb, nomeArquivo);
}

export function importarExcel(arrayBuffer, supEsperado, meses = []) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { defval: null });
  const itens = [];
  const erros = [];

  if (linhas.length && meses.length) {
    const headers = Object.keys(linhas[0]);
    let achou = 0;
    for (const m of meses) if (headers.includes(`Vol ${m.label}`)) achou++;
    if (achou === 0) {
      erros.push(`A planilha não tem as colunas de volume do período (${meses.map(m=>m.label).join(", ")}). Verifique se é o arquivo exportado deste cenário.`);
      return { itens, erros, total: 0 };
    }
  }

  linhas.forEach((row, i) => {
    const filial = txt(row["Filial"]);
    const canal = txt(row["Canal"]);
    const sup = txt(row["Supervisor"]);
    const vend = txt(row["Vendedor"]);
    const produto = txt(row["Cód Produto"]);
    const cliente = txt(row["Cód Cliente"]);
    const loja = txt(row["Loja"]) || "01";
    if (!filial || !canal || !sup || !produto || !cliente) return;

    if (supEsperado && sup !== supEsperado) {
      erros.push(`Linha ${i + 2}: supervisor "${sup}" não confere com o seu (${supEsperado}).`);
      return;
    }

    const vol = {}, preco = {};
    let temAlgum = false;
    for (const m of meses) {
      const v = row[`Vol ${m.label}`];
      const p = row[`Preço ${m.label}`];
      if (v != null && v !== "") { vol[m.key] = num(v); temAlgum = true; }
      if (p != null && p !== "") { preco[m.key] = num(p); }
    }
    if (!temAlgum) return;
    itens.push({ filial, canal, sup, vend, produto, cliente, loja, vol, preco });
  });

  return { itens, erros, total: itens.length };
}

export function idCliente(filial, canal, sup, produto, cliente, loja, vend) {
  return [filial, canal, sup, produto, cliente, loja, vend].map(enc).join("__");
}

function enc(s) { return String(s ?? "").replace(/[/\\.#$[\]\s]+/g, "_"); }
function txt(v) { return v == null ? "" : String(v).trim(); }
function num(v) { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; }
function round(n, d) { const f = 10 ** d; return Math.round((n || 0) * f) / f; }
