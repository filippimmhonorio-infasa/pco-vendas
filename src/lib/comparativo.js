// src/lib/comparativo.js — cruza orçado (projcli) com realizado, acumulado até o mês
import { MESES } from "./rateio.js";

// número do mês -> nome curto
const NUM_MES = { 7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez" };

/**
 * Monta o comparativo Orçado × Realizado.
 * @param projcli   docs de projeção por cliente: [{filial,canal,sup,vend,produto,cliente,loja, vol:{Jul..}, preco:{Jul..}}]
 * @param realizado docs de realizado: [{...mesmasChaves, mesesVol:{7..}, mesesRec:{7..}}]
 * @param mesesRealizados  array de números de mês que têm realizado (ex: [7,8])
 * @param nivel     'filial' | 'canal' | 'supervisor' | 'vendedor' | 'produto'
 * @returns { linhas:[{chave, label, volOrc, volReal, recOrc, recReal, difVol, atingVol, ...}], totais:{} }
 *
 * Regra "acumulado até o mês": só somam os meses presentes em mesesRealizados,
 * tanto no orçado quanto no realizado, para comparar períodos equivalentes.
 */
export function montarComparativo(projcli, realizado, mesesRealizados, nivel) {
  const mesesNomes = mesesRealizados.map((n) => NUM_MES[n]).filter(Boolean);

  const chaveDe = (r, isReal) => {
    const filial = r.filial, canal = r.canal;
    const sup = r.sup, vend = r.vend, produto = r.produto;
    switch (nivel) {
      case "filial": return filial;
      case "canal": return `${filial}|${canal}`;
      case "supervisor": return `${filial}|${canal}|${sup}`;
      case "vendedor": return vend || "(sem vendedor)";
      case "produto": return produto;
      default: return filial;
    }
  };

  const acc = {};
  const get = (k) => (acc[k] || (acc[k] = { chave: k, volOrc: 0, volReal: 0, recOrc: 0, recReal: 0 }));

  // orçado: soma apenas os meses realizados (nomes)
  for (const p of projcli) {
    const k = chaveDe(p, false);
    const a = get(k);
    for (const mn of mesesNomes) {
      const v = p.vol?.[mn] ?? 0;
      const pr = p.preco?.[mn] ?? 0;
      a.volOrc += v; a.recOrc += v * pr;
    }
  }
  // realizado: soma apenas os meses realizados (números)
  for (const r of realizado) {
    const k = chaveDe(r, true);
    const a = get(k);
    for (const mnum of mesesRealizados) {
      a.volReal += r.mesesVol?.[mnum] ?? 0;
      a.recReal += r.mesesRec?.[mnum] ?? 0;
    }
  }

  const linhas = Object.values(acc).map((a) => ({
    ...a,
    label: rotulo(a.chave, nivel),
    difVol: a.volReal - a.volOrc,
    difRec: a.recReal - a.recOrc,
    atingVol: a.volOrc > 0 ? a.volReal / a.volOrc : null,
    atingRec: a.recOrc > 0 ? a.recReal / a.recOrc : null,
    pmOrc: a.volOrc > 0 ? a.recOrc / a.volOrc : 0,
    pmReal: a.volReal > 0 ? a.recReal / a.volReal : 0,
  })).sort((x, y) => y.volOrc - x.volOrc);

  const totais = linhas.reduce((t, l) => ({
    volOrc: t.volOrc + l.volOrc, volReal: t.volReal + l.volReal,
    recOrc: t.recOrc + l.recOrc, recReal: t.recReal + l.recReal,
  }), { volOrc: 0, volReal: 0, recOrc: 0, recReal: 0 });
  totais.difVol = totais.volReal - totais.volOrc;
  totais.difRec = totais.recReal - totais.recOrc;
  totais.atingVol = totais.volOrc > 0 ? totais.volReal / totais.volOrc : null;
  totais.atingRec = totais.recOrc > 0 ? totais.recReal / totais.recOrc : null;

  return { linhas, totais, mesesNomes };
}

const FL = { "STA TEREZA": "Sta Tereza", "CURITIBA": "Curitiba", "CUIABÁ": "Cuiabá" };
function rotulo(chave, nivel) {
  if (nivel === "filial") return FL[chave] || chave;
  if (nivel === "canal") { const [f, c] = chave.split("|"); return `${FL[f] || f} · ${c}`; }
  if (nivel === "supervisor") { const [f, c, s] = chave.split("|"); return s; }
  return chave;
}
