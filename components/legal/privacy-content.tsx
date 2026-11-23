/**
 * The Privacy Policy, in Portuguese and English. Everything that the code
 * decides is read from the code: the retention periods (lib/privacy/retention.ts),
 * the permissions and what each is for (lib/meta/permissions.ts) and who
 * processes data for us (config/brand.ts, processors). Change the code and the
 * policy follows; __tests__/legal-pages.test.ts checks that both languages
 * say the same things.
 */
import Link from "next/link";
import { brand } from "@/config/brand";
import { createI18n } from "@/lib/i18n";
import { legalPath, type LegalLocale } from "@/lib/legal/paths";
import { PERMISSION_PURPOSE, requestedPermissions } from "@/lib/meta/permissions";
import { isUnifiedLogin } from "@/lib/env";
import { QUEUE_RETENTION, RETENTION_DAYS } from "@/lib/privacy/retention";

const legal = brand.legal;

function Permissions({ locale }: { locale: LegalLocale }) {
  const { t } = createI18n(locale);
  return (
    <table data-policy-permissions>
      <thead>
        <tr>
          <th>{locale === "en" ? "Permission" : "Permissão"}</th>
          <th>{locale === "en" ? "What we use it for" : "Para que usamos"}</th>
        </tr>
      </thead>
      <tbody>
        {requestedPermissions().map((permission) => (
          <tr key={permission}>
            <td>{permission}</td>
            <td>{t(PERMISSION_PURPOSE[permission])}</td>
          </tr>
        ))}
        {isUnifiedLogin() && (
          <tr>
            <td>public_profile</td>
            <td>{t("Part of every Facebook login. This app does not read your Facebook profile.")}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function PrivacyContent({ locale }: { locale: LegalLocale }) {
  return locale === "en" ? <PrivacyEn /> : <PrivacyPt />;
}

function PrivacyPt() {
  const p = brand.processors;
  return (
    <>
      <section>
        <h2>1. Quem somos</h2>
        <p>
          A {brand.name} é operada por <strong>{legal.companyName}</strong>, inscrita no CNPJ sob o nº{" "}
          <strong>{legal.cnpj}</strong>, com sede em {legal.address} (&quot;nós&quot;).
        </p>
        <p>
          Encarregado pelo tratamento de dados pessoais (DPO): <strong>{legal.dpoName}</strong> —{" "}
          <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>. Este é o canal oficial para qualquer pedido
          relacionado aos seus dados.
        </p>
      </section>

      <section>
        <h2>2. A quem esta política se aplica</h2>
        <ul>
          <li>
            <strong>Clientes:</strong> empresas e profissionais que usam a plataforma e conectam uma conta profissional
            do Instagram (Business ou Creator).
          </li>
          <li>
            <strong>Pessoas que interagem com os clientes no Instagram:</strong> quem comenta em posts e reels, responde
            Stories, marca a conta em um story ou envia mensagens diretas para uma conta conectada à plataforma.
          </li>
          <li>
            <strong>Visitantes</strong> deste site.
          </li>
        </ul>
        <p>
          Em relação aos dados dos clientes, atuamos como <strong>controlador</strong>. Em relação aos dados de quem
          interage com as contas dos clientes no Instagram, atuamos como <strong>operador</strong>: tratamos esses dados
          apenas para executar as automações configuradas pelo cliente, que é o controlador desses dados (LGPD, art. 5º,
          VI e VII).
        </p>
      </section>

      <section>
        <h2>3. Dados que coletamos</h2>
        <h3>3.1 Dados de cadastro do cliente</h3>
        <ul>
          <li>Nome e e-mail de acesso.</li>
          <li>Senha, armazenada somente como hash irreversível (scrypt), nunca em texto.</li>
          <li>Nome da empresa e telefone (WhatsApp) informados no cadastro.</li>
          <li>CPF ou CNPJ, apenas se você informar (é opcional).</li>
          <li>
            Versão dos Termos de Uso e desta Política que você aceitou e a data do aceite, além do idioma escolhido na
            interface (para os e-mails).
          </li>
          <li>
            Situação da conta (aguardando aprovação, ativa, desativada ou recusada), com as datas e, em caso de recusa, o
            motivo informado a você.
          </li>
          <li>Espaço de trabalho, função (proprietário, administrador ou membro) e convites enviados.</li>
        </ul>
        <p>
          Para bloquear robôs, o formulário de cadastro usa o <strong>Cloudflare Turnstile</strong>: a Cloudflare recebe o
          seu endereço IP e sinais técnicos do navegador para fazer a verificação. Também usamos o endereço IP, em forma de
          hash irreversível e por no máximo uma hora, para limitar tentativas repetidas de cadastro e de login.
        </p>

        <h3>3.2 Dados da conta do Instagram conectada (dados da Meta)</h3>
        <p>
          A conexão é feita exclusivamente pelo login oficial da Meta.{" "}
          <strong>Nunca pedimos nem armazenamos a senha do Instagram ou do Facebook.</strong> Pedimos apenas as permissões
          abaixo, e você pode revogá-las a qualquer momento:
        </p>
        <Permissions locale="pt-BR" />
        <p>Da conta conectada, guardamos:</p>
        <ul>
          <li>ID da conta profissional do Instagram, nome de usuário e nome;</li>
          <li>
            identificadores técnicos do login (o ID com escopo do app e o ID do usuário do token), usados apenas para
            atender os pedidos de exclusão e de desautorização enviados pela Meta;
          </li>
          <li>o token de acesso, criptografado com AES-256-GCM, e a data de expiração dele, quando houver;</li>
          <li>se as notificações (webhooks) da conta estão ativas e se as automações da conta estão ligadas;</li>
          <li>os IDs e endereços dos posts e reels que você escolheu para cada automação.</li>
        </ul>
        <p>
          A foto de perfil e a lista de posts e reels são consultadas na Meta no momento em que você abre o painel e não
          são copiadas para o nosso banco de dados. Não coletamos métricas da conta (seguidores, alcance, visualizações ou
          outras estatísticas) nem lemos as conversas do Direct.
        </p>

        <h3>3.3 Imagens e vídeos enviados por você</h3>
        <p>
          As imagens e vídeos que você envia no painel para usar nas mensagens das automações ficam no nosso servidor e são
          publicados em um endereço com identificador aleatório, porque a Meta baixa o arquivo por esse endereço no momento
          de entregar a DM. Quem tiver o endereço consegue abrir o arquivo, então não envie material confidencial. Guardamos
          o arquivo, o nome original, o tipo e o tamanho.
        </p>

        <h3>3.4 Dados de quem interage com a conta do cliente (dados da Meta)</h3>
        <ul>
          <li>
            Comentários, respostas a Stories e mensagens diretas que acionam uma automação: o texto, o identificador do
            comentário ou da mensagem, e o identificador e o nome de usuário do autor no Instagram.
          </li>
          <li>
            Registro de cada envio automático: palavra-chave reconhecida, status (enviado, ignorado ou falha) e o motivo,
            para evitar envios duplicados e para o cliente acompanhar os resultados.
          </li>
          <li>
            Antes de uma resposta com espera, consultamos na Meta se o comentário ainda existe e se a conta já o respondeu,
            para não responder duas vezes. Quando a automação exige que a pessoa siga a conta, consultamos na Meta se ela
            segue. Essas consultas não são guardadas.
          </li>
          <li>
            Para não atropelar o atendimento humano: os identificadores das mensagens enviadas pelas automações e a data da
            última mensagem que alguém da conta mandou para cada pessoa.
          </li>
          <li>
            Cliques em links rastreáveis enviados por DM: data e hora, navegador (user agent), página de origem e
            identificadores convertidos em hash irreversível do endereço IP e do destinatário. Não guardamos o IP em si.
          </li>
        </ul>

        <h3>3.5 Dados técnicos</h3>
        <ul>
          <li>As notificações (webhooks) enviadas pela Meta, com a assinatura verificada, como recebidas.</li>
          <li>
            Os eventos na fila de processamento (comentário ou mensagem a responder), até serem processados e pelos prazos
            da seção 7.
          </li>
          <li>Registros operacionais e de erro necessários para manter o serviço funcionando.</li>
          <li>Cookies estritamente necessários (seção 10).</li>
        </ul>
      </section>

      <section>
        <h2>4. Para que usamos os dados e bases legais</h2>
        <ul>
          <li>
            <strong>Prestar o serviço contratado:</strong> autenticar o acesso, conectar o Instagram, identificar
            palavras-chave, enviar respostas e exibir o histórico (execução de contrato, LGPD art. 7º, V).
          </li>
          <li>
            <strong>Executar as automações do cliente</strong> sobre dados de quem interage com a conta dele, conforme as
            instruções do cliente e sob a base legal escolhida por ele como controlador.
          </li>
          <li>
            <strong>Analisar o cadastro e falar com você:</strong> nome, empresa, telefone e, quando informado, CPF/CNPJ
            servem para identificar o cliente, decidir sobre a aprovação (quando ela é exigida), prestar suporte e emitir a
            cobrança (procedimentos preliminares e execução de contrato, art. 7º, V).
          </li>
          <li>
            <strong>Segurança e prevenção de abuso:</strong> verificação de assinaturas, limites de envio, deduplicação,
            verificação anti-robô no cadastro e registro de auditoria das ações da nossa equipe sobre as contas dos clientes
            (legítimo interesse, art. 7º, IX).
          </li>
          <li>
            <strong>Cumprir obrigações legais</strong> (art. 7º, II), incluindo a guarda de registros de acesso a aplicações
            por 6 meses prevista no art. 15 do Marco Civil da Internet (Lei nº 12.965/2014).
          </li>
        </ul>
      </section>

      <section>
        <h2>5. O que não fazemos</h2>
        <ul>
          <li>Não vendemos, alugamos ou licenciamos dados pessoais nem dados obtidos da Meta.</li>
          <li>
            Não usamos dados da Meta para publicidade, criação de perfis, rastreamento entre sites ou treinamento de modelos
            de inteligência artificial.
          </li>
          <li>Não fazemos raspagem de dados (scraping) nem automação de navegador.</li>
          <li>
            Não enviamos mensagens para quem não interagiu com a conta do cliente: cada resposta é disparada por um
            comentário, resposta a story ou mensagem dessa pessoa, dentro das janelas e limites definidos pela Meta.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Compartilhamento</h2>
        <p>Compartilhamos dados apenas com:</p>
        <ul>
          <li>
            <strong>Meta Platforms</strong>, ao chamar a API oficial do Instagram em nome do cliente (por exemplo, para
            enviar uma mensagem).
          </li>
          <li>
            <strong>Hospedagem</strong> da aplicação, do banco de dados e da fila de processamento:{" "}
            {p.hosting ?? "o provedor de servidores em nuvem que contratamos"}.
          </li>
          <li>
            <strong>Envio de e-mails</strong> transacionais (confirmação de cadastro, senha, convites):{" "}
            {p.email ?? "o provedor de e-mail que contratamos"}.
          </li>
          <li>
            <strong>Cloudflare, Inc.</strong>, apenas na verificação anti-robô (Turnstile) do formulário de cadastro.
          </li>
          <li>Autoridades públicas, quando houver obrigação legal ou ordem judicial válida.</li>
        </ul>
        <p>
          Esses fornecedores atuam sob contrato, com obrigações de confidencialidade e segurança. Quando armazenam dados
          fora do Brasil, a transferência internacional segue o art. 33 da LGPD, com cláusulas contratuais e garantias
          adequadas.
        </p>
      </section>

      <section>
        <h2>7. Por quanto tempo guardamos os dados</h2>
        <table data-policy-retention>
          <thead>
            <tr>
              <th>Dado</th>
              <th>Prazo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Conta do Instagram conectada, token, automações, imagens e vídeos, registros de envio, comentários e mensagens
                que acionaram automações, links e cliques
              </td>
              <td>
                Enquanto a conta estiver conectada. Apagados imediatamente quando o cliente remove a conta no painel ou quando
                recebemos um pedido de exclusão da Meta.
              </td>
            </tr>
            <tr>
              <td>Notificações (webhooks) recebidas da Meta</td>
              <td>{RETENTION_DAYS.webhookEvents} dias</td>
            </tr>
            <tr>
              <td>Eventos já processados na fila</td>
              <td>
                Até {QUEUE_RETENTION.finishedJobHours} horas (no máximo os {QUEUE_RETENTION.finishedJobCount} mais
                recentes); eventos que falharam, {QUEUE_RETENTION.failedJobMinutes} minutos
              </td>
            </tr>
            <tr>
              <td>Aviso de que a conta respondeu uma pessoa enquanto uma resposta aguardava</td>
              <td>{QUEUE_RETENTION.echoNoteMinutes} minutos</td>
            </tr>
            <tr>
              <td>Identificadores das mensagens enviadas pelas automações</td>
              <td>{RETENTION_DAYS.botMessages} dias</td>
            </tr>
            <tr>
              <td>Data da última mensagem de um atendente para cada pessoa</td>
              <td>{RETENTION_DAYS.humanActivity} dias</td>
            </tr>
            <tr>
              <td>Imagens e vídeos removidos de uma automação ou de uma automação excluída</td>
              <td>Apagados no momento em que são removidos</td>
            </tr>
            <tr>
              <td>Imagens e vídeos enviados, mas nunca usados em uma automação</td>
              <td>1 dia</td>
            </tr>
            <tr>
              <td>Registros operacionais e de erro</td>
              <td>{RETENTION_DAYS.operationalEvents} dias</td>
            </tr>
            <tr>
              <td>Comprovante de pedido de exclusão (código e status, sem o ID do usuário)</td>
              <td>{RETENTION_DAYS.deletionRequests} dias</td>
            </tr>
            <tr>
              <td>Dados de cadastro do cliente</td>
              <td>Enquanto durar o contrato, e depois pelo prazo necessário ao cumprimento de obrigações legais</td>
            </tr>
            <tr>
              <td>Cadastro cujo e-mail nunca foi confirmado</td>
              <td>7 dias</td>
            </tr>
            <tr>
              <td>Cadastro recusado</td>
              <td>
                30 dias após a recusa. Depois fica só o registro da decisão (data, motivo e o e-mail em hash irreversível).
              </td>
            </tr>
            <tr>
              <td>Registro de auditoria das ações da nossa equipe sobre a sua conta</td>
              <td>Enquanto a conta existir</td>
            </tr>
          </tbody>
        </table>
        <p>A exclusão nos prazos acima é feita automaticamente por uma rotina diária.</p>
      </section>

      <section>
        <h2>8. Seus direitos</h2>
        <p>
          Nos termos do art. 18 da LGPD, você pode pedir: confirmação da existência de tratamento; acesso aos dados;
          correção; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; eliminação; informação
          sobre com quem compartilhamos; e revogação do consentimento, quando ele for a base legal.
        </p>
        <p>
          Envie o pedido para <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>. Respondemos em até 15 dias. Se
          você interagiu com a conta de um cliente no Instagram, também pode procurar o cliente, que é o controlador desses
          dados. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </section>

      <section>
        <h2>9. Como excluir seus dados</h2>
        <ul>
          <li>
            <strong>No painel:</strong> na aba Contas, clique na lixeira ao lado da conta do Instagram. A conta, o token, as
            automações (com as imagens e vídeos delas), os registros de envio, os links, os cliques, as notificações da Meta e
            os registros operacionais ligados à conta são apagados na hora. Desativar a conta (chave Ativa/Desativada) só
            pausa as respostas e não apaga nada.
          </li>
          <li>
            <strong>Pela Meta:</strong> remova o {brand.name} nas configurações do Facebook (Configurações → Integrações
            empresariais) ou do Instagram (Configurações → Permissões de apps e sites). A Meta nos envia um pedido de
            exclusão, apagamos automaticamente os mesmos dados e você recebe um código para acompanhar o pedido em{" "}
            <Link href={legalPath("dataDeletion", "pt-BR")}>{legalPath("dataDeletion", "pt-BR")}</Link>.
          </li>
          <li>
            <strong>Por e-mail:</strong> escreva para <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>. É também o
            caminho para quem comentou ou mandou mensagem para a conta de um cliente e quer a exclusão dos seus dados, e para
            clientes que querem encerrar o cadastro de acesso.
          </li>
        </ul>
      </section>

      <section>
        <h2>10. Cookies</h2>
        <p>
          Usamos apenas cookies estritamente necessários: o de sessão, que mantém você conectado; o de idioma da interface;
          e o de tema (claro ou escuro). Não usamos cookies de publicidade nem de análise de terceiros.
        </p>
      </section>

      <section>
        <h2>11. Segurança</h2>
        <ul>
          <li>Tráfego protegido por HTTPS.</li>
          <li>Tokens do Instagram criptografados em repouso com AES-256-GCM.</li>
          <li>Senhas armazenadas apenas como hash (scrypt) e tentativas de login limitadas.</li>
          <li>Verificação da assinatura de toda notificação e de todo pedido de exclusão enviados pela Meta.</li>
          <li>Acesso aos dados restrito ao espaço de trabalho do cliente e às funções de cada membro.</li>
        </ul>
        <p>
          Em caso de incidente de segurança que possa gerar risco ou dano relevante, comunicaremos os titulares afetados e a
          ANPD, conforme o art. 48 da LGPD.
        </p>
      </section>

      <section>
        <h2>12. Crianças e adolescentes</h2>
        <p>O serviço é destinado a empresas e profissionais maiores de 18 anos.</p>
      </section>

      <section>
        <h2>13. Alterações desta política</h2>
        <p>
          Podemos atualizar esta política. A data da última atualização aparece no topo da página, e mudanças relevantes são
          comunicadas aos clientes por e-mail ou pelo painel.
        </p>
      </section>

      <section>
        <h2>14. Contato</h2>
        <p>
          {legal.companyName}, CNPJ {legal.cnpj}, {legal.address}
          <br />
          Encarregado (DPO): {legal.dpoName}, <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>
        </p>
        <p>
          Veja também os <Link href={legalPath("terms", "pt-BR")}>Termos de Uso</Link> e a página de{" "}
          <Link href={legalPath("dataDeletion", "pt-BR")}>Exclusão de dados</Link>.
        </p>
      </section>
    </>
  );
}

function PrivacyEn() {
  const p = brand.processors;
  return (
    <>
      <section>
        <h2>1. Who we are</h2>
        <p>
          {brand.name} is operated by <strong>{legal.companyName}</strong>, Brazilian taxpayer ID (CNPJ){" "}
          <strong>{legal.cnpj}</strong>, based in {legal.address}, Brazil (&quot;we&quot;).
        </p>
        <p>
          Data protection officer (DPO): <strong>{legal.dpoName}</strong>,{" "}
          <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>. This is the official channel for any request about
          your data.
        </p>
      </section>

      <section>
        <h2>2. Who this policy applies to</h2>
        <ul>
          <li>
            <strong>Customers:</strong> businesses and professionals who use the platform and connect an Instagram
            professional account (Business or Creator).
          </li>
          <li>
            <strong>People who interact with customers on Instagram:</strong> anyone who comments on posts and reels, replies
            to Stories, mentions the account in a story or sends a direct message to an account connected to the platform.
          </li>
          <li>
            <strong>Visitors</strong> to this website.
          </li>
        </ul>
        <p>
          For customer data, we are the <strong>controller</strong>. For the data of people who interact with our
          customers’ accounts on Instagram, we are a <strong>processor</strong>: we process it only to run the automations
          the customer set up, and the customer is the controller of that data (Brazilian General Data Protection Law, LGPD,
          art. 5, VI and VII).
        </p>
      </section>

      <section>
        <h2>3. Data we collect</h2>
        <h3>3.1 Customer account data</h3>
        <ul>
          <li>Name and sign-in e-mail.</li>
          <li>Password, stored only as an irreversible hash (scrypt), never as text.</li>
          <li>Company name and phone number (WhatsApp) given at sign-up.</li>
          <li>Brazilian CPF or CNPJ, only if you provide it (optional).</li>
          <li>
            The version of the Terms of Use and of this Policy you accepted and when, and the interface language you chose
            (for e-mails).
          </li>
          <li>
            Account status (awaiting approval, active, disabled or rejected), with the dates and, if rejected, the reason
            given to you.
          </li>
          <li>Workspace, role (owner, admin or member) and invitations sent.</li>
        </ul>
        <p>
          To block bots, the sign-up form uses <strong>Cloudflare Turnstile</strong>: Cloudflare receives your IP address
          and technical browser signals to run the check. We also use your IP address, as an irreversible hash and for at
          most one hour, to limit repeated sign-up and sign-in attempts.
        </p>

        <h3>3.2 Data of the connected Instagram account (Meta data)</h3>
        <p>
          The connection is made only through Meta’s official login.{" "}
          <strong>We never ask for or store your Instagram or Facebook password.</strong> We ask only for the permissions
          below, and you can revoke them at any time:
        </p>
        <Permissions locale="en" />
        <p>From the connected account, we store:</p>
        <ul>
          <li>the Instagram professional account ID, username and name;</li>
          <li>
            technical login identifiers (the app-scoped ID and the token’s user ID), used only to handle the data deletion and
            deauthorization requests Meta sends;
          </li>
          <li>the access token, encrypted with AES-256-GCM, and its expiry date, if it has one;</li>
          <li>whether the account’s notifications (webhooks) are active and whether its automations are on;</li>
          <li>the IDs and addresses of the posts and reels you chose for each automation.</li>
        </ul>
        <p>
          The profile picture and the list of posts and reels are fetched from Meta when you open the dashboard and are not
          copied to our database. We do not collect account metrics (followers, reach, views or other statistics) and do not
          read Direct conversations.
        </p>

        <h3>3.3 Images and videos you upload</h3>
        <p>
          The images and videos you upload to use in automation messages are stored on our server and published at an
          address with a random identifier, because Meta downloads the file from that address when it delivers the DM.
          Anyone with the address can open the file, so do not upload confidential material. We store the file, its original
          name, type and size.
        </p>

        <h3>3.4 Data of people who interact with the customer’s account (Meta data)</h3>
        <ul>
          <li>
            Comments, story replies and direct messages that trigger an automation: the text, the comment or message ID, and
            the author’s Instagram ID and username.
          </li>
          <li>
            A record of each automatic send: the matched keyword, the status (sent, skipped or failed) and the reason, to
            prevent duplicate sends and so the customer can follow the results.
          </li>
          <li>
            Before a reply that waits, we check with Meta whether the comment still exists and whether the account already
            replied to it, so we never reply twice. When an automation requires the person to follow the account, we check
            with Meta whether they do. These checks are not stored.
          </li>
          <li>
            So that we never talk over a person from the customer’s team: the IDs of the messages the automations sent and
            the date of the last message someone from the account sent to each person.
          </li>
          <li>
            Clicks on trackable links sent by DM: date and time, browser (user agent), referring page, and irreversible hashes
            of the IP address and of the recipient. We do not store the IP address itself.
          </li>
        </ul>

        <h3>3.5 Technical data</h3>
        <ul>
          <li>The notifications (webhooks) Meta sends, with their signature verified, as received.</li>
          <li>Events in the processing queue (a comment or message to answer), until processed and for the periods in section 7.</li>
          <li>Operational and error logs needed to keep the service running.</li>
          <li>Strictly necessary cookies (section 10).</li>
        </ul>
      </section>

      <section>
        <h2>4. Why we use the data, and legal bases</h2>
        <ul>
          <li>
            <strong>To provide the service:</strong> authenticate access, connect Instagram, find keywords, send replies and
            show the history (performance of a contract, LGPD art. 7, V).
          </li>
          <li>
            <strong>To run the customer’s automations</strong> on the data of people who interact with the customer’s
            account, following the customer’s instructions and under the legal basis the customer chose as controller.
          </li>
          <li>
            <strong>To review sign-ups and contact you:</strong> name, company, phone and, if provided, CPF/CNPJ identify the
            customer, support the approval decision (when approval is required), customer support and billing (art. 7, V).
          </li>
          <li>
            <strong>Security and abuse prevention:</strong> signature checks, send limits, de-duplication, the anti-bot check
            at sign-up and an audit log of our team’s actions on customer accounts (legitimate interest, art. 7, IX).
          </li>
          <li>
            <strong>Legal obligations</strong> (art. 7, II), including keeping application access logs for 6 months as
            required by art. 15 of the Brazilian Internet Civil Framework (Law 12,965/2014).
          </li>
        </ul>
      </section>

      <section>
        <h2>5. What we do not do</h2>
        <ul>
          <li>We do not sell, rent or license personal data or data obtained from Meta.</li>
          <li>We do not use Meta data for advertising, profiling, cross-site tracking or training artificial intelligence models.</li>
          <li>We do not scrape data or use browser automation.</li>
          <li>
            We do not message people who did not interact with the customer’s account: every reply is triggered by that
            person’s comment, story reply or message, within the windows and limits set by Meta.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Sharing</h2>
        <p>We share data only with:</p>
        <ul>
          <li>
            <strong>Meta Platforms</strong>, when we call Instagram’s official API on the customer’s behalf (for example, to
            send a message).
          </li>
          <li>
            <strong>Hosting</strong> of the application, database and processing queue:{" "}
            {p.hosting ?? "the cloud server provider we contract"}.
          </li>
          <li>
            <strong>E-mail delivery</strong> of transactional e-mails (sign-up confirmation, password, invitations):{" "}
            {p.email ?? "the e-mail provider we contract"}.
          </li>
          <li>
            <strong>Cloudflare, Inc.</strong>, only for the anti-bot check (Turnstile) on the sign-up form.
          </li>
          <li>Public authorities, when there is a legal obligation or a valid court order.</li>
        </ul>
        <p>
          These providers work under contract, with confidentiality and security obligations. When they store data outside
          Brazil, the international transfer follows art. 33 of the LGPD, with contractual clauses and adequate safeguards.
        </p>
      </section>

      <section>
        <h2>7. How long we keep data</h2>
        <table data-policy-retention>
          <thead>
            <tr>
              <th>Data</th>
              <th>Period</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Connected Instagram account, token, automations, images and videos, send records, comments and messages that
                triggered automations, links and clicks
              </td>
              <td>
                While the account is connected. Deleted immediately when the customer removes the account in the dashboard or
                when we receive a deletion request from Meta.
              </td>
            </tr>
            <tr>
              <td>Notifications (webhooks) received from Meta</td>
              <td>{RETENTION_DAYS.webhookEvents} days</td>
            </tr>
            <tr>
              <td>Processed events in the queue</td>
              <td>
                Up to {QUEUE_RETENTION.finishedJobHours} hours (at most the latest {QUEUE_RETENTION.finishedJobCount}); failed
                events, {QUEUE_RETENTION.failedJobMinutes} minutes
              </td>
            </tr>
            <tr>
              <td>Note that the account answered a person while a reply was waiting</td>
              <td>{QUEUE_RETENTION.echoNoteMinutes} minutes</td>
            </tr>
            <tr>
              <td>IDs of the messages the automations sent</td>
              <td>{RETENTION_DAYS.botMessages} days</td>
            </tr>
            <tr>
              <td>Date of a team member’s last message to each person</td>
              <td>{RETENTION_DAYS.humanActivity} days</td>
            </tr>
            <tr>
              <td>Images and videos removed from an automation, or of a deleted automation</td>
              <td>Deleted when removed</td>
            </tr>
            <tr>
              <td>Images and videos uploaded but never used in an automation</td>
              <td>1 day</td>
            </tr>
            <tr>
              <td>Operational and error logs</td>
              <td>{RETENTION_DAYS.operationalEvents} days</td>
            </tr>
            <tr>
              <td>Record of a deletion request (code and status, without the user ID)</td>
              <td>{RETENTION_DAYS.deletionRequests} days</td>
            </tr>
            <tr>
              <td>Customer account data</td>
              <td>For the duration of the contract, then as long as legal obligations require</td>
            </tr>
            <tr>
              <td>Sign-up whose e-mail was never confirmed</td>
              <td>7 days</td>
            </tr>
            <tr>
              <td>Rejected sign-up</td>
              <td>30 days after the rejection. Only a record of the decision remains (date, reason and a hash of the e-mail).</td>
            </tr>
            <tr>
              <td>Audit log of our team’s actions on your account</td>
              <td>While the account exists</td>
            </tr>
          </tbody>
        </table>
        <p>A daily job deletes data when these periods end.</p>
      </section>

      <section>
        <h2>8. Your rights</h2>
        <p>
          Under art. 18 of the LGPD you may request: confirmation that we process your data; access; correction;
          anonymization, blocking or deletion of unnecessary data; portability; deletion; information about who we share
          data with; and withdrawal of consent, when consent is the legal basis.
        </p>
        <p>
          Send your request to <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>. We answer within 15 days. If you
          interacted with a customer’s account on Instagram, you can also contact the customer, who controls that data. You
          may also complain to the Brazilian Data Protection Authority (ANPD).
        </p>
      </section>

      <section>
        <h2>9. How to delete your data</h2>
        <ul>
          <li>
            <strong>In the dashboard:</strong> in Accounts, click the trash icon next to the Instagram account. The account,
            its token, its automations (with their images and videos), send records, links, clicks, Meta notifications and
            operational logs related to the account are deleted at once. Turning the account off (Active/Off switch) only
            pauses the replies and deletes nothing.
          </li>
          <li>
            <strong>Through Meta:</strong> remove {brand.name} in your Facebook settings (Settings → Business integrations) or
            Instagram settings (Settings → Apps and websites). Meta sends us a deletion request, we delete the same data
            automatically, and you get a code to follow the request at{" "}
            <Link href={legalPath("dataDeletion", "en")}>{legalPath("dataDeletion", "en")}</Link>.
          </li>
          <li>
            <strong>By e-mail:</strong> write to <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>. This is also the
            way for people who commented on or messaged a customer’s account to have their data deleted, and for customers who
            want to close their sign-in account.
          </li>
        </ul>
      </section>

      <section>
        <h2>10. Cookies</h2>
        <p>
          We use only strictly necessary cookies: the session cookie, which keeps you signed in; the interface language
          cookie; and the theme cookie (light or dark). We use no advertising or third-party analytics cookies.
        </p>
      </section>

      <section>
        <h2>11. Security</h2>
        <ul>
          <li>Traffic protected by HTTPS.</li>
          <li>Instagram tokens encrypted at rest with AES-256-GCM.</li>
          <li>Passwords stored only as a hash (scrypt), with limited sign-in attempts.</li>
          <li>The signature of every notification and deletion request from Meta is verified.</li>
          <li>Access to data limited to the customer’s workspace and to each member’s role.</li>
        </ul>
        <p>
          If a security incident may cause relevant risk or harm, we will notify the affected people and the ANPD, as
          required by art. 48 of the LGPD.
        </p>
      </section>

      <section>
        <h2>12. Children and teenagers</h2>
        <p>The service is for businesses and professionals aged 18 or over.</p>
      </section>

      <section>
        <h2>13. Changes to this policy</h2>
        <p>
          We may update this policy. The date of the last update is shown at the top of the page, and relevant changes are
          announced to customers by e-mail or in the dashboard.
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          {legal.companyName}, CNPJ {legal.cnpj}, {legal.address}, Brazil
          <br />
          Data protection officer (DPO): {legal.dpoName}, <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>
        </p>
        <p>
          See also the <Link href={legalPath("terms", "en")}>Terms of Use</Link> and the{" "}
          <Link href={legalPath("dataDeletion", "en")}>Data deletion</Link> page.
        </p>
      </section>
    </>
  );
}
