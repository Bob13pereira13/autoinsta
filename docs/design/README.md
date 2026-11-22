# Visual do painel: "Tech com brilho" (escuro e claro)

Direção aprovada para o painel inteiro do ChatIntegrAI. Os desenhos de referência ficam em
`docs/design/mockups/` e também no canvas de design do produto:

| Arquivo | Tela |
|---|---|
| `mockups/Tech.dc.html` | Automações, tema escuro |
| `mockups/TechClaro.dc.html` | Automações, tema claro |
| `mockups/Editor.dc.html` | Editor da automação de Comentários (4 etapas, resumo e prévia) |
| `mockups/Contas.dc.html` | Contas do Instagram (chave, lixeira, reconectar, confirmação) |

Os `.dc.html` são protótipos de um editor de design (rodam com um `support.js` que não está no
repositório). Use-os como **referência visual e de comportamento**: os estilos inline e o
`renderVals()` mostram cores, tamanhos, estados e textos. Não copie o formato para o app.

O visual muda; o comportamento, as rotas, as APIs e os textos (salvo onde dito aqui) não mudam.

## Temas

- Dois temas: **escuro** e **claro**. Padrão: segue o sistema (`prefers-color-scheme`).
- Botão "Tema claro" / "Tema escuro" no fim do menu lateral (e no cabeçalho da área de gestão).
  A escolha fica num cookie (mesmo padrão do idioma em `lib/i18n/actions.ts`), para o servidor
  já renderizar no tema certo, sem piscar.
- Todas as cores saem de variáveis CSS (`@theme` em `app/globals.css`). Nenhuma cor fixa em
  componente.

### Tokens

| Token | Escuro | Claro |
|---|---|---|
| Fundo | `#08080E` | `#F6F5FB` |
| Brilho do fundo (topo da página) | `radial-gradient(900px 420px at 70% -120px, rgba(124,58,237,.28), transparent 70%)` | o mesmo com `rgba(124,58,237,.16)` |
| Menu lateral | `rgba(12,12,20,.6)`, borda `rgba(255,255,255,.06)` | `rgba(255,255,255,.75)`, borda `rgba(20,20,40,.08)` |
| Cartão | `linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.015))`, borda `rgba(255,255,255,.08)` | `#FFFFFF`, borda `rgba(20,20,40,.08)`, sombra `0 1px 2px rgba(20,20,40,.04)` |
| Cartão (hover) | borda `rgba(167,139,250,.45)`, sombra `0 18px 50px -12px rgba(124,58,237,.45)`, sobe 2px | borda `rgba(124,58,237,.35)`, sombra `0 18px 44px -14px rgba(124,58,237,.35)` |
| Título | `#F7F7FB` | `#15151F` |
| Texto | `#E9E9F2` | `#15151F` |
| Texto secundário | `#A9A9C0` | `#5E5E74` |
| Texto terciário | `#9C9CB4` | `#66667C` |
| Placeholder | `#8B8BA3` | `#75758A` |
| Destaque (marca) | `brand.colors.primary` (padrão `#7C3AED`) | o mesmo |
| Gradiente de destaque | `linear-gradient(135deg, var(--accent), #C026D3)` | o mesmo |
| Brilho do destaque | `0 0 18px rgba(168,85,247,.4)`; hover `0 0 28px rgba(168,85,247,.65)` | `0 0 16px rgba(168,85,247,.3)`; hover `0 0 24px rgba(168,85,247,.45)` |
| Destaque suave (fundo) | `rgba(124,58,237,.16)` | `#F3EEFF` |
| Texto sobre destaque suave | `#DDD6FE` / ícones `#C4B5FD` | `#5B21B6` / ícones `#6D28D9` |
| Sucesso | texto `#86EFAC`, ponto `#22C55E` | texto `#15803D`, ponto `#22C55E` |
| Atenção | texto `#FCD34D`, ponto `#F59E0B` | texto `#92400E`, ponto `#F59E0B` |
| Erro | texto `#FECACA`, fundo `rgba(239,68,68,.12)`, borda `rgba(248,113,113,.45)` | texto `#B91C1C`, fundo `#FEF2F2`, borda `#FECACA` |
| Botão destrutivo | `#DC2626` | `#DC2626` |

O destaque continua vindo de `config/brand.ts` (`colors.primary`): troque para `#7C3AED`
e `primaryHover` para `#6D28D9`.

Contraste: texto normal com pelo menos 4,5:1 nos dois temas, inclusive texto pequeno cinza.

## Tipografia

- Títulos e nomes: **Space Grotesk** 600 (h1 30–32px, `letter-spacing: -0.03em`; h2 18px;
  nome de automação ou conta 16px).
- Corpo: **Inter** 400/500/600, 14px.
- Palavras-chave e códigos: monoespaçada (`ui-monospace`), 12–13px, em chip.
- Carregar as fontes com `next/font` (sem link externo em runtime).

## Raios e espaçamento

Cartões 16px; botões, campos e controles segmentados 12px (item interno 9–10px); chips 6–8px;
miniaturas de post 12px; pílulas e chaves 999px. Alvo de toque mínimo de 44px.

## Componentes

- **Botão primário:** gradiente de destaque, texto branco, brilho; hover aumenta o brilho.
- **Botão secundário:** transparente com borda (`rgba(255,255,255,.1)` / `rgba(20,20,40,.12)`).
- **Controle segmentado** (abas de canal, "Todas / Escolher / Próximo reel", "Com palavra-chave /
  Qualquer comentário"): trilho com fundo sutil e borda; item ativo com o gradiente e brilho.
- **Chave liga/desliga:** 42×24 dentro de área de toque de 44px; ligada = gradiente com brilho;
  desligada = `rgba(255,255,255,.12)` / `rgba(20,20,40,.14)`. Sempre `<button aria-pressed>`
  (ou `role="switch"` com `aria-checked`).
- **Status:** ponto de 7px com brilho da própria cor + texto (Ativa, Pausada, Aguardando reel,
  Desativada).
- **Menu lateral:** ícones de traço; item ativo com destaque suave e anel interno; "Sair" e
  "Tema" no rodapé.
- **Grade de publicações:** miniaturas 4:5, ícone de reel/carrossel/foto e contagem de
  comentários; selecionada = borda `#C4B5FD`, brilho e caixa marcada com o gradiente.
- **Resumo "Como vai funcionar":** cartão com gradiente suave de destaque no topo do editor.
- **Prévia do Direct:** coluna à direita no editor (empilha no celular), com balões de conversa.
- **Diálogo destrutivo:** borda e brilho vermelhos, ação "Desativar em vez disso" ao lado de
  "Remover para sempre".
- **Métricas na lista de automações:** número em Space Grotesk + rótulo; mini gráfico só se
  houver dado real por dia (sem dado, não desenhe a linha).

## Movimento

- Transições de 150–250 ms em hover, foco, chaves e troca de abas; cartões sobem 2px no hover.
- Respeite `prefers-reduced-motion`: sem deslocamentos nem animações, só troca de cor.
- Nada de animação contínua ou em loop.

## Onde aplicar

Todas as telas: Dashboard, Automações (lista e editor de todos os canais), Contas, Logs de DMs,
Configurações, API e MCP, Diagnóstico, relatórios de campanha, área de gestão (`/admin`),
login, cadastro, confirmação de e-mail, esqueci/redefinir senha, convite, telas de status da
conta (aguardando, recusado, desativado) e as páginas públicas (`/privacidade`, `/termos`,
`/exclusao-dados`, relatório compartilhado). Funciona no celular (menu vira gaveta, colunas
empilham, tabelas largas rolam dentro de uma caixa).
