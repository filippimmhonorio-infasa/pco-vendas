import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANTE: 'base' precisa bater com o nome do repositório no GitHub Pages.
// Ex.: repositório "pco-vendas" -> https://usuario.github.io/pco-vendas/
// Ajuste a string abaixo para o nome exato do seu repositório.
export default defineConfig({
  plugins: [react()],
  base: "/pco-vendas/",
});
