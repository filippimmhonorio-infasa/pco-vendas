// src/lib/comparativo.js — cruza orçado (projcli) com realizado, por chave de mês (AAAA-MM)

/**
 * @param projcli    [{...chaves, vol:{mesKey..}, preco:{mesKey..}}]
 * @param realizado  [{...chaves, mesesVol:{mesKey..}, mesesRec:{mesKey..}}]
 * @param mesKeys    chaves de mês a comparar (interseção período × realizado), ex ["2026-08","2026-09"]
 * @param nivel      'filial'|'canal'|'supervisor'|'vendedor'|'produto'
 */
export function montarComparativo(projcli, realizado, mesKeys, nivel) {
  const chaveDe = (r) => {
    switch (nivel) {
      case "filial": return r.filial;
      case "canal": return `${r.filial}|${r.canal}`;
      case "supervisor": return `${r.filial}|${r.canal}|${r.sup}`;
      case "vendedor": return r.vend || "(sem vendedor)";
      case "produto": return r.produto;
      default: return r.filial;
    }
  };
  const acc = {};
  const get = (k) => (acc[k] || (acc[k] = { chave: k, volOrc: 0, volReal: 0, recOrc: 0, recReal: 0 }));

  for (const p of projcli) {
    const a = get(chaveDe(p));
    for (const mk of mesKeys) {
      const v = p.vol?.[mk] ?? 0;
      const pr = p.preco?.[mk] ?? 0;
      a.volOrc += v; a.recOrc += v * pr;
    }
  }
  for (const r of realizado) {
    const a = get(chaveDe(r));
    for (const mk of mesKeys) {
      a.volReal += r.mesesVol?.[mk] ?? 0;
      a.recReal += r.mesesRec?.[mk] ?? 0;
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

  return { linhas, totais };
}

const FL = { "STA TEREZA": "Sta Tereza", "CURITIBA": "Curitiba", "CUIABÁ": "Cuiabá" };
function rotulo(chave, nivel) {
  if (nivel === "filial") return FL[chave] || chave;
  if (nivel === "canal") { const [f, c] = chave.split("|"); return `${FL[f] || f} · ${c}`; }
  if (nivel === "supervisor") { const [f, c, s] = chave.split("|"); return s; }
  return chave;
}
