import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./lib/firebase.js";
import { getAcesso } from "./lib/store.js";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import Supervisor from "./pages/Supervisor.jsx";
import { LogOut } from "lucide-react";

export default function App() {
  const [user, setUser] = useState(null);
  const [acesso, setAcesso] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroAcesso, setErroAcesso] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setCarregando(true);
      setErroAcesso(null);
      if (!u) { setUser(null); setAcesso(null); setCarregando(false); return; }
      setUser(u);
      try {
        const a = await getAcesso(u.email);
        if (!a || a.ativo === false) {
          setErroAcesso("Seu usuário ainda não tem acesso liberado ao PCO. Fale com o administrador.");
          setAcesso(null);
        } else {
          setAcesso(a);
        }
      } catch (e) {
        setErroAcesso("Não foi possível verificar seu acesso. Tente novamente.");
      }
      setCarregando(false);
    });
  }, []);

  if (carregando) {
    return (
      <div style={tela}>
        <span className="spin" /> <span style={{ marginLeft: 8 }}>Carregando…</span>
      </div>
    );
  }

  if (!user) return <Login />;

  if (erroAcesso) {
    return (
      <div style={tela}>
        <div className="card" style={{ maxWidth: 420, textAlign: "center" }}>
          <p style={{ color: "var(--sub)" }}>{erroAcesso}</p>
          <p style={{ fontSize: 13, color: "var(--sub)" }}>Conectado como {user.email}</p>
          <button className="btn btn-ghost" onClick={() => signOut(auth)}>
            <LogOut size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} /> Sair
          </button>
        </div>
      </div>
    );
  }

  const ehAdmin = acesso.papel === "admin" || acesso.papel === "gestor";

  return (
    <div style={{ minHeight: "100%" }}>
      <TopBar email={user.email} papel={acesso.papel} />
      {ehAdmin
        ? <Admin acesso={acesso} />
        : <Supervisor acesso={acesso} />}
    </div>
  );
}

function TopBar({ email, papel }) {
  return (
    <div style={{
      background: "var(--navy)", color: "#fff", padding: "12px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <strong style={{ fontSize: 16, letterSpacing: ".01em" }}>PCO de Vendas</strong>
        <span style={{ fontSize: 12, opacity: .8 }}>AB AgroBrasil</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13 }}>
        <span style={{ opacity: .9 }}>{email}</span>
        <span className="tag" style={{ background: "rgba(255,255,255,.15)", color: "#fff" }}>
          {papel}
        </span>
        <button
          onClick={() => signOut(auth)}
          className="btn"
          style={{ background: "rgba(255,255,255,.15)", padding: "6px 12px" }}
        >
          <LogOut size={14} style={{ verticalAlign: "-2px", marginRight: 5 }} /> Sair
        </button>
      </div>
    </div>
  );
}

const tela = {
  minHeight: "100vh", display: "flex", alignItems: "center",
  justifyContent: "center", padding: 20,
};
