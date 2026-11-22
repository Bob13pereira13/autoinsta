# Automação de comentário → DM para Instagram (white-label)

Plataforma multi-cliente que responde automaticamente no Instagram, com automações separadas por canal:

- **Comentários**: alguém comenta uma palavra-chave (ou qualquer coisa) em um post ou reel e recebe a
  resposta por DM; opcionalmente o comentário também é respondido em público.
- **Stories**: alguém responde a um story da conta ou marca a conta no próprio story e recebe uma DM.
- **Direct**: alguém manda uma DM com uma palavra-chave (ou qualquer mensagem) e recebe a resposta.

As mensagens podem levar link rastreado, botão, pedido para seguir, agradecimento e **imagens e
vídeos**. Cada comentário ou mensagem dispara no máximo uma automação. Em Comentários, a automação vale
para todas as publicações ou só para as marcadas na grade (até 100).

**Clientes**: qualquer pessoa pode se cadastrar em `/cadastro` (com confirmação de e-mail e
Cloudflare Turnstile). Por padrão, o cliente fica **ativo assim que confirma o e-mail** e entra direto
no painel; os operadores recebem um aviso por e-mail com o link do cliente. Na área de gestão `/admin`
(só para os e-mails de `ADMIN_EMAILS`) → **Configurações**, a opção **"Exigir aprovação de novos
cadastros"** faz os cadastros confirmados ficarem **aguardando aprovação** até um operador aprovar ou
recusar. Lá também se ativa/desativa clientes, define o limite de contas do Instagram, acompanha a
receita estimada e vê a auditoria (inclusive de cada mudança nas configurações). Também é possível
criar clientes por lá (ou com `npm run user`).

O painel não tem caixa de entrada: as conversas continuam no app do Instagram (ou no Business Suite).
Quando alguém da conta responde uma pessoa por lá, as automações sem palavra-chave ficam 24 horas sem
responder essa pessoa, para não atropelar o atendimento.

O painel também não mostra métricas da conta (seguidores, alcance, visualizações) e não pede a
permissão de insights da Meta. O **Dashboard** (página inicial do painel) e o relatório de cada
automação mostram só o que a própria plataforma registra: DMs enviadas, ignoradas e com falha, cliques e
CTR.

As contas do Instagram ficam na aba **Contas**: conectar, reconectar, **desativar** (pausa todas as
automações da conta sem apagar nada) ou remover (apaga a conta e tudo dela). Funciona **exclusivamente pela API
oficial da Meta**.

O nome, o logotipo, as cores e os dados legais da marca ficam em **[`config/brand.ts`](config/brand.ts)**.

> Fork white-label do [OpenReply](https://github.com/diwenne/openreply) (licença MIT — veja
> [LICENSE](LICENSE), que precisa continuar no repositório).

## O que este fork acrescenta

- **Marca centralizada** em `config/brand.ts` e interface em **Português (Brasil)** por padrão (inglês
  disponível para o vídeo do App Review).
- **Login por e-mail e senha** (além do link mágico), com **cadastro público em /cadastro** (confirmação
  de e-mail obrigatória; a aprovação manual é opcional na área de gestão). Você também pode criar clientes
  pela área de gestão ou por script, e eles definem a senha pelo e-mail.
- **Somente API oficial da Meta**: sem Zernio; **Login unificado** (Facebook Login for Business, token de
  usuário do sistema) ou Login do Instagram para apps antigos.
- **Conformidade com a Meta e a LGPD**: `/privacidade`, `/termos`, `/exclusao-dados`, callback de
  exclusão de dados (`signed_request`) e de desautorização, retenção automática de dados.
- **Segurança**: tokens criptografados (AES-256-GCM), assinatura `X-Hub-Signature-256` verificada sobre o
  corpo bruto, rotas de cron protegidas, limite de tentativas de login. O espaço de cada cliente tem só o
  que é das automações (Painel, Automações, Contas, Logs de DMs e Configurações); não há API pública,
  MCP nem chaves de serviço, e o **Diagnóstico** (eventos de todos os clientes, com filtro por cliente)
  fica na área de gestão, só para `ADMIN_EMAILS`.

## Requisitos

- Node.js 20+, PostgreSQL 16 e Redis 7.
- Um domínio com **HTTPS** (a Meta exige para OAuth e webhooks).
- Envio de e-mail: [Resend](https://resend.com) ou um servidor SMTP próprio.
- Um app no Meta for Developers — veja **[GUIA_META_APP_REVIEW.md](GUIA_META_APP_REVIEW.md)**.

## Subindo o projeto

```bash
npm install
cp .env.example .env        # preencha os valores (o arquivo explica cada um)
docker-compose up -d        # Postgres e Redis locais
npm run db:generate
npm run db:migrate
npm run dev                 # app web em http://localhost:3000
npm run worker              # em outro terminal: é ele que envia as DMs
```

São sempre **três processos** em produção:

| Processo | Comando | Função |
|---|---|---|
| Web | `npm run start` (após `npm run build`) | painel, OAuth e webhooks |
| Worker | `npm run worker` | envia DMs e respostas, respeitando os limites da Meta |
| Rotinas diárias | Vercel Cron (`vercel.json`) ou `sh scripts/cron.sh` | renova tokens do Login do Instagram, aplica a retenção de dados, reprocessa exclusões, apaga mídias abandonadas |

### Imagens e vídeos (armazenamento)

As imagens e vídeos das automações são gravados no disco do **app web**, na pasta `UPLOADS_DIR`, e
servidos publicamente em `/media/<chave aleatória>` (a Meta baixa o arquivo por essa URL ao enviar a DM).

- Em produção, monte um **volume persistente** nessa pasta (no Docker: `/data/uploads`, já criada no
  build e definida como `UPLOADS_DIR` no `Dockerfile`). Sem volume, os arquivos somem a cada deploy.
- O **worker não precisa** do volume: ele só envia a URL pública para a Meta.
- Cota por espaço de trabalho: `MEDIA_WORKSPACE_QUOTA_MB` (padrão 500). Limites da Meta, validados pelo
  conteúdo do arquivo: PNG/JPEG até 8 MB (até 5 por mensagem), MP4/MOV/WEBM até 25 MB (1 por mensagem).
- Se houver proxy reverso na frente do app, ele precisa aceitar corpos de pelo menos ~26 MB em
  `/api/media`.
- Os arquivos são apagados ao remover a mídia, excluir a automação, desconectar a conta ou receber um
  pedido de exclusão da Meta.

## Personalizando a marca

Edite `config/brand.ts`: nome, frase, descrição, logotipo (`public/brand/`), cores e dados legais.
Troque também os ícones `public/icon-192.png`, `public/icon-512.png` e `public/apple-touch-icon.png`.
Os campos marcados com `[PREENCHER]` (razão social, CNPJ, endereço, e-mail de suporte, encarregado de
dados) aparecem na Política de Privacidade e nos Termos — **preencha antes de publicar**. Na área de
gestão, **`/admin` → Diagnóstico** lista os campos pendentes (só para os e-mails de `ADMIN_EMAILS`).

## Contas dos clientes

Há três jeitos de criar um cliente:

- **Cadastro público** em `/cadastro`: e-mail confirmado + Turnstile. Com **"Exigir aprovação de
  novos cadastros"** desligada (padrão, em `/admin` → Configurações), o cliente fica Ativo ao confirmar
  o e-mail, recebe o e-mail de boas-vindas e entra direto no painel. Ligada, ele fica "Aguardando
  aprovação" (vê só uma tela de análise) até você aprovar ou recusar. Só entra direto quem se cadastrou
  **e** confirmou o e-mail com a opção desligada; mudar a opção não altera a situação de ninguém. Os
  e-mails de `ADMIN_EMAILS` recebem um aviso a cada cadastro confirmado, com o link do cliente, nos dois
  casos. Para fechar o cadastro público, deixe as chaves do Turnstile vazias em produção ou defina
  `ALLOWED_EMAILS`.
- **Área de gestão** `/admin` → Novo cliente: já entra Ativo e recebe o convite para definir a senha.
- **Linha de comando** (como antes), também Ativo:

```bash
npm run user -- create cliente@loja.com.br --name "Maria" --workspace "Loja da Maria"
```

```bash
npm run user -- import clientes.csv
```

```bash
npm run user -- resend cliente@loja.com.br
```

```bash
npm run user -- disable cliente@loja.com.br
```

```bash
npm run user -- list
```

- `create` / `import` (CSV com as colunas `email,nome,empresa`) criam a conta e o espaço de trabalho e
  enviam um e-mail para o cliente **definir a senha** (o link vale 7 dias e também é impresso no
  terminal, para você enviar por outro canal se o e-mail não chegar).
- `disable` bloqueia o acesso e encerra as sessões abertas na hora.
- O cliente pode trocar a senha em Configurações ou usar "Esqueceu a senha?" na tela de login.

## Conectando o Instagram (Meta)

O passo a passo completo — URLs para colar no painel, configuração de login, justificativas das
permissões em inglês e português e o roteiro do vídeo — está em
**[GUIA_META_APP_REVIEW.md](GUIA_META_APP_REVIEW.md)**.

Resumo das rotas que a Meta usa:

| Rota | Uso |
|---|---|
| `/api/instagram/callback` | OAuth Redirect URI |
| `/api/webhook` | Webhook (comentários, mensagens, respostas e menções em stories) |
| `/media/<chave>` | Imagens e vídeos das DMs (públicos; a Meta baixa daqui) |
| `/api/webhooks/meta/data-deletion` | Data Deletion Request Callback |
| `/api/webhooks/meta/deauthorize` | Deauthorize Callback |
| `/privacidade`, `/termos`, `/exclusao-dados` | Páginas públicas exigidas |

## Desenvolvimento

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

Os testes que usam um PostgreSQL real (`__tests__/*.db.test.ts`) rodam quando `TEST_DATABASE_URL` está
definida; eles criam e apagam um schema temporário:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm test
```

Detalhes técnicos herdados do projeto original (em inglês) estão em [`docs/`](docs/).

## Licença

MIT. Baseado no [OpenReply](https://github.com/diwenne/openreply), de Diwen Huang e Anish Raj — veja
[LICENSE](LICENSE).
