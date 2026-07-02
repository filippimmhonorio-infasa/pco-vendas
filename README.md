# PCO de Vendas — App (React + Firebase)

App para os supervisores projetarem volume e preço de Jul–Dez.
Base histórica vem de planilha (Excel); dados ficam no Firestore.

## O que já está pronto
- Login por e-mail/senha (Firebase Auth).
- Tela de admin: importar planilha, ver consolidação, liberar supervisores.
- Tela de supervisor: projetar por produto, ratear por cliente, fixar e ajustar preço.
- Já configurado com as chaves do seu projeto Firebase `pco-vendas`.

---

## PASSO 1 — Rodar no seu computador (teste local)
Precisa ter o Node.js instalado (o mesmo que você usa no dia a dia de dev).

```bash
npm install
npm run dev
```
Abra o endereço que aparecer (algo como http://localhost:5173/pco-vendas/).

## PASSO 2 — Aplicar as regras de segurança do Firestore
No console do Firebase → Firestore → aba **Regras**, apague o conteúdo e
cole o conteúdo do arquivo `firestore.rules` deste projeto. Clique em **Publicar**.
Isso libera o acesso só para usuários logados e autorizados.

## PASSO 3 — Criar seu usuário admin
1. No console do Firebase → **Authentication** → aba **Users** → **Adicionar usuário**.
   Crie com seu e-mail e uma senha.
2. Ainda não há tela para isso, então crie seu acesso de admin manualmente:
   Firebase → **Firestore** → **Iniciar coleção** com o nome `acesso`.
   - ID do documento: seu e-mail (ex.: `filippi@empresa.com`)
   - Campos:
     - `nome` (string): seu nome
     - `papel` (string): `admin`
     - `ativo` (boolean): `true`
3. Pronto: ao logar no app com esse e-mail, você entra como admin.

## PASSO 4 — Importar a base e liberar supervisores
1. Faça login no app (local ou publicado) → aba **Base do cenário** →
   escolha a planilha .xlsx → confira o resumo → **Gravar base**.
2. Aba **Supervisores**: para cada supervisor,
   crie o usuário no Firebase Authentication (e-mail + senha) e depois,
   no app, vincule o e-mail dele ao supervisor da base.

## PASSO 5 — Publicar no GitHub Pages
1. Crie um repositório no GitHub (ex.: `pco-vendas`).
2. Confira que em `vite.config.js` o campo `base` está igual ao nome do repo
   (hoje está `"/pco-vendas/"`).
3. Suba o código e rode:
```bash
npm run deploy
```
   Isso gera a versão de produção e publica na branch `gh-pages`.
4. No GitHub → Settings → Pages → confirme que está servindo a branch `gh-pages`.
5. Acesse `https://SEU-USUARIO.github.io/pco-vendas/`.

## Formato da planilha
Colunas aceitas (nomes flexíveis): filial, canal, produto, cliente,
supervisor, volume, preço médio, mês. Filial é mapeada:
010101→Sta Tereza, 020105→Curitiba, 020101→Cuiabá.
Canais considerados: Indústria, Atacarejo, Varejo, Farelo.

## Futuro: migrar para o PostgreSQL
A estrutura do Firestore espelha o schema `pco` do DW. Quando o banco
liberar, trocamos a fonte (`src/lib/store.js`) por chamadas à API, sem
mexer nas telas.

---

## Novidades desta versão (v2)
- Dimensão VENDEDOR (abaixo do supervisor). Cada cliente traz seu vendedor.
- Projeção no nível produto × cliente × vendedor × mês, pré-preenchida com a
  média histórica de cada cliente.
- Exportar/Importar Excel na tela do supervisor:
  - "Exportar Excel": baixa a projeção atual (1 linha por produto×cliente×vendedor,
    colunas Vol Jul..Dez e Preço Jul..Dez).
  - Edite no Excel e use "Importar Excel" para atualizar. A importação valida que
    as linhas pertencem ao supervisor logado (segurança).
- Barra de totais no topo da tela do supervisor (volume, receita, preço médio).

## Formato da base (atualizado)
Agora inclui a coluna **Vendedor**. Colunas: Filial, Canal, Supervisor, Vendedor,
Produto, Cliente, Volume, Preço médio, Mês. Canais considerados nesta base:
Indústria, Atacarejo, Varejo (ajustável em src/lib/planilha.js).

---

## Novidades v3 (tela do supervisor)
- Abas: "Projeção" e "Resumo por vendedor".
- Filtros na tela: menu de vendedor + busca de cliente (além da busca de produto).
- Botão "replicar" por cliente: copia o volume de Julho para Ago–Dez.
- Resumo por vendedor: volume, receita, preço médio e nº de clientes de cada
  vendedor; atualiza conforme você edita, com aviso de "alterações não salvas".
- Botão "Ver" no resumo leva direto à projeção já filtrada por aquele vendedor.
- Correção: a tela agora mostra mensagem de erro em vez de travar no carregamento.

> Lembrete: se aparecer erro de permissão do Firestore, confirme que as Regras
> incluem a coleção `projcli` (ver firestore.rules).
