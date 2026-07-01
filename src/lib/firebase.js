// src/lib/firebase.js — conexão com o Firebase do projeto pco-vendas
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Chaves públicas do projeto Firebase (podem ficar no código;
// a segurança vem das Regras do Firestore + login, não de esconder isto).
const firebaseConfig = {
  apiKey: "AIzaSyCb00WLVDu_eY66VA-Yt-1_A2SGIGUnY9E",
  authDomain: "pco-vendas.firebaseapp.com",
  projectId: "pco-vendas",
  storageBucket: "pco-vendas.firebasestorage.app",
  messagingSenderId: "1037555317920",
  appId: "1:1037555317920:web:3142d5c6a9fe141c529dc5",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
