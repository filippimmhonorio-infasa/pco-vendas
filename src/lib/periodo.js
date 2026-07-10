// src/lib/periodo.js — período configurável do cenário (cruza anos)
// Um "mês do período" é identificado por uma chave estável "AAAA-MM"
// e tem um rótulo curto "Ago/26". Isso substitui o antigo MESES fixo.

const NOMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Gera a lista de meses entre (anoIni,mesIni) e (anoFim,mesFim), inclusive.
 * @returns [{ key:"2026-08", num:8, ano:2026, nome:"Ago", label:"Ago/26" }, ...]
 */
export function gerarMeses(mesIni, anoIni, mesFim, anoFim) {
  const out = [];
  let y = Number(anoIni), m = Number(mesIni);
  const yF = Number(anoFim), mF = Number(mesFim);
  // proteção contra loop infinito / intervalo inválido
  if (y > yF || (y === yF && m > mF)) return out;
  let guard = 0;
  while ((y < yF || (y === yF && m <= mF)) && guard < 240) {
    out.push(mesObj(y, m));
    m++; if (m > 12) { m = 1; y++; }
    guard++;
  }
  return out;
}

function mesObj(ano, num) {
  const yy = String(ano).slice(-2);
  return {
    key: `${ano}-${String(num).padStart(2, "0")}`,
    num, ano, nome: NOMES[num - 1], label: `${NOMES[num - 1]}/${yy}`,
  };
}

// deriva a lista de meses a partir do objeto cenário (com fallback ao antigo Jul-Dez)
export function mesesDoCenario(cenario) {
  if (cenario?.mesIni && cenario?.anoIni && cenario?.mesFim && cenario?.anoFim) {
    return gerarMeses(cenario.mesIni, cenario.anoIni, cenario.mesFim, cenario.anoFim);
  }
  // compatibilidade com cenários antigos (Jul-Dez do ano do cenário)
  const ano = cenario?.ano || 2026;
  return gerarMeses(7, ano, 12, ano);
}

// converte "mmm aaaa" / "07/2026" / "2026-07" em chave "AAAA-MM"
export function mesKeyDeTexto(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  const M = { jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12 };
  // "ago 2026" / "ago/2026"
  const mNome = s.match(/([a-zç]{3})[a-zç]*[\s\/\-]+(\d{4})/i);
  if (mNome && M[mNome[1]]) return `${mNome[2]}-${String(M[mNome[1]]).padStart(2,"0")}`;
  // "08/2026"
  const mBarra = s.match(/(\d{1,2})[\/\-](\d{4})/);
  if (mBarra) return `${mBarra[2]}-${String(parseInt(mBarra[1],10)).padStart(2,"0")}`;
  // "2026-08"
  const mIso = s.match(/(\d{4})[\/\-](\d{1,2})/);
  if (mIso) return `${mIso[1]}-${String(parseInt(mIso[2],10)).padStart(2,"0")}`;
  return null;
}

export const NOMES_MES = NOMES;
