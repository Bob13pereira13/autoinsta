# Guia de configuração e Meta App Review

Este guia cobre o que fazer no painel **Meta for Developers** para colocar o app em produção e passar no
App Review. Ele parte da configuração que o seu app usa: **"API setup with Unified login"** (Facebook
Login for Business com ativos do Instagram e token de usuário do sistema que não expira). Ao final, há
notas para apps antigos que ainda usam o "Instagram login".

> **Antes de tudo, o que o código não resolve sozinho.** Para atender clientes que não são testadores
> do app, você precisa de **Advanced Access** em cada permissão. A Meta só concede isso depois da
> **verificação da empresa** (Business Verification, com CNPJ) e com o app em modo **Live**. Sem essas
> duas coisas, só contas com função no app (administradores, desenvolvedores e testadores) conseguem
> conectar o Instagram, por melhor que seja o vídeo.

Em todo o guia, troque `https://app.suaempresa.com.br` pelo domínio real (o mesmo de `NEXTAUTH_URL`).

---

## 0. Checklist antes de enviar

- [ ] App publicado em um domínio **HTTPS** próprio, com `NEXTAUTH_URL` apontando para ele.
- [ ] `config/brand.ts` preenchido: razão social, CNPJ, endereço, e-mail de suporte e e-mail do encarregado.
      Na área de gestão (`/admin` → **Diagnóstico**, só para os e-mails de `ADMIN_EMAILS`) aparece o que
      ainda está como `[PREENCHER]`.
- [ ] `/privacidade`, `/termos` e `/exclusao-dados` abrindo sem login.
- [ ] Worker rodando (`npm run worker`) e rotina diária rodando (Vercel Cron ou `scripts/cron.sh`).
- [ ] Nenhum valor de exemplo do `.env.example` nos segredos: em produção o app web e o worker **se
      recusam a iniciar** se `NEXTAUTH_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY`, `FACEBOOK_APP_SECRET`,
      `INSTAGRAM_APP_SECRET` ou `WEBHOOK_VERIFY_TOKEN` estiverem com o valor de exemplo (a mensagem no log
      diz qual variável trocar).
- [ ] Variáveis da Meta configuradas: `META_UNIFIED_LOGIN_URL` (ou `META_APP_ID` + `META_LOGIN_CONFIG_ID`),
      `FACEBOOK_APP_SECRET` e `WEBHOOK_VERIFY_TOKEN`.
- [ ] **Verificação da empresa** concluída no portfólio empresarial (Configurações do negócio → Central de
      segurança → Verificação).
- [ ] No app: ícone de **1024×1024**, categoria, e-mail de contato, URL da Política de Privacidade, URL dos
      Termos e URL de exclusão de dados preenchidos (Configurações do app → Básico).
- [ ] Uma conta Instagram **profissional** (Business ou Creator) para a demonstração, já vinculada ao
      portfólio, e uma **segunda conta** do Instagram para comentar e receber a DM.
- [ ] Na conta da demonstração, no app do Instagram: Configurações → Mensagens e respostas a stories →
      Controles de mensagens → **Ferramentas conectadas → Permitir acesso às mensagens** ativado.
      Sem isso, a DM não é enviada.
- [ ] Uma conta de acesso para os revisores (seção 4).
- [ ] Volume persistente de mídia montado no app web (`UPLOADS_DIR`, ver README) e o domínio servindo
      `/media/...` sem login: a Meta baixa as imagens e vídeos das DMs por essa URL pública.
- [ ] Para gravar o vídeo de Stories: a segunda conta deve ser **pública** (a Meta só avisa menções em
      stories de contas públicas) e a conta de demonstração deve ter um story publicado nas últimas 24 h.

---

## 1. URLs para colar no painel da Meta

| O quê | URL | Onde colar |
|---|---|---|
| **OAuth Redirect URI** | `https://app.suaempresa.com.br/api/instagram/callback` | Facebook Login for Business → Settings → **Valid OAuth Redirect URIs** |
| **Webhook Callback URL** | `https://app.suaempresa.com.br/api/webhook` | Caso de uso "Gerenciar mensagens e conteúdo no Instagram" → API setup with Unified login → **Configure webhooks** |
| **Verify token** do webhook | o valor de `WEBHOOK_VERIFY_TOKEN` | no mesmo lugar, campo *Verify token* |
| **Política de Privacidade** | `https://app.suaempresa.com.br/privacidade` | Configurações do app → Básico → *Privacy policy URL* |
| **Termos de Uso** | `https://app.suaempresa.com.br/termos` | Configurações do app → Básico → *Terms of Service URL* |
| **Data Deletion (callback)** | `https://app.suaempresa.com.br/api/webhooks/meta/data-deletion` | Configurações do app → Básico → *User data deletion* → **Data deletion callback URL** (e também em Facebook Login for Business → Settings, se o campo aparecer) |
| **Deauthorize callback** | `https://app.suaempresa.com.br/api/webhooks/meta/deauthorize` | Facebook Login for Business → Settings → *Deauthorize callback URL* |
| Página de status da exclusão | `https://app.suaempresa.com.br/exclusao-dados` | não precisa colar: o callback devolve esse link com o código de confirmação |
| Site do app | `https://app.suaempresa.com.br` | Configurações do app → Básico → *Site URL* / *App domains*: `app.suaempresa.com.br` |

O painel da Meta muda de nome e de posição com frequência. Se um campo não estiver exatamente onde a
tabela indica, procure pelo nome em inglês entre parênteses.

**Campos do webhook a assinar:** `comments`, `messages`, `messaging_postbacks` e `messaging_seen`.
O app também assina esses campos em cada conta conectada; os dois últimos fazem funcionar os botões da
DM (seguir para receber o link, botão de abrir) e o envio automático após a leitura.

**Teste do webhook:** clique em *Test* ao lado de `comments` e depois em **Send to My Server**. Um evento
aparece em `/admin` → Diagnóstico. Em modo de desenvolvimento, a Meta só entrega eventos reais de contas com
função no app.

---

## 2. Configuração de login (Unified login)

1. No caso de uso **"Gerenciar mensagens e conteúdo no Instagram"**, abra **API setup with Unified
   login → Configure your app → Create new configuration**.
2. Tipo de token: **System-user access token**; expiração: **Never**; ativo obrigatório: **Instagram account**.
3. Permissões: mantenha apenas **`instagram_basic`**, **`instagram_manage_comments`** e
   **`instagram_manage_messages`**. Não inclua permissões de anúncios, de publicação nem
   **`instagram_manage_insights`**: o app não as usa (não lê métricas nem número de seguidores), e cada
   permissão a mais precisa de justificativa e de vídeo. Se uma configuração antiga tiver
   `instagram_manage_insights`, remova-a antes de enviar o App Review.
4. **Inclua `business_management`.** O editor do Unified login não oferece essa permissão. Adicione o
   produto **Facebook Login for Business**, abra **Configurations**, clique em **Edit** na mesma
   configuração (mantendo o mesmo ID) e inclua `business_management`. Sem ela o login conclui, mas o token
   não enxerga nenhuma conta do Instagram e a conexão falha com "Nenhuma conta do Instagram foi atribuída
   a este login". Segundo quem já passou por isso, a Meta só mantém `business_management` no token quando
   o app tem **Advanced Access em `public_profile`**. Peça os dois no App Review.
5. Copie a URL de login da configuração e coloque em `META_UNIFIED_LOGIN_URL` (ou copie o *Configuration
   ID* para `META_LOGIN_CONFIG_ID` e o *App ID* para `META_APP_ID`). O app usa o `client_id` e o
   `config_id` dessa URL e sempre substitui `redirect_uri` e `state` pelos dele.

**`pages_show_list` / `pages_read_engagement` não são necessárias.** O Unified login não usa Página do
Facebook: a conta é localizada por `/me/assigned_instagram_accounts`. Pedir permissões que o vídeo não
demonstra é um dos motivos mais comuns de reprovação.

---

## 3. Justificativas para o formulário do App Review

Cole o texto em **inglês** no formulário (os revisores leem em inglês). A versão em português serve
como referência para você.

### `instagram_basic`

**EN**

> We use instagram_basic to identify the Instagram professional account the business connected through
> our login configuration (account ID, username, name and profile picture) and to list that account's own
> posts and reels in our dashboard, so the business owner can choose which post or reel an automation
> applies to. With this permission we only read the connecting account's own profile and media. The only
> data we read about another person is the username of someone who comments on or messages the
> connected account, used solely to personalize the automated reply ({username}) and kept in that
> account's DM log; we never read other users' media. The screencast shows the account appearing in the Accounts tab after login and the
> post grid listing the account's posts and reels when an automation is created.

**PT**

> Usamos instagram_basic para identificar a conta profissional do Instagram que a empresa conectou pelo
> nosso login (ID, nome de usuário, nome e foto de perfil) e para listar os posts e reels da própria
> conta no painel, para o dono escolher em qual post ou reel a automação vai funcionar. Com esta permissão
> lemos apenas o perfil e as mídias da própria conta conectada. O único dado que lemos de outra pessoa é
> o nome de usuário de quem comenta ou envia mensagem para a conta conectada, usado só para personalizar
> a resposta automática ({username}) e guardado no registro de DMs dessa conta; nunca lemos mídias de
> outros usuários. O vídeo mostra a conta
> aparecendo na aba Contas após o login e a grade de publicações e reels ao criar uma automação.

### `instagram_manage_comments`

**EN**

> When someone comments on a post or reel of the connected account, we receive the comment through the
> comments webhook and check it against the keywords the account owner configured (for example "LINK").
> If it matches and the owner enabled it, we post one public reply under that comment (for example
> "Sent you a DM!"). We also read the comments of the account's own media to recover comments a webhook
> may have missed. We only act on comments on the connected account's own posts and reels, never on
> other accounts' content, and we never hide or delete comments. The screencast shows a comment with the
> keyword and the public reply appearing under it.

**PT**

> Quando alguém comenta em um post ou reel da conta conectada, recebemos o comentário pelo webhook de
> comentários e verificamos se ele contém a palavra-chave configurada pelo dono (por exemplo "LINK"). Se
> contiver e o dono tiver ativado, publicamos uma resposta pública sob o comentário (por exemplo "Te mandei
> uma DM!"). Também lemos os comentários das mídias da própria conta para recuperar comentários que o
> webhook não entregou. Atuamos apenas em comentários nos posts e reels da própria conta conectada, nunca
> em conteúdo de outras contas, e nunca ocultamos ou apagamos comentários. O vídeo mostra um comentário com
> a palavra-chave e a resposta pública aparecendo.

### `instagram_manage_messages`

**EN**

> We use instagram_manage_messages to answer people who start a conversation with the business, with
> content the business configured in our dashboard. There are three cases, each set up as a separate
> automation: (1) Comments: after a person comments the configured keyword on the business's post or
> reel, we send that person a single private reply (private replies API, using the comment ID); if the
> person taps the button in that reply, we send the requested link and, optionally, images or a video the
> business uploaded. (2) Stories: when a person replies to one of the business's stories (message webhook
> with reply_to.story) or mentions the business in their own story (story_mention attachment), we reply
> by DM with the configured message. (3) Direct: when a person sends the business a direct message that
> contains a configured keyword, or optionally any message, we reply with the configured message.
> Images and videos are sent as message attachments by public URL, only inside the conversation the
> person opened and within the 24-hour messaging window. To avoid spam, each incoming comment or message
> triggers at most one automation; automations without a keyword answer the same person at most once per
> configurable interval (24 hours by default) and stay silent for 24 hours after a human from the business
> replies to that person (detected from message echoes), so automation never talks over a person. We
> deduplicate retries and count every API call (text, each image, each video) against an hourly rate
> limit per account. We do not read or display the business's Instagram conversations: the permission is
> used only to send these automatic replies. The screencast shows each case: the DM after a comment (with
> an image after the button), a reply to a story, a story mention, a direct message with a keyword, and the
> delivery log.

**PT**

> Usamos instagram_manage_messages para responder pessoas que iniciam uma conversa com a empresa, com o
> conteúdo que a empresa configurou no painel. São três casos, cada um configurado como uma automação
> separada: (1) Comentários: depois que a pessoa comenta a palavra-chave no post ou reel da empresa,
> enviamos uma única resposta privada (API de respostas privadas, com o ID do comentário); se a pessoa tocar
> no botão dessa resposta, enviamos o link pedido e, se configurado, imagens ou um vídeo enviados pela
> empresa. (2) Stories: quando a pessoa responde a um story da empresa (webhook de mensagem com
> reply_to.story) ou marca a empresa no story dela (anexo story_mention), respondemos por DM com a mensagem
> configurada. (3) Direct: quando a pessoa manda uma DM com uma palavra-chave configurada, ou opcionalmente
> qualquer mensagem, respondemos com a mensagem configurada. Imagens e vídeos são enviados como anexos de
> mensagem por URL pública, só dentro da conversa que a pessoa abriu e na janela de 24 horas. Para evitar
> spam, cada comentário ou mensagem dispara no máximo uma automação; automações sem palavra-chave respondem
> a mesma pessoa no máximo uma vez por intervalo configurável (24 horas por padrão) e ficam em silêncio por
> 24 horas depois que alguém da empresa responde essa pessoa (detectado pelos echoes de mensagem), para a
> automação nunca atropelar um atendente. Eliminamos duplicidades e contamos cada chamada à API (texto,
> cada imagem, cada vídeo) no limite por hora de cada conta. Não lemos nem exibimos as conversas do
> Instagram da empresa: a permissão é usada só para enviar essas respostas automáticas. O vídeo mostra cada
> caso: a DM depois do comentário (com uma imagem depois do botão), a resposta a um story, a menção em story,
> uma DM com palavra-chave e o registro de envios.

### `business_management` (obrigatória no Unified login)

**EN**

> Our login configuration issues a business integration system-user token for the client's business
> portfolio. We use business_management only to find which Instagram account the business assigned to our
> app during login (GET /me/assigned_instagram_accounts), so we can attach that account to the business's
> workspace. We do not create, modify or read any other business assets, ad accounts, pages or people. The
> screencast shows the asset selection during login and the selected Instagram account appearing in
> the Accounts tab right after.

**PT**

> Nossa configuração de login gera um token de usuário do sistema para o portfólio empresarial do cliente.
> Usamos business_management apenas para descobrir qual conta do Instagram a empresa atribuiu ao nosso app
> durante o login (GET /me/assigned_instagram_accounts) e vinculá-la ao espaço de trabalho da empresa. Não
> criamos, alteramos nem lemos outros ativos do portfólio, contas de anúncios, páginas ou pessoas. O vídeo
> mostra a seleção do ativo durante o login e a conta escolhida aparecendo na aba Contas logo depois.

### `public_profile` (Advanced Access)

**EN**

> Granted by default with Facebook Login. We request Advanced Access because Meta only keeps
> business_management on the login token for apps with Advanced Access to public_profile. We do not store
> or display the person's Facebook profile; the login is used only to authorize the business's Instagram
> account.

---

## 4. Instruções e credenciais para os revisores

Crie uma conta só para a revisão (não use a sua):

```bash
npm run user -- create revisor.meta@suaempresa.com.br --name "Meta Reviewer" --workspace "Meta Review" --no-email
```

Abra o link impresso, defina a senha e conecte antes a conta Instagram de demonstração (assim o revisor
encontra tudo pronto). Contas criadas pelo comando (ou em `/admin` → Novo cliente) já entram **Ativas**;
não use o cadastro público para o revisor, porque ele ficaria aguardando a sua aprovação. No campo **App Review → Instructions** cole (em inglês):

> Test login: https://app.suaempresa.com.br/login
> E-mail: revisor.meta@suaempresa.com.br — Password: (the password you set)
>
> The Instagram professional account @SUA_CONTA_DEMO is already connected and active (Accounts tab). Automations has three tabs, one per channel; three automations are already active:
> - Comments: keyword LINK on any post. From any other Instagram account, comment LINK on a post of
>   @SUA_CONTA_DEMO: the commenter receives a DM with a button; after tapping it they receive the link and
>   an image, and a public reply is posted under the comment.
> - Stories: keyword PRICE. Reply PRICE to the current story of @SUA_CONTA_DEMO: you receive a DM.
>   A second Stories automation answers mentions: mention @SUA_CONTA_DEMO in a story from a public
>   account and you receive a thank-you DM (once per person every 24 hours).
> - Direct: keyword HOURS. Send HOURS by DM to @SUA_CONTA_DEMO: you receive the opening hours.
> Every send is listed under DM Logs.
> The interface language can be switched to English in Settings → Interface language.

Antes de enviar, deixe criadas e ativas na conta de demonstração as três automações citadas acima
(Comentários com `LINK` e uma imagem; Stories com duas automações — uma com a palavra-chave `PRICE` para
respostas ao story e outra **sem palavra-chave, só com menções** ligadas; Direct com `HOURS`) e um story
publicado. Automações sem palavra-chave respondem a mesma pessoa uma vez a cada 24 h e ficam quietas por
24 h se alguém da conta conversou com ela: para regravar, use outra conta de teste ou espere. Lembre de **remover essa conta** depois da aprovação (`npm run user -- disable revisor.meta@...`).

---

## 5. Roteiro do vídeo (screencast)

Regras da Meta para o vídeo: mostrar **cada permissão** sendo usada de verdade, com contas reais, do
início ao fim. A Meta pede a interface **em inglês** ou com legendas; por isso o seletor de idioma
continua disponível. Grave em 1080p, sem cortes no meio de um fluxo, com o cursor visível. Use legendas
na própria edição (as frases sugeridas estão entre aspas). Duração ideal: 3 a 5 minutos.

**Preparação (fora do vídeo):** app em modo Live (ou contas com função no app), worker rodando, conta de
demonstração **desconectada** (para mostrar o login completo), um post ou reel recente na conta, a
segunda conta logada no celular, e o espelhamento da tela do celular (ou um segundo navegador com
instagram.com) pronto.

| # | Tempo | O que mostrar | Legenda sugerida (EN) | Permissão |
|---|---|---|---|---|
| 1 | 0:00 | Página inicial do site → **Política de Privacidade** (rolar até a tabela de permissões) → voltar | "This is our website. The privacy policy explains how Instagram data is used and deleted." | — |
| 2 | 0:20 | **Login** com e-mail e senha da conta de demonstração. Em Configurações, trocar o idioma para **English** | "The business owner signs in to the dashboard. The UI is switched to English for this review." | — |
| 3 | 0:40 | **Accounts** → **Connect Instagram account**. Mostrar a janela da Meta: login, **lista de permissões** e **seleção da conta do Instagram** (ativo) no portfólio. Conceder tudo | "The owner connects the Instagram professional account through Meta's login. The requested permissions and the selected Instagram account are shown here." | instagram_basic, business_management |
| 4 | 1:20 | De volta em **Accounts**: a conta **@SUA_CONTA_DEMO** conectada e **Active** | "The assigned Instagram account is now connected to this workspace and active." | instagram_basic, business_management |
| 5 | 1:35 | **Automations** → aba **Comments** → **New automation**: em "When", escolher **Specific posts** — a grade lista os **posts/reels da conta**; marcar um; palavra-chave `LINK`; ligar **opening DM with a button**; mensagem principal com um link e **uma imagem** enviada pelo botão "+ Add image or video"; ligar **reply to the comment publicly**; mostrar o resumo no topo e a prévia; salvar | "The owner creates a Comments automation on one of the account's own reels: keyword LINK, an opening DM with a button, then the link and an image, plus an optional public reply." | instagram_basic |
| 6 | 2:30 | **Na segunda conta** (celular/outro navegador), comentar `LINK` no reel | "A different Instagram user comments LINK on that reel." | instagram_manage_comments |
| 7 | 2:45 | Na segunda conta: a **DM de abertura** chegando; tocar no botão; chegam o **link e a imagem** | "The commenter receives a private reply; after tapping the button, the link and the image are delivered." | instagram_manage_messages |
| 8 | 3:10 | No reel: a **resposta pública** sob o comentário | "The public reply is posted under the comment." | instagram_manage_comments |
| 9 | 3:20 | No painel: aba **Stories** → mostrar a automação com `PRICE` (respostas a stories) e a de menções. Na segunda conta: **responder `PRICE` ao story** da conta de demonstração → a DM chega | "Stories automations answer replies to the business's stories. A reply with PRICE receives the price list by DM." | instagram_manage_messages |
| 10 | 3:50 | Na segunda conta (pública): publicar um story **marcando @SUA_CONTA_DEMO** → a DM de agradecimento chega | "When someone mentions the business in their story, they receive a thank-you DM." | instagram_manage_messages |
| 11 | 4:15 | Aba **Direct** → mostrar a automação `HOURS`. Na segunda conta: mandar **HOURS** por DM → a resposta chega | "Direct automations answer direct messages that contain a keyword." | instagram_manage_messages |
| 12 | 4:35 | **DM Logs**: as linhas **Sent** de cada caso (canal, pessoa, mensagem, data) | "Every send is logged with its channel and status." | instagram_manage_messages |
| 13 | 4:50 | **Accounts**: mostrar a chave **Active/Off** (desligar e religar), depois a **lixeira** na conta (ler a confirmação e confirmar) e abrir `/exclusao-dados` | "The owner can pause every automation of an account without deleting anything, or remove the account: its data, including uploaded images and videos, is deleted. Data deletion requests from Meta are handled automatically." | — |

Dicas que evitam reprovação:

- **Não corte** entre a ação da segunda conta e a DM chegando (passos 6–7, 9, 10 e 11): o revisor quer
  ver a causa e o efeito. Se a DM demorar, deixe o vídeo rodando. A menção em story (passo 10) costuma
  levar alguns segundos a mais.
- A duração passa de 5 minutos com os três canais. Se preferir, grave um vídeo por canal (Comentários,
  Stories, Direct), sempre começando pelo login (passo 3).
- Mostre o **nome da permissão** na tela de consentimento (passo 3). Se a tela não listar nomes, use uma
  legenda com os nomes.
- Use um **vídeo por permissão**, se o formulário pedir separado, recortando os passos indicados na
  última coluna — mas mantenha o passo 3 (login) em todos.
- Não mostre dados de pessoas reais além das suas contas de teste.

---

## 6. Depois do envio

- Resposta típica: 3 a 10 dias úteis. Se reprovar, a Meta indica a permissão e o motivo; ajuste o vídeo
  ou a justificativa daquela permissão e reenvie só ela.
- Motivos comuns: permissão pedida sem aparecer no vídeo; vídeo sem o login completo; DM não aparecendo
  no vídeo; política de privacidade sem explicar o uso dos dados; app sem verificação da empresa.
- Depois de aprovado, cada cliente conecta o próprio Instagram em **Contas → Conectar conta do Instagram**,
  escolhendo o portfólio empresarial dele. A conta precisa estar em um portfólio, e o cliente precisa ser
  administrador desse portfólio.

### Problemas conhecidos do Unified login (relatos de outros desenvolvedores, não documentados pela Meta)

- **"Nenhuma conta do Instagram foi atribuída a este login"**: falta `business_management` na
  configuração (seção 2, item 4), ou o app não tem Advanced Access em `public_profile`.
- **Webhooks de comentários chegam, mas os de mensagens não**: houve relato disso com o app em Standard
  Access. Normaliza após o Advanced Access em `instagram_manage_messages`.
- **Pedido de exclusão "não encontrado"**: a Meta não documenta qual ID chega no callback de exclusão
  para esse tipo de login. O app compara com o ID da conta, o ID com escopo do app e o usuário do token;
  um pedido que não bate com nada fica registrado e gera um alerta em `/admin` → Diagnóstico, para
  você verificar manualmente.

---

## Anexo: apps antigos com "Instagram login"

Se o seu app ainda oferecer **API setup with Instagram login**, deixe `META_UNIFIED_LOGIN_URL`,
`META_APP_ID` e `META_LOGIN_CONFIG_ID` vazios e configure `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`.
Diferenças:

- Redirect URI: Instagram → API setup with Instagram login → *Business login settings* → **OAuth redirect URIs**.
- Permissões: `instagram_business_basic`, `instagram_business_manage_comments` e
  `instagram_business_manage_messages` (as justificativas acima valem trocando os nomes; não há
  `business_management`).
- O token dura 60 dias. A rotina diária renova os tokens com 15 dias ou menos de validade (aos 45 dias).
- Não precisa de portfólio empresarial nem de Página do Facebook.
