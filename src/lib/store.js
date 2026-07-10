// src/lib/store.js — leitura/escrita no Firestore (espelha o schema Postgres)
import { db } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  writeBatch, query, where,
} from "firebase/firestore";

// Modelo de dados no Firestore (um cenário ativo por vez nesta fase):
//   cenarios/{cenarioId}                         -> metadados do cenário
//   cenarios/{cenarioId}/base/{comboKey}         -> estrutura histórica do combo
//   cenarios/{cenarioId}/projecao/{linhaId}      -> projeção produto×mês
//   cenarios/{cenarioId}/overrides/{ovId}        -> overrides por cliente
//   acesso/{email}                               -> papel + supervisor (SA3)
//   config/ativo                                 -> aponta o cenário ativo

const CFG = doc(db, "config", "ativo");

// ---- cenário ativo ----
export async function getCenarioAtivo() {
  const s = await getDoc(CFG);
  if (!s.exists()) return null;
  const { cenarioId } = s.data();
  if (!cenarioId) return null;
  const c = await getDoc(doc(db, "cenarios", cenarioId));
  return c.exists() ? { id: c.id, ...c.data() } : null;
}

export async function setCenarioAtivo(cenarioId) {
  await setDoc(CFG, { cenarioId });
}

// lista todos os cenários (para o seletor e arquivados)
export async function listarCenarios() {
  const qs = await getDocs(collection(db, "cenarios"));
  const cfg = await getDoc(CFG);
  const ativo = cfg.exists() ? cfg.data().cenarioId : null;
  return qs.docs
    .map((d) => ({ id: d.id, ...d.data(), ativo: d.id === ativo }))
    .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
}

export async function criarCenario(cenarioId, meta) {
  await setDoc(doc(db, "cenarios", cenarioId), {
    ...meta, criadoEm: Date.now(),
  });
  await setCenarioAtivo(cenarioId);
}

// ---- acesso ----
export async function getAcesso(email) {
  const s = await getDoc(doc(db, "acesso", email.toLowerCase()));
  return s.exists() ? s.data() : null;
}
export async function listarAcessos() {
  const qs = await getDocs(collection(db, "acesso"));
  return qs.docs.map((d) => ({ email: d.id, ...d.data() }));
}
export async function salvarAcesso(email, dados) {
  await setDoc(doc(db, "acesso", email.toLowerCase()), dados, { merge: true });
}

// ---- gravar a base processada da planilha (admin) ----
// Grava a estrutura por combo, em lotes (limite de 500 escritas por batch).
export async function gravarBase(cenarioId, dims, estrutura, histfc, onProgress) {
  const combos = Object.entries(estrutura);
  let feitos = 0;
  // grava dims + histfc no doc do cenário
  await setDoc(doc(db, "cenarios", cenarioId), { dims, histfc }, { merge: true });
  // cada combo é um documento (contém seus produtos e clientes)
  for (let i = 0; i < combos.length; i += 400) {
    const batch = writeBatch(db);
    for (const [comboKey, cData] of combos.slice(i, i + 400)) {
      const ref = doc(db, "cenarios", cenarioId, "base", encId(comboKey));
      batch.set(ref, { comboKey, ...cData });
    }
    await batch.commit();
    feitos = Math.min(combos.length, i + 400);
    onProgress?.(feitos, combos.length);
  }
  return feitos;
}

// lê toda a base do cenário (para admin) ou de um supervisor específico
export async function lerBase(cenarioId, supNome) {
  const col = collection(db, "cenarios", cenarioId, "base");
  const qs = supNome
    ? await getDocs(query(col, where("comboKeySup", "==", supNome)))
    : await getDocs(col);
  const estrutura = {};
  qs.forEach((d) => { const x = d.data(); estrutura[x.comboKey] = x; });
  return estrutura;
}

// ---- projeção (produto×mês) ----
export async function lerProjecao(cenarioId, supNome) {
  const col = collection(db, "cenarios", cenarioId, "projecao");
  const qs = supNome
    ? await getDocs(query(col, where("sup", "==", supNome)))
    : await getDocs(col);
  const out = {};
  qs.forEach((d) => { out[d.id] = d.data(); });
  return out;
}

// salva a projeção de um combo inteiro (várias linhas produto×mês) em lote
export async function salvarProjecao(cenarioId, linhas, quemEmail) {
  for (let i = 0; i < linhas.length; i += 400) {
    const batch = writeBatch(db);
    for (const l of linhas.slice(i, i + 400)) {
      const id = `${enc(l.filial)}__${enc(l.canal)}__${enc(l.sup)}__${enc(l.produto)}__${l.mes}`;
      batch.set(doc(db, "cenarios", cenarioId, "projecao", id), {
        ...l, atualizadoPor: quemEmail, atualizadoEm: Date.now(),
      });
    }
    await batch.commit();
  }
}

// ---- overrides por cliente ----
export async function lerOverrides(cenarioId, supNome) {
  const col = collection(db, "cenarios", cenarioId, "overrides");
  const qs = supNome
    ? await getDocs(query(col, where("sup", "==", supNome)))
    : await getDocs(col);
  const out = {};
  qs.forEach((d) => { out[d.id] = d.data(); });
  return out;
}

export async function salvarOverride(cenarioId, ov, quemEmail) {
  const id = `${enc(ov.filial)}__${enc(ov.canal)}__${enc(ov.sup)}__${enc(ov.produto)}__${enc(ov.cliente)}__${ov.mes}`;
  const ref = doc(db, "cenarios", cenarioId, "overrides", id);
  if (ov.volFixo == null && ov.pmOverride == null) {
    await deleteDoc(ref); // sem override -> volta ao rateio
  } else {
    await setDoc(ref, { ...ov, atualizadoPor: quemEmail, atualizadoEm: Date.now() });
  }
}

// ---- helpers de id (Firestore não aceita / nem espaços em ids) ----
function enc(s) { return String(s ?? "").replace(/[/\\.#$[\]\s]+/g, "_"); }
function encId(s) { return enc(s); }

// ---- projeção POR CLIENTE (nível cliente+vendedor) ----
// doc id inclui vendedor. campos: vol{Jul..Dez}, preco{Jul..Dez}
export async function lerProjecaoCliente(cenarioId, supNome) {
  const col = collection(db, "cenarios", cenarioId, "projcli");
  const qs = supNome
    ? await getDocs(query(col, where("sup", "==", supNome)))
    : await getDocs(col);
  const out = {};
  qs.forEach((d) => { out[d.id] = d.data(); });
  return out;
}

// salva várias linhas de projeção por cliente em lote
export async function salvarProjecaoCliente(cenarioId, itens, quemEmail, onProgress) {
  let feitos = 0;
  for (let i = 0; i < itens.length; i += 400) {
    const batch = writeBatch(db);
    for (const it of itens.slice(i, i + 400)) {
      const id = [it.filial, it.canal, it.sup, it.produto, it.cliente, it.loja || "01", it.vend]
        .map((s) => String(s ?? "").replace(/[/\\.#$[\]\s]+/g, "_")).join("__");
      batch.set(doc(db, "cenarios", cenarioId, "projcli", id), {
        filial: it.filial, canal: it.canal, sup: it.sup, vend: it.vend,
        produto: it.produto, cliente: it.cliente, loja: it.loja || "01",
        vol: it.vol || {}, preco: it.preco || {},
        atualizadoPor: quemEmail, atualizadoEm: Date.now(),
      }, { merge: true });
    }
    await batch.commit();
    feitos = Math.min(itens.length, i + 400);
    onProgress?.(feitos, itens.length);
  }
  return feitos;
}

// ---- REALIZADO (importado por planilha; substitui tudo a cada carga) ----
// doc por chave; guarda mesesVol{} e mesesRec{}. Campo 'sup' para filtro por supervisor.
export async function lerRealizado(cenarioId, supNome) {
  const col = collection(db, "cenarios", cenarioId, "realizado");
  const qs = supNome
    ? await getDocs(query(col, where("sup", "==", supNome)))
    : await getDocs(col);
  const out = [];
  qs.forEach((d) => out.push(d.data()));
  return out;
}

// apaga todo o realizado do cenário (para substituir)
async function limparRealizado(cenarioId, onProgress) {
  const col = collection(db, "cenarios", cenarioId, "realizado");
  const qs = await getDocs(col);
  const docs = qs.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    onProgress?.(Math.min(docs.length, i + 400), docs.length);
  }
  return docs.length;
}

// grava o realizado (substitui: limpa antes, depois insere)
export async function gravarRealizado(cenarioId, itens, meta, onProgress) {
  await limparRealizado(cenarioId, (f, t) => onProgress?.("limpando", f, t));
  for (let i = 0; i < itens.length; i += 400) {
    const batch = writeBatch(db);
    for (const it of itens.slice(i, i + 400)) {
      const id = [it.filial, it.canal, it.sup, it.vend, it.produto, it.cliente, it.loja || "01"]
        .map((s) => String(s ?? "").replace(/[/\\.#$[\]\s]+/g, "_")).join("__");
      batch.set(doc(db, "cenarios", cenarioId, "realizado", id), {
        filial: it.filial, canal: it.canal, sup: it.sup, vend: it.vend,
        produto: it.produto, cliente: it.cliente, loja: it.loja || "01",
        mesesVol: it.mesesVol || {}, mesesRec: it.mesesRec || {},
      });
    }
    await batch.commit();
    onProgress?.("gravando", Math.min(itens.length, i + 400), itens.length);
  }
  // guarda metadados (meses disponíveis) no doc do cenário
  await setDoc(doc(db, "cenarios", cenarioId), { realizadoMeta: meta }, { merge: true });
  return itens.length;
}
