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
