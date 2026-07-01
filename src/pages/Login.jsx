import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase.js";
import { LogIn } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setErro(null); setCarregando(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
    } catch (e) {
      setErro(traduzErro(e.code));
    }
    setCarregando(false);
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 20,
      background: "linear-gradient(160deg, #062e4f 0%, #015f95 100%)",
    }}>
      <div className="card" style={{ width: 380, boxShadow: "0 12px 40px rgba(0,0,0,.25)" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: "var(--navy)" }}>PCO de Vendas</h1>
          <p style={{ margin: "4px 0 0", color: "var(--sub)", fontSize: 13 }}>
            AB AgroBrasil · projeção de volume e preço Jul–Dez
          </p>
        </div>

        <label style={lbl}>E-mail</label>
        <input className="input" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && entrar()}
          placeholder="voce@empresa.com.br" autoComplete="username" />

        <label style={{ ...lbl, marginTop: 12 }}>Senha</label>
        <input className="input" type="password" value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && entrar()}
          autoComplete="current-password" />

        {erro && (
          <div style={{
            marginTop: 12, padding: "8px 12px", borderRadius: 8,
            background: "#fdecea", color: "var(--bad)", fontSize: 13,
          }}>{erro}</div>
        )}

        <button className="btn" style={{ width: "100%", marginTop: 18 }}
          onClick={entrar} disabled={carregando || !email || !senha}>
          {carregando
            ? <span className="spin" />
            : <><LogIn size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} /> Entrar</>}
        </button>

        <p style={{ marginTop: 16, fontSize: 12, color: "var(--sub)", textAlign: "center" }}>
          Acesso liberado pelo administrador. Esqueceu a senha? Fale com o TI.
        </p>
      </div>
    </div>
  );
}

function traduzErro(code) {
  const m = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um momento e tente de novo.",
    "auth/user-disabled": "Este usuário está desativado.",
    "auth/network-request-failed": "Falha de conexão. Verifique a internet.",
  };
  return m[code] || "Não foi possível entrar. Tente novamente.";
}

const lbl = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 5 };
