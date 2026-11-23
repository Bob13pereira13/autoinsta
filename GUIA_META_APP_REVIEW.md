# Guia do Meta App Review

Objetivo: aprovar na primeira tentativa. Este guia descreve o app **como ele é hoje**.

- **Login:** Instagram API with Facebook Login, isto é, Facebook Login for Business com a configuração
  `1007716072385958` (tipo de token: *System-user access token*, sem expiração, ativo: conta do Instagram).
  No código isso é o "Unified login" (`META_LOGIN_CONFIG_ID`).
- **Permissões pedidas:** `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`,
  `business_management` e `public_profile`. A lista vive em `lib/meta/permissions.ts`; a tela de
  consentimento do app, a Política de Privacidade e a checagem das permissões concedidas leem de lá.
- **Fora do vídeo e das justificativas:** "Exigir que siga" (pedido para seguir antes do link).

Em todo o guia, troque `https://SEU_DOMINIO` pelo domínio real (o mesmo de `NEXTAUTH_URL`).

---

## 0. Riscos que você precisa verificar antes de enviar

O código foi revisado e testado de ponta a ponta com a Meta **simulada**. Três pontos dependem do
comportamento real da Meta e só dá para confirmar no seu app, com a conta de teste:

1. **Notificações (webhooks) da conta.** Ao conectar, o app chama `POST /{ig-id}/subscribed_apps` com o
   token do usuário do sistema. Se a Meta recusar, a conta conecta, mas nenhum comentário ou mensagem chega e
   nenhuma automação responde. Agora o app **avisa** isso em Contas ("Instagram notifications are not active
   yet") e registra o erro em `/admin` → Diagnóstico. Antes de gravar: conecte a conta de teste, confirme que o
   aviso **não** aparece, mande uma DM de outra conta e veja o evento chegar em Diagnóstico. Se não chegar,
   não grave: me avise. Pode ser preciso incluir `pages_manage_metadata` na configuração, e isso é decisão
   sua, porque é uma permissão a mais para justificar.
2. **`business_management` some do token.** Há relatos de que a Meta só mantém essa permissão no token
   quando o app tem *Advanced Access* em `public_profile`. Sem ela, o login termina e a tela de Contas mostra
   "No Instagram professional account found". Por isso `public_profile` entra no pedido.
3. **Pedido de exclusão vindo da Meta.** A Meta não documenta qual ID chega no callback de exclusão para
   tokens de usuário do sistema. O app compara com o ID da conta do Instagram, o ID com escopo do app e o
   usuário do token. Se não bater, o pedido fica registrado como "nada encontrado" e gera um alerta em
   Diagnóstico. A política oferece também a exclusão pelo painel (lixeira) e por e-mail, que sempre
   funcionam.

---

## 1. Checklist

### 1.1 Código (já feito neste repositório)

- [x] Toda chamada à Graph API mapeada para a permissão que exige (seção 3). Nenhuma permissão pedida sem
      uso num fluxo visível, e nenhuma chamada que exija permissão não pedida, até onde o código e a
      documentação permitem afirmar (ver riscos da seção 0).
- [x] Interface 100% em inglês com o idioma em English (teste `__tests__/english-interface.test.ts` e
      auditoria no navegador). O seletor de idioma fica na página inicial, no login, no cadastro e nas
      telas de senha; as páginas legais têm endereço próprio em inglês.
- [x] Política de Privacidade, Termos e Exclusão de dados públicos, sem login, em português e inglês, com
      os prazos lidos do código (`lib/privacy/retention.ts`) e as permissões lidas de
      `lib/meta/permissions.ts`.
- [x] Callbacks de exclusão e de desautorização validam o `signed_request` com o `FACEBOOK_APP_SECRET`,
      apagam os dados e devolvem `{ url, confirmation_code }`; a página de status funciona
      (testes com pedido válido e inválido em `__tests__/data-deletion.db.test.ts`).
- [x] A lixeira em Contas apaga o mesmo que o pedido de exclusão da Meta.
- [x] Antes do login da Meta, a tela `/accounts/connect` mostra os requisitos e cada permissão com o motivo,
      e o botão oficial **Continue with Facebook**.
- [x] Cancelar o login, recusar uma permissão, não ter conta profissional ligada a uma Página e falhas da
      Meta: cada caso volta para Contas com mensagem clara e **Try again**, nunca erro 500.
- [x] Página inicial explica o produto e mostra razão social, CNPJ, endereço, suporte e os links legais.
- [x] Script da conta do revisor: `npm run review-account` (seção 5).
- [x] Os quatro fluxos do vídeo e a desconexão testados de ponta a ponta com banco e Redis reais
      (`__tests__/review-flows.db.test.ts`).

### 1.2 Você (configuração e painel da Meta)

**No `config/brand.ts` (antes de tudo):**

- [ ] `processors.hosting` e `processors.email`: o nome da empresa e o país de cada um (ex.:
      `"Hetzner Online GmbH (Alemanha)"`, `"Resend, Inc. (Estados Unidos)"`). Enquanto estiverem vazios, a
      política descreve sem nomear e `/admin` → Diagnóstico mostra a pendência.
- [ ] `legal.address`: hoje está só "São Paulo/SP". Coloque o endereço completo da sede.

**No servidor (Coolify):** `META_LOGIN_CONFIG_ID=1007716072385958`, `META_APP_ID`, `FACEBOOK_APP_SECRET`,
`WEBHOOK_VERIFY_TOKEN`, `NEXTAUTH_URL=https://SEU_DOMINIO`; worker e rotinas (`scripts/cron.sh`) rodando.

**No portfólio empresarial (Business Manager):**

- [ ] **Verificação da empresa** (Configurações do negócio → Central de segurança → Verificação), com o
      CNPJ. Sem ela não há Advanced Access.
- [ ] **Verificação de acesso** (Access Verification / Tech Provider): no painel do app, em
      *App Review → Access verification*, declarar que o app atende **outras empresas** (os seus clientes) e
      enviar a verificação. É exigida de apps que acessam ativos de outros negócios com Facebook Login for
      Business.

**No app (developers.facebook.com):**

- [ ] Configurações do app → Básico: ícone **1024×1024** (`docs/design/app-icon-1024.png`), categoria,
      e-mail de contato, URLs da seção 2 (privacidade, termos, exclusão de dados), domínio do app.
- [ ] Facebook Login for Business → Configurations: a configuração `1007716072385958` com exatamente
      `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages` e `business_management`.
      Nada de anúncios, publicação ou insights.
- [ ] Facebook Login for Business → Settings: *Valid OAuth Redirect URIs* e *Deauthorize callback URL*
      (seção 2).
- [ ] Webhooks do Instagram: URL de callback, *Verify token* e os campos `comments`, `messages`,
      `messaging_postbacks` e `messaging_seen`. Teste com *Test → Send to My Server* e confira o evento em
      `/admin` → Diagnóstico.
- [ ] Funções do app (App roles): a conta do Instagram de teste e a segunda conta (que comenta e manda DM)
      precisam ser testadoras enquanto o app não tem Advanced Access.
- [ ] App Review: pedir **Advanced Access** em `instagram_basic`, `instagram_manage_comments`,
      `instagram_manage_messages`, `business_management` e `public_profile`, com as justificativas da
      seção 4, o vídeo da seção 7 e as instruções da seção 5.
- [ ] Respostas de tratamento de dados (seção 6).
- [ ] Depois de aprovado: modo **Live**.

**Na conta do Instagram de teste:** profissional (Business ou Creator), ligada a uma Página do Facebook
no portfólio; no app do Instagram, Configurações → Mensagens e respostas ao story → Controles de
mensagens → Ferramentas conectadas → **Permitir acesso às mensagens** ligado; ao menos um post publicado e
um story nas últimas 24 h. A segunda conta precisa ser **pública** para testar respostas a story.

---

## 2. URLs para o painel da Meta

| Campo no painel | URL |
|---|---|
| Privacy Policy URL | `https://SEU_DOMINIO/privacy` (inglês; em português: `/privacidade`) |
| Terms of Service URL | `https://SEU_DOMINIO/terms` (em português: `/termos`) |
| User data deletion → **Data deletion instructions URL** | `https://SEU_DOMINIO/data-deletion` (em português: `/exclusao-dados`) |
| User data deletion → **Data deletion callback URL** | `https://SEU_DOMINIO/api/webhooks/meta/data-deletion` |
| Deauthorize callback URL (Facebook Login for Business → Settings) | `https://SEU_DOMINIO/api/webhooks/meta/deauthorize` |
| Valid OAuth Redirect URIs | `https://SEU_DOMINIO/api/instagram/callback` |
| App domains | `SEU_DOMINIO` (sem `https://`) |
| Site URL | `https://SEU_DOMINIO` |
| Webhooks → Callback URL | `https://SEU_DOMINIO/api/webhook` |
| Webhooks → Verify token | o valor de `WEBHOOK_VERIFY_TOKEN` |

O painel aceita o campo de *instruções* **ou** o de *callback* de exclusão; prefira o callback (o app
devolve o link de status com o código). As páginas em inglês nunca redirecionam para as em português.

---

## 3. Chamadas à Graph API e permissões

Todas vão para `graph.facebook.com` com o token de usuário do sistema que o login gera (código em
`lib/meta/client.ts` e `lib/meta/oauth.ts`).

| # | Onde roda | Chamada | Código | Permissão | Fluxo visível |
|---|---|---|---|---|---|
| 1 | Web | Diálogo `www.facebook.com/dialog/oauth?config_id=…` | `getAuthorizationUrl` | as da configuração | Accounts → Connect Instagram → Continue with Facebook |
| 2 | Web | `GET /oauth/access_token` (código → token, com o app secret) | `exchangeCodeForToken` | nenhuma | volta do login |
| 3 | Web | `GET /debug_token` (com o token do app) | `getUnifiedTokenInfo` | nenhuma | validade do token e usuário; `scopes` e `granular_scopes` vão para o Diagnóstico, sem decidir nada (com token de usuário do sistema, `scopes` pode omitir `business_management` mesmo funcionando). Permissão faltando é detectada pela própria chamada: erro 10 ou 200–299 em uma chamada essencial (4 e 5) vira aviso em Contas com a permissão dela |
| 4 | Web | `GET /me/assigned_instagram_accounts?fields=id,username` | `getAssignedInstagramAccounts` | **business_management** | a conta escolhida no login aparece em Contas |
| 5 | Web | `GET /{ig-id}?fields=id,username,name,profile_picture_url` | `getUserInfo` (login e `/api/instagram/profile`) | **instagram_basic** | nome, @ e foto da conta |
| 6 | Web | `POST /{ig-id}/subscribed_apps` (`comments`, `messages`, `messaging_postbacks`, `messaging_seen`) | `subscribeInstagramAccountToWebhooks` | instagram_manage_comments, instagram_manage_messages | sem isso nenhuma automação recebe eventos (risco 1 da seção 0) |
| 7 | Web | `GET /{ig-id}/media?fields=…` | `getUserMedia*` (`/api/instagram/posts`) | **instagram_basic** | grade de posts e reels no editor ("Specific posts") |
| 8 | Worker | `POST /{comment-id}/replies` | `sendCommentReply` | **instagram_manage_comments** | resposta pública ao comentário |
| 9 | Worker | `GET /{comment-id}?fields=id,hidden,replies{from}` | `getCommentState` | instagram_manage_comments | com espera: não responder de novo nem a comentário apagado |
| 10 | Worker (varredura a cada 5 min) | `GET /{media-id}/comments?fields=id,text,timestamp,from,replies{from}` | `getRecentMediaComments` | instagram_manage_comments | responde comentários que o webhook não entregou |
| 11 | Worker | `POST /{ig-id}/messages` com `recipient.comment_id` (texto, botão de link) | `sendPrivateReply*` | **instagram_manage_messages** | a DM para quem comentou a palavra-chave |
| 12 | Worker | `POST /{ig-id}/messages` com `recipient.id` (texto, botões, imagem ou vídeo) | `sendDirectMessage*`, `sendDirectAttachment` | **instagram_manage_messages** | respostas no Direct e a Stories |
| 13 | Worker | `GET /{igsid}?fields=username` | `getRecipientUsername` | instagram_manage_messages | `{username}` na mensagem |
| 14 | Worker | `GET /{igsid}?fields=is_user_follow_business` | `getUserFollowStatus` | instagram_manage_messages | só "Exigir que siga" (fora do vídeo) |
| 15 | Rotina (a cada 5 min) | `GET /{ig-id}/media` | `getUserMedia` (`attach-next-reel`) | instagram_basic | automação "próximo reel" |
| 16 | Rotina diária | `graph.instagram.com/refresh_access_token` | `refreshLongLivedToken` | nenhuma | só contas do antigo Instagram Login; não roda para Facebook Login |
| 17 | Rotina diária | nenhuma chamada à Meta | `purge-data` | — | retenção e exclusões pendentes |

**De fora para dentro:** webhooks (`POST /api/webhook`, assinatura `X-Hub-Signature-256` verificada) e os
callbacks de exclusão e desautorização (`signed_request` verificado).

**Por que `business_management` é necessária no nosso login.** A configuração gera um token de **usuário
do sistema** do portfólio empresarial do cliente. Com esse token, `me` é o usuário do sistema, não a conta
do Instagram. A única forma que o código tem de saber qual conta o cliente escolheu na tela da Meta é
`GET /me/assigned_instagram_accounts` (chamada 4), que lista os ativos atribuídos a esse usuário do sistema.
Sem `business_management`, essa lista volta vazia, o login termina sem conta e o app mostra "No Instagram
professional account found". O app não lê nem altera nenhum outro ativo do portfólio (páginas, contas de
anúncio, pessoas).

**`public_profile`:** vem em todo login do Facebook. O código não lê o perfil do Facebook (não há chamada a
`/me?fields=name`). Entra no pedido por causa do risco 2 da seção 0.

**Confirmação.** Cada permissão pedida aparece num fluxo do vídeo:
- `instagram_basic`: conta conectada com nome e @, e grade de posts;
- `business_management`: a conta escolhida no login aparecendo em Contas;
- `instagram_manage_comments`: resposta pública;
- `instagram_manage_messages`: DMs de Comentários, Direct e Stories.

Nenhuma chamada do código pede outra permissão. Fica a ressalva da chamada 6 (risco 1).

---

## 4. Justificativas (cole em inglês)

### instagram_basic

> Our app is a reply-automation tool for Instagram professional accounts. We use instagram_basic to read
> the connected Instagram professional account's profile information (ID, username, name and profile
> picture), shown in the app's Accounts page so the business knows which account is connected, and to read
> the metadata of the account's own media (posts and reels), so the business can choose on which posts an
> automation runs. We only read the account's own profile and media; we do not read other users’ profiles
> or media. The screencast shows the account appearing in Accounts after login and the media grid in the
> automation editor.

### instagram_manage_comments

> We use instagram_manage_comments to receive webhooks for new comments on the connected account's own posts
> and reels, check them for the keyword the business configured, and post a public reply to the comment on
> behalf of the business when the business turns that option on. Before a delayed reply we read the comment
> to avoid replying twice or replying to a deleted comment. We do not moderate, hide or delete comments, and
> we do not read comments on media the business does not own. The screencast shows a second account
> commenting the keyword and the public reply appearing under the comment.

### instagram_manage_messages

> We use instagram_manage_messages so the business can respond automatically to people who start an
> interaction with its Instagram account: a private reply to a person who commented a keyword on the
> business's post, and an automatic reply to direct messages and story replies that contain a keyword the
> business configured. Every message is triggered by that person's own comment, story reply or message,
> within Meta's messaging windows. We receive messaging webhooks only to trigger these replies and to stop
> automatic replies while a person from the business is talking to the customer. The screencast shows the
> DM sent after a comment, the reply to a direct message and the reply to a story reply.

### business_management

> Our Facebook Login for Business configuration issues a business integration system-user token for the
> customer’s business portfolio. We use business_management only to read which Instagram account the
> business assigned to our app during login (GET /me/assigned_instagram_accounts), so we can connect that
> account to the business’s workspace in our app. We do not read or manage any other business assets, ad
> accounts, pages or people. The screencast shows the asset selection in Meta’s login dialog and the
> selected Instagram account appearing in our Accounts page right after.

### public_profile

> Granted with every Facebook Login. Our app does not read or store the person’s Facebook profile; the
> login is used only to authorize the business’s Instagram account. We request Advanced Access because
> it is required for the login to keep the business_management permission.

---

## 5. Conta do revisor

Crie (ou reinicie) a conta com:

```bash
npm run review-account -- --email reviewer@SEU_DOMINIO --password 'uma senha longa'
```

No Coolify, rode no terminal do contêiner do **web**. O script:
- cria ou reinicia o cliente com o e-mail já confirmado, o espaço ativo (sem aprovação) e o idioma em inglês;
- deixa o login sem anti-robô (o Turnstile só aparece no cadastro);
- cria uma automação por canal, todas no modo Direto e sem "Exigir que siga":
  - Comentários com a palavra-chave **LINK** e resposta pública;
  - Stories respondendo qualquer resposta ao story;
  - Direct com a palavra-chave **PRICE**;
- coloca alguns registros de exemplo em DM Logs. Use `--no-sample-logs` para não criar.

Para conectar a conta do Instagram de teste:
1. Entre como o revisor.
2. Vá em Accounts → Connect Instagram account e passe pelo login da Meta.
3. Rode o comando de novo. Ele mantém a conta e recria as automações ligadas a ela.

Cole no campo **App Review → Instructions**:

> **Test credentials.** Sign in at https://SEU_DOMINIO/login with e-mail `reviewer@SEU_DOMINIO` and
> password `(a senha)`. The interface language is English (Language selector at the bottom of the menu).
>
> **Connected account.** The Instagram professional account @SUA_CONTA_DE_TESTE is already connected
> (Accounts page). To see the connection flow, click "Connect Instagram account": our page lists every
> permission we request and why, then "Continue with Facebook" opens Meta's login.
>
> **What to try** (from any other Instagram account; while the app is in development mode, use an account
> with a role in the app):
> 1. Comment **LINK** on any post of @SUA_CONTA_DE_TESTE → a public reply appears under the comment and the
>    commenter receives a DM with a link.
> 2. Send a direct message containing **PRICE** to @SUA_CONTA_DE_TESTE → an automatic reply arrives.
> 3. Reply to the current story of @SUA_CONTA_DE_TESTE → an automatic reply arrives.
> 4. Every reply is listed under **DM Logs**.
>
> **Data deletion.** Accounts → trash icon deletes the account and its data. Instructions:
> https://SEU_DOMINIO/data-deletion. Privacy Policy: https://SEU_DOMINIO/privacy.

Depois da aprovação, desative a conta: `npm run user -- disable reviewer@SEU_DOMINIO`.

---

## 6. Tratamento de dados (rascunho das respostas)

Marquei com **[CONFIRMAR]** o que só você sabe.

**Data processors / service providers with access to Platform Data:** Yes.
- Hosting of the application, database and queue: **Hostinger**, VPS in the **United States**
  (`processors.hosting`).
- E-mail delivery: **Resend, Inc.** (United States) (`processors.email`). O provedor de e-mail recebe só o
  e-mail e o nome dos clientes, nunca dados da Meta; se o formulário perguntar só por quem acessa
  *Platform Data*, ele não entra.
- Cloudflare Turnstile: não recebe dados da Meta (só o IP de quem se cadastra).

**Responsible entity:** {razão social de `config/brand.ts`}, CNPJ {cnpj}, Brazil.

**Country where Platform Data is stored:** United States (Hostinger VPS).

**Requests from public authorities in the past 12 months:** No. **[CONFIRMAR]**

**Policies and processes for public authority requests** (marque o que for verdade para você):

> We disclose data only when legally required by a valid order from a Brazilian authority. Every
> request is reviewed for legality before any disclosure; we challenge requests that are unlawful or
> overbroad, disclose the minimum data required, and keep a record of each request and response.
> **[CONFIRMAR]**

**Data deletion:**
> Customers delete an Instagram account and all its data at any time (Accounts → trash icon). Requests
> from Meta are processed automatically by our data deletion callback. People who interacted with a
> customer’s account can request deletion by e-mail to our data protection officer. Retention periods are
> listed in the Privacy Policy.

---

## 7. Roteiro do vídeo

Regras: interface em inglês, sem cortes dentro de um fluxo, cursor visível, 1080p, legendas em inglês na
edição. Um trecho por permissão; se o formulário pedir um vídeo por permissão, recorte os trechos
indicados, mantendo a cena 3 (login) em todos.

**Antes de gravar:**
- rode `npm run review-account` e entre como o revisor;
- desconecte a conta de teste, para mostrar o login completo;
- deixe a segunda conta aberta no celular, espelhado, ou em outro navegador;
- confira o risco 1 da seção 0.

| # | O que mostrar | Legenda (EN) | Permissão |
|---|---|---|---|
| 1 | Página inicial em inglês; abrir **Privacy Policy** e rolar até a tabela de permissões; mostrar **Data deletion** | "This is our website. The privacy policy explains which Instagram data we use, why, for how long, and how to delete it." | — |
| 2 | **Sign in** com a conta do revisor | "The business owner signs in to the dashboard." | — |
| 3 | **Accounts → Connect Instagram account**: a tela lista as permissões; clicar **Continue with Facebook**; no diálogo da Meta, entrar, escolher o portfólio e a conta do Instagram, ver as permissões e confirmar | "The owner connects the Instagram professional account with Facebook Login for Business. Our page explains each permission first; Meta's dialog shows the permissions and the asset selection." | business_management, instagram_basic |
| 4 | De volta em **Accounts**: a conta com @ e nome, **Active** | "The Instagram account selected during login is now connected and shown with its username and name." | business_management, instagram_basic |
| 5 | **Automations → Comments → Catalog link (comments)**: mostrar a palavra-chave LINK, o modo Direct, a resposta pública e a prévia; abrir "Specific posts" para mostrar a grade dos posts da conta | "The owner sets up a Comments automation: keyword LINK, a DM with a link, and a public reply. The editor lists the account's own posts and reels." | instagram_basic |
| 6 | Na segunda conta: comentar **LINK** num post da conta de teste | "Another Instagram user comments LINK on the business's post." | instagram_manage_comments |
| 7 | No post: a **resposta pública** aparece sob o comentário | "Our app posts the public reply under the comment." | instagram_manage_comments |
| 8 | Na segunda conta: a **DM** chega com o link | "The commenter receives a private reply by DM with the link." | instagram_manage_messages |
| 9 | Segunda conta manda **PRICE** por DM para a conta de teste; a resposta chega | "A direct message containing PRICE receives an automatic reply." | instagram_manage_messages |
| 10 | Segunda conta **responde ao story** da conta de teste; a resposta chega | "A reply to the business's story receives an automatic reply." | instagram_manage_messages |
| 11 | **DM Logs**: as linhas **Sent** dos três casos | "Every automatic reply is logged with its status." | — |
| 12 | **Accounts → lixeira** na conta, confirmar; a conta some; abrir **Data deletion** | "Disconnecting the account deletes it and its data. Deletion requests from Meta are handled automatically." | — |

Dicas que evitam reprovação:
- **Não corte** entre a ação da segunda conta e o resultado (cenas 6–10). Se a DM demorar, deixe rodar.
  As automações do script respondem na hora (espera 0).
- Mostre os **nomes das permissões**: a tela do app lista; se o diálogo da Meta não listar, use legenda.
- Não mostre dados de pessoas reais além das contas de teste.

---

## 8. Depois do envio

- Resposta típica em 3 a 10 dias úteis. Se reprovar, a Meta diz a permissão e o motivo: corrija o vídeo ou
  a justificativa daquela permissão e reenvie só ela.
- Motivos comuns: permissão sem aparecer no vídeo; vídeo sem o login completo; DM não aparecendo; política
  sem explicar uso, retenção e exclusão; empresa sem verificação.
- Depois da aprovação e do modo Live, cada cliente conecta o próprio Instagram em Accounts. A conta precisa
  ser profissional, ligada a uma Página e estar num portfólio que o cliente administra.

---

## Anexo: Instagram Login (apps antigos)

Sem `META_LOGIN_CONFIG_ID` (e sem `META_UNIFIED_LOGIN_URL`), o app usa o Instagram Login: escopos
`instagram_business_basic`, `instagram_business_manage_comments` e `instagram_business_manage_messages`
(as justificativas acima valem trocando os nomes; não há `business_management`), tokens de 60 dias renovados
pela rotina diária e chamadas em `graph.instagram.com`. Não é o caso deste app hoje.
