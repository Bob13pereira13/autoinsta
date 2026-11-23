# Guia do Meta App Review

Objetivo: aprovar na primeira tentativa. Este guia descreve o app **como ele é hoje**.

- **Login:** só o **login do Instagram** (Instagram API with Instagram Login, também chamado Business Login
  for Instagram). A pessoa entra com o usuário e a senha do Instagram e liga as permissões na tela do
  Instagram. Nenhuma conta do Facebook, Página ou portfólio empresarial entra no fluxo. Todas as chamadas
  vão para `graph.instagram.com`.
- **Permissões pedidas:** `instagram_business_basic`, `instagram_business_manage_comments` e
  `instagram_business_manage_messages`. A lista vive em `lib/meta/scopes.ts` e `lib/meta/permissions.ts`;
  a tela antes do login, a Política de Privacidade e o aviso de permissão faltando leem de lá.
- **Gravação:** no **seu próprio espaço**, reconectando a conta **@primus3d_** pelo login do Instagram. A
  conta de revisão (seção 5) fica **sem Instagram conectado**: o vídeo mostra o fluxo completo com uma conta
  real; o login de teste mostra o painel e a tela de conexão.
- **Fora do vídeo e das justificativas:** "Exigir que siga" (pedido para seguir antes do link). Não há envio
  depois que alguém só lê uma DM: o app não assina `messaging_seen`.

Em todo o guia, troque `https://SEU_DOMINIO` pelo domínio real (o mesmo de `NEXTAUTH_URL`).

---

## 0. Antes de enviar: o que conferir no app real

O código foi testado de ponta a ponta com a Meta **simulada** (`__tests__/review-flows.db.test.ts`). Quatro
pontos dependem da Meta real e só dá para confirmar no seu app, com @primus3d_:

1. **Mensagens chegando.** Com o login do Instagram, o acesso padrão (antes da aprovação) vale para contas
   que você administra e adicionou ao app (seção 1.2), e quem manda a DM de teste precisa ser **Testador do
   Instagram** aceito. Conecte @primus3d_, mande uma DM e responda a um story de uma conta testadora e abra
   `/admin` → Diagnóstico → **Notificações da Meta (últimas 24 h)**. O esperado é "Chegaram notificações de
   mensagem e foram aceitas". Se chegar "nenhuma notificação de mensagem", confira o passo 2 da seção 1.2
   (campos do webhook nessa aba) e o roteamento de conversas (seção 3.1).
2. **Assinatura dos webhooks.** O app confere a assinatura com o `INSTAGRAM_APP_SECRET` (e com o
   `FACEBOOK_APP_SECRET`, se estiver definido). Se aparecer "Webhook signature verification failed" no
   Diagnóstico, o segredo no Coolify não é o do app certo.
3. **ID nos callbacks de desautorização e exclusão.** A Meta não diz qual ID manda nesses callbacks para o
   login do Instagram. O app compara com o ID da conta profissional (`user_id`) e com o ID com escopo do app
   (`id` de `/me`), os dois guardados na conexão. Se nada bater, o pedido fica como "nada encontrado" e gera
   alerta no Diagnóstico; a lixeira em Contas e o e-mail continuam funcionando.
4. **Um login por app.** A documentação da Meta diz: "Your app can either use Facebook Login or Instagram
   Login but not both." Retire do App Review os pedidos antigos (`instagram_basic`,
   `instagram_manage_comments`, `instagram_manage_messages`, `business_management`, `public_profile`) e a
   configuração do Facebook Login for Business (`1007716072385958`), se o painel deixar. A mesma página diz
   que apps que migram do Facebook Login **podem** receber Advanced Access automático nas permissões
   equivalentes; se aparecer como concedido, não precisa enviar de novo.

---

## 1. Checklist

### 1.1 Código (já feito neste repositório)

- [x] Login só pelo Instagram: `www.instagram.com/oauth/authorize` com as três permissões e
      `enable_fb_login=false` (a opção "Entrar com o Facebook" não aparece na tela do Instagram).
- [x] Depois do login: troca do código (`api.instagram.com`), token de 60 dias (`ig_exchange_token`),
      `/me` com `user_id`, inscrição dos webhooks e o que a Meta confirma, tudo em `graph.instagram.com`.
- [x] O ID guardado como conta é o `user_id` (ID da conta profissional), o mesmo `entry.id` dos webhooks:
      os recibos do Diagnóstico e o filtro de contas batem. O `id` de `/me` (com escopo do app) fica guardado
      só para os callbacks de desautorização e exclusão.
- [x] Permissão desligada na tela do Instagram: nada é conectado e Contas diz qual faltou, com
      **Try again**. Cancelar, conta já em outro espaço, limite de contas e falhas da Meta: cada caso volta
      para Contas com mensagem clara, nunca erro 500.
- [x] Webhooks inscritos: `comments`, `messages`, `messaging_postbacks` e `message_echoes` (os ecos fazem a
      pausa quando alguém da loja responde pelo app do Instagram). Se a Meta recusar um campo, o app tenta
      sem ele e o Diagnóstico mostra o que faltou.
- [x] Renovação automática do token de 60 dias pela rotina diária (`refresh_access_token`).
- [x] Callbacks de desautorização e exclusão validam o `signed_request` com o `INSTAGRAM_APP_SECRET`,
      apagam os dados e devolvem `{ url, confirmation_code }`.
- [x] Interface, Política de Privacidade, Termos e Exclusão de dados sem Facebook, Página, portfólio ou
      `business_management`, em português e inglês; `/privacy`, `/terms` e `/data-deletion` saem com
      `<html lang="en">`.
- [x] A tela `/accounts/connect` mostra os requisitos e cada permissão com o motivo, e o botão
      **Continue with Instagram**.
- [x] Contas conectadas pelo login antigo do Facebook ficam marcadas para reconectar (migração
      `20261206120000_unified_accounts_reconnect`); nada é enviado com o token antigo. Reconectar com o
      Instagram atualiza a mesma conta e mantém as automações.
- [x] Paridade testada com a Meta simulada, banco e Redis reais: resposta privada com botão de link,
      resposta pública, DMs, respostas e menções em story, toques em botão, ecos e pausa humana, espera antes
      de responder, imagens e vídeos, verificação de seguidor, lista de posts e reels, inscrição de
      webhooks, assinatura com o segredo do Instagram, renovação do token, desautorização e exclusão.

### 1.2 Você (Coolify e painel da Meta)

**No Coolify (web e worker):**

| Variável | Valor |
|---|---|
| `INSTAGRAM_APP_ID` | Painel do app → Instagram → **API setup with Instagram login** → 3. *Set up Instagram business login* → **Business login settings**: "Instagram app ID" |
| `INSTAGRAM_APP_SECRET` | Mesmo lugar: "Instagram app secret" (clique em Show) |
| `WEBHOOK_VERIFY_TOKEN` | Fica como está; é o mesmo valor que você cola no painel |
| `NEXTAUTH_URL` | `https://SEU_DOMINIO` (fica) |

Saem: `META_UNIFIED_LOGIN_URL`, `META_LOGIN_CONFIG_ID` e `META_APP_ID` (o app não lê mais os dois primeiros;
o terceiro só serviria para reconhecer o app na lista de inscrições da conta, e o `INSTAGRAM_APP_ID` já faz
isso). `FACEBOOK_APP_SECRET` pode ficar: o guia de webhooks da Meta cita o segredo de *App settings → Basic*,
e com ele o app aceita a assinatura feita com qualquer um dos dois segredos.

**No app (developers.facebook.com):**

- [ ] **Configurações do app → Básico:** ícone **1024×1024** (`docs/design/app-icon-1024.png`), categoria,
      e-mail de contato, URL da Política de Privacidade, Termos e domínio (seção 2).
- [ ] **Funções do app → Funções → Testadores do Instagram:** adicione **@primus3d_** e as contas que vão
      comentar e mandar DM. Cada conta aceita o convite no Instagram: Configurações e atividade →
      Permissões do site → Apps e sites → **Convites de testador** (ou, no navegador,
      `instagram.com/accounts/manage_access` → Tester Invites). **@primus3d_ também precisa ser testadora**
      até a aprovação: sem função no app, a tela do Instagram recusa o login ("Insufficient Developer Role").
- [ ] **Instagram → API setup with Instagram login:**
  1. **Generate access tokens:** *Add account* → @primus3d_ (depois de aceita como testadora). Não precisa
     copiar o token: a conexão pelo app gera o dela.
  2. **Configure webhooks:** Callback URL `https://SEU_DOMINIO/api/webhook`, Verify token = o valor de
     `WEBHOOK_VERIFY_TOKEN`, **Verify and save**; depois ligue (*Subscribe*) os campos `comments`,
     `messages`, `messaging_postbacks` e `message_echoes`. Deixe `messaging_seen` desligado.
  3. **Set up Instagram business login → Business login settings:** *OAuth redirect URIs*
     `https://SEU_DOMINIO/api/instagram/callback`; *Deauthorize callback URL*
     `https://SEU_DOMINIO/api/webhooks/meta/deauthorize`; *Data deletion request URL*
     `https://SEU_DOMINIO/api/webhooks/meta/data-deletion`. Salve.
  4. **Nome do app do Instagram:** é o nome que a tela de login do Instagram mostra ("ChatIntegrAI would
     like to…"). Troque "AGENTE INTEGRACOES - INST - IG" por **ChatIntegrAI** onde o painel mostra o
     "Instagram app name" nessa aba. Se não houver como editar ali, o nome que vale é o *Display name* de
     Configurações do app → Básico; confira na tela de login antes de gravar.
  5. **Complete app review** (seção 4).
- [ ] **Verificação da empresa** (Business Verification) com o CNPJ, se o painel exigir para o Advanced
      Access.
- [ ] Respostas de tratamento de dados (seção 6).
- [ ] Depois de aprovado: modo **Live**.

**Na conta @primus3d_:** profissional (Business ou Creator); no app do Instagram, Configurações → Mensagens
e respostas ao story → Controles de mensagens → Ferramentas conectadas → **Permitir acesso às mensagens**
ligado; ao menos um post publicado e um story nas últimas 24 h. A conta que comenta precisa ser **pública**
para testar respostas a story.

**@primus3d_ conectada hoje pelo login do Facebook:** depois do deploy ela aparece em Contas pedindo para
reconectar e não responde nada até lá. Reconecte em Contas → **Connect Instagram** → **Continue with
Instagram**, entrando como @primus3d_. A conta é a mesma (mesmo ID profissional), então as automações e o
histórico ficam. Não precisa remover antes.

---

## 2. URLs para o painel da Meta

| Campo no painel | URL |
|---|---|
| Privacy Policy URL | `https://SEU_DOMINIO/privacy` (em português: `/privacidade`) |
| Terms of Service URL | `https://SEU_DOMINIO/terms` (em português: `/termos`) |
| Business login settings → OAuth redirect URIs | `https://SEU_DOMINIO/api/instagram/callback` |
| Business login settings → Deauthorize callback URL | `https://SEU_DOMINIO/api/webhooks/meta/deauthorize` |
| Business login settings → Data deletion request URL | `https://SEU_DOMINIO/api/webhooks/meta/data-deletion` |
| Instruções de exclusão (se o formulário pedir) | `https://SEU_DOMINIO/data-deletion` (em português: `/exclusao-dados`) |
| Configure webhooks → Callback URL | `https://SEU_DOMINIO/api/webhook` |
| Configure webhooks → Verify token | o valor de `WEBHOOK_VERIFY_TOKEN` |
| App domains | `SEU_DOMINIO` (sem `https://`) |

O painel pode acrescentar uma barra no fim da URL de redirecionamento; o app usa
`https://SEU_DOMINIO/api/instagram/callback` exatamente assim, então a lista precisa ter essa forma.

---

## 3. Chamadas à Meta e permissões

Tudo em `graph.instagram.com` com o token do Instagram da conta, exceto a tela de login e a troca do
código. Código em `lib/meta/client.ts` e `lib/meta/oauth.ts`.

| # | Onde roda | Chamada | Código | Permissão | Fluxo visível |
|---|---|---|---|---|---|
| 1 | Web | Tela `www.instagram.com/oauth/authorize` (`scope` = as três, `enable_fb_login=false`) | `getAuthorizationUrl` | as três | Accounts → Connect Instagram account → Continue with Instagram |
| 2 | Web | `POST api.instagram.com/oauth/access_token` (código → token de 1 h, ID com escopo do app e permissões concedidas) | `exchangeCodeForToken` | nenhuma | volta do login; permissão desligada vira aviso em Contas |
| 3 | Web | `GET /access_token?grant_type=ig_exchange_token` | `getLongLivedToken` | nenhuma | token de 60 dias |
| 4 | Web | `GET /me?fields=id,user_id,username,name,profile_picture_url` | `getUserInfo` (login e `/api/instagram/profile`) | **instagram_business_basic** | conta em Contas com @, nome e foto |
| 5 | Web | `POST /{user-id}/subscribed_apps` (`comments`, `messages`, `messaging_postbacks`, `message_echoes`) | `subscribeInstagramAccountToWebhooks` | instagram_business_manage_comments, instagram_business_manage_messages | sem isso nenhuma automação recebe eventos |
| 5b | Web | `GET /{user-id}/subscribed_apps` | `getInstagramAccountSubscriptions` | a do token | o que a Meta confirma, no Diagnóstico e no botão **Verificar notificações** (`/admin` → cliente) |
| 6 | Web | `GET /me/media?fields=…` | `getUserMedia*` (`/api/instagram/posts`) | **instagram_business_basic** | grade de posts e reels no editor ("Specific posts") |
| 7 | Worker | `POST /{comment-id}/replies` | `sendCommentReply` | **instagram_business_manage_comments** | resposta pública |
| 8 | Worker | `GET /{comment-id}?fields=id,hidden,replies{from}` | `getCommentState` | instagram_business_manage_comments | com espera: não responder comentário apagado nem já respondido |
| 9 | Worker (a cada 5 min) | `GET /{media-id}/comments?fields=id,text,timestamp,from,replies{from}` | `getRecentMediaComments` | instagram_business_manage_comments | responde comentários que o webhook não entregou |
| 10 | Worker | `POST /{user-id}/messages` com `recipient.comment_id` (texto ou botões) | `sendPrivateReply*` | **instagram_business_manage_messages** | a DM para quem comentou |
| 11 | Worker | `POST /{user-id}/messages` com `recipient.id` (texto, botões de link e de toque, imagem, vídeo) | `sendDirectMessage*`, `sendDirectAttachment` | **instagram_business_manage_messages** | respostas no Direct e a stories |
| 12 | Worker | `GET /{igsid}?fields=username` | `getRecipientUsername` | instagram_business_manage_messages | `{username}` na mensagem |
| 13 | Worker | `GET /{igsid}?fields=is_user_follow_business` | `getUserFollowStatus` | instagram_business_manage_messages | só "Exigir que siga" (fora do vídeo) |
| 14 | Rotina (a cada 5 min) | `GET /me/media` | `getUserMedia` (`attach-next-reel`) | instagram_business_basic | automação "próximo reel" |
| 15 | Rotina diária | `GET /refresh_access_token?grant_type=ig_refresh_token` | `refreshLongLivedToken` | o token da conta | renova os 60 dias |
| 16 | Rotina diária | nenhuma chamada à Meta | `purge-data` | — | retenção e exclusões pendentes |

**De fora para dentro:** webhooks em `POST /api/webhook` (assinatura `X-Hub-Signature-256` conferida com o
segredo do app) e os callbacks de desautorização e exclusão (`signed_request` conferido com o mesmo
segredo). Campos de webhook e permissões, pela tabela da Meta para o login do Instagram: `comments` →
`instagram_business_manage_comments`; `messages` e `messaging_postbacks` →
`instagram_business_manage_messages`; `message_echoes` → listado pela Meta com
`instagram_business_manage_comments`.

### 3.1 Comentários chegam e mensagens não: confira nesta ordem

1. `/admin` → Diagnóstico → **Notificações da Meta (últimas 24 h)**: se nenhuma mensagem chegou, a Meta
   não mandou; se chegou e foi descartada, o ID aparece com a proposta de mapeamento.
2. `/admin` → cliente → contas → **Verificar notificações**: deve confirmar `comments`, `messages`,
   `messaging_postbacks` e `message_echoes`.
3. **API setup with Instagram login → Configure webhooks:** os campos ligados **nessa aba**.
4. **Testadores:** quem manda a DM precisa ser Testador do Instagram aceito enquanto o app não tem Advanced
   Access.
5. **Outro app dono das conversas:** no Meta Business Suite, Configurações → roteamento de conversas. Quem
   não controla a conversa recebe `standby` em vez de `messages`.
6. **Permitir acesso às mensagens** ligado no app do Instagram.

---

## 4. Justificativas (cole em inglês)

### instagram_business_basic

> Our app is a reply-automation tool for Instagram professional accounts. Businesses connect their account
> with Instagram's business login. We use instagram_business_basic to read the connected account's
> professional account ID, username, name and profile picture, shown on our Accounts page so the business
> knows which account is connected, and to list the account's own posts and reels so the business can
> choose which posts an automation runs on. We only read the connected account's own profile and media. The
> screencast shows the Instagram login, the account appearing on the Accounts page right after, and the
> grid of the account's posts and reels in the automation editor.

### instagram_business_manage_comments

> We use instagram_business_manage_comments to receive webhooks for new comments on the connected account's
> own posts and reels, check them for the keyword the business configured, and post a public reply to the
> comment on behalf of the business when the business turns that option on. Before a delayed reply we read
> the comment to avoid replying twice or replying to a deleted comment. We do not hide or delete comments,
> and we do not read comments on media the business does not own. The screencast shows a second account
> commenting the keyword and the public reply appearing under the comment.

### instagram_business_manage_messages

> We use instagram_business_manage_messages so the business can respond automatically to people who start an
> interaction with its Instagram account: a private reply to a person who commented a keyword on the
> business's post, and an automatic reply to direct messages and story replies that contain a keyword the
> business configured. Every message is a response to that person's own comment, story reply or message,
> within Meta's messaging windows. We receive messaging webhooks (messages, button taps and the echoes of
> messages the business sends) only to trigger these replies and to pause automatic replies while a person
> from the business is talking to the customer. The screencast shows the private reply sent after a comment,
> the reply to a direct message and the reply to a story reply.

---

## 5. Conta do revisor

Crie (ou reinicie) a conta com:

```bash
npm run review-account -- --email reviewer@SEU_DOMINIO --password 'uma senha longa'
```

No Coolify, rode no terminal do contêiner do **web**. O script cria ou reinicia o cliente com o e-mail já
confirmado, o espaço ativo e o idioma em inglês; o login não tem anti-robô (o Turnstile só aparece no
cadastro). A conta de revisão **fica sem Instagram conectado**.

Cole no campo **App Review → Instructions**:

> **Test credentials.** Sign in at https://SEU_DOMINIO/login with e-mail `reviewer@SEU_DOMINIO` and
> password `(a senha)`. The interface language is English (Language selector at the bottom of the menu).
>
> **What the test login shows.** The dashboard and the Instagram connection screen: go to Accounts →
> "Connect Instagram account". Our page lists the three permissions we request and why; "Continue with
> Instagram" opens Instagram's business login, where the person signs in with Instagram and turns the
> permissions on. No Facebook account or Page is needed. No Instagram account is connected to this test
> login.
>
> **The complete flow is in the screencast**, recorded with a real Instagram professional account of our own
> business (@primus3d_): Instagram's login with the permission toggles, the account appearing on the
> Accounts page, the grid of its posts and reels in the automation editor, a comment with the keyword LINK
> receiving the public reply and the private reply with the link, a direct message with PRICE and a story
> reply receiving automatic replies, the DM Logs, and disconnecting the account, which deletes it and its
> data.
>
> **Data deletion.** Accounts → trash icon deletes the account and its data. Removing our app in Instagram
> (Settings → Apps and websites) triggers our deauthorize and data deletion callbacks. Instructions:
> https://SEU_DOMINIO/data-deletion. Privacy Policy: https://SEU_DOMINIO/privacy.

Depois da aprovação, desative a conta: `npm run user -- disable reviewer@SEU_DOMINIO`.

---

## 6. Tratamento de dados (rascunho das respostas)

Marquei com **[CONFIRMAR]** o que só você sabe.

**Data processors / service providers with access to Platform Data:** Yes.
- Hosting of the application, database and queue: **Hostinger**, VPS with servers in **Boston, United
  States** (`processors.hosting`).
- E-mail delivery: **Resend, Inc.** (United States) (`processors.email`). O provedor de e-mail recebe só o
  e-mail e o nome dos clientes, nunca dados da Meta; se o formulário perguntar só por quem acessa
  *Platform Data*, ele não entra.
- Bot protection on sign-up: **Cloudflare, Inc.** / Turnstile (United States) (`processors.antiBot`). Não
  recebe dados da Meta (só o IP de quem se cadastra); mesma observação do e-mail.

**Responsible entity:** {razão social de `config/brand.ts`}, CNPJ {cnpj}, Brazil.

**Country where Platform Data is stored:** United States: servers in **Boston** (Hostinger VPS). The
Privacy Policy describes this international transfer and its legal basis (LGPD, art. 33).

**Requests from public authorities in the past 12 months:** No. **[CONFIRMAR]**

**Policies and processes for public authority requests** (marque o que for verdade para você):

> We disclose data only when legally required by a valid order from a Brazilian authority. Every
> request is reviewed for legality before any disclosure; we challenge requests that are unlawful or
> overbroad, disclose the minimum data required, and keep a record of each request and response.
> **[CONFIRMAR]**

**Data deletion:**
> Customers delete an Instagram account and all its data at any time (Accounts → trash icon). Removing
> our app in Instagram triggers our deauthorize and data deletion callbacks, processed automatically.
> People who interacted with a customer’s account can request deletion by e-mail to our data protection
> officer. Retention periods are listed in the Privacy Policy.

---

## 7. Roteiro do vídeo

Regras: interface em inglês, sem cortes dentro de um fluxo, cursor visível, 1080p, legendas em inglês na
edição. Se o formulário pedir um vídeo por permissão, recorte os trechos indicados, mantendo as cenas 3 e 4
(login e permissões) em todos.

**Antes de gravar** (no **seu próprio espaço**, não na conta de revisão):
- mude o idioma da interface para **English** (seletor no rodapé do menu);
- em Accounts, **desconecte @primus3d_** (lixeira), para o vídeo mostrar o login completo. A lixeira apaga
  também as automações e os registros dessa conta no app;
- **saia do Instagram no navegador** em que vai gravar (instagram.com → sair), para a tela de login do
  Instagram aparecer inteira;
- grave as cenas 1 a 5. Pause e, fora da gravação, crie três automações em inglês, no modo **Direct**, sem
  "Require follow" e com **Wait before answering → Right away**:
  - Comments: palavra-chave **LINK**, DM com um link e resposta pública ligada (duas variações);
  - Stories: qualquer resposta ao story;
  - Direct: palavra-chave **PRICE**;
  depois retome da cena 6. Não corte dentro das cenas 7 a 11;
- deixe a segunda conta (Testadora do Instagram) aberta no celular, espelhado, ou em outro navegador;
- confira a seção 0.

| # | O que mostrar | Legenda (EN) | Permissão |
|---|---|---|---|
| 1 | Página inicial em inglês; abrir **Privacy Policy** e rolar até a tabela de permissões; mostrar **Data deletion** | "This is our website. The privacy policy explains which Instagram data we use, why, for how long, and how to delete it." | — |
| 2 | **Sign in** com a sua conta (seu espaço) | "The business owner signs in to the dashboard." | — |
| 3 | **Accounts → Connect Instagram account**: a página lista as três permissões e o motivo de cada uma; clicar **Continue with Instagram** | "Before connecting, our page explains each permission we request." | as três |
| 4 | Tela do **Instagram**: entrar como **@primus3d_** (usuário e senha do Instagram); na tela de consentimento com o nome **ChatIntegrAI**, mostrar a lista de permissões com as **chaves** ligadas, passar o cursor por cada uma e clicar **Allow** | "The owner signs in with Instagram. Instagram shows the permissions ChatIntegrAI requests, each with its toggle, and the owner allows them." | as três |
| 5 | De volta em **Accounts**: @primus3d_ com foto, @ e nome, **Active** | "The connected Instagram professional account is shown with its username, name and profile picture." | instagram_business_basic |
| 6 | **Automations → Comments →** a automação **LINK**: palavra-chave, modo Direct, resposta pública, prévia; abrir "Specific posts" e mostrar a grade de posts e reels | "The owner sets up a Comments automation: keyword LINK, a DM with a link, and a public reply. The editor lists the account's own posts and reels." | instagram_business_basic |
| 7 | Na segunda conta: comentar **LINK** num post de @primus3d_ | "Another Instagram user comments LINK on the business's post." | instagram_business_manage_comments |
| 8 | No post: a **resposta pública** aparece sob o comentário | "Our app posts the public reply under the comment." | instagram_business_manage_comments |
| 9 | Na segunda conta: a **DM** chega com o botão do link; tocar e abrir | "The commenter receives a private reply with the link button." | instagram_business_manage_messages |
| 10 | Segunda conta manda **PRICE** por DM; a resposta chega | "A direct message containing PRICE receives an automatic reply." | instagram_business_manage_messages |
| 11 | Segunda conta **responde ao story** de @primus3d_; a resposta chega | "A reply to the business's story receives an automatic reply." | instagram_business_manage_messages |
| 12 | **DM Logs**: as linhas **Sent** dos três casos | "Every automatic reply is logged with its status." | — |
| 13 | **Accounts → lixeira**, confirmar; a conta some; abrir **Data deletion** | "Disconnecting the account deletes it and its data. Removing the app in Instagram triggers our deletion callback." | — |

Dicas que evitam reprovação:
- **Não corte** entre a ação da segunda conta e o resultado (cenas 7–11). Se a DM demorar, deixe rodar.
- A cena 4 é a que mais reprova: o revisor precisa ver a tela do Instagram com o nome do app e as
  permissões. Se o Instagram pular a tela porque você já autorizou antes, remova o app em Instagram →
  Configurações → Apps e sites e grave de novo.
- Não mostre dados de pessoas reais além de @primus3d_ e da segunda conta.
- A cena 13 apaga a conta e os dados dela no app; depois do vídeo, reconecte @primus3d_ e recrie as
  automações.

---

## 8. Depois do envio

- Resposta típica em 3 a 10 dias úteis. Se reprovar, a Meta diz a permissão e o motivo: corrija o vídeo ou
  a justificativa daquela permissão e reenvie só ela.
- Motivos comuns: permissão sem aparecer no vídeo; vídeo sem a tela de login e permissões do Instagram; DM
  não aparecendo; política sem explicar uso, retenção e exclusão.
- Depois da aprovação e do modo Live, cada cliente conecta o próprio Instagram em Accounts. A conta precisa
  ser profissional (Business ou Creator); não precisa de Página do Facebook.
