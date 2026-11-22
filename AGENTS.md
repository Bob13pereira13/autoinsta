<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Migrações do banco (deploy)

O web (`npm run start`) e o worker (`npm run worker`) rodam `prisma migrate deploy` ao subir, antes do
app. O deploy é só reimplantar os dois; ninguém roda migração à mão. A trava do Prisma no banco faz cada
migração ser aplicada uma vez só, mesmo com os dois subindo juntos. Se a migração falhar, o processo sai
com erro e a versão nova não sobe.

**Toda migração precisa funcionar com o código anterior.** Durante o deploy a versão antiga e a nova
rodam juntas por alguns segundos, e a antiga já usa o banco migrado.

- Primeiro adicionar: tabela nova, coluna que aceita nulo ou coluna `NOT NULL` com `DEFAULT`, índice novo.
- Remover só num deploy seguinte, depois que nenhum código em produção usa mais o que sai (coluna,
  tabela, valor de enum). Renomear = adicionar o novo e copiar os dados num deploy; apagar o antigo noutro.
- Não mude o tipo de uma coluna nem a torne `NOT NULL` num deploy que ainda roda código que grava
  nulo ou o tipo antigo.
- Valor novo de enum: o código anterior não o conhece (pode falhar ao ler a linha ou tratá-la errado);
  conte com isso nos segundos em que as duas versões convivem.
- Atenção ao campo `@updatedAt` ou obrigatório sem `@default` em tabela existente: o Prisma gera
  `ADD COLUMN ... NOT NULL` sem padrão, que falha com linhas no banco. Escreva o `DEFAULT` no SQL.
- Migração curta (segundos). O outro processo espera a trava por 10 s; passou disso, ele sai com erro e
  só sobe no reinício seguinte. Nada de `UPDATE` em massa ou índice demorado numa tabela grande.
- Uma migração que falhou fica marcada no banco e **todo start seguinte para** (erro P3009), mesmo
  depois de corrigida, até alguém rodar uma vez, no terminal de um contêiner,
  `npx prisma migrate resolve --rolled-back <nome_da_migração>`. Teste a migração contra um banco com
  dados antes do push.

`__tests__/deploy-migrations.test.ts` confere os scripts e recusa `ADD COLUMN ... NOT NULL` sem
`DEFAULT`; migração que remove ou muda coluna, tabela ou tipo só passa depois de entrar na lista
revisada desse teste.
