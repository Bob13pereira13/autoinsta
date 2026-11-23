/** The Terms of Use, in Portuguese and English (same sections in both). */
import Link from "next/link";
import { brand } from "@/config/brand";
import { legalPath, type LegalLocale } from "@/lib/legal/paths";

const legal = brand.legal;

export function TermsContent({ locale }: { locale: LegalLocale }) {
  return locale === "en" ? <TermsEn /> : <TermsPt />;
}

function TermsPt() {
  return (
    <>
      <section>
        <h2>1. O serviço</h2>
        <p>
          A {brand.name} automatiza respostas em contas profissionais do Instagram: quando alguém comenta uma palavra-chave
          em um post ou reel, responde a um Story ou envia uma mensagem direta, a plataforma envia por mensagem direta a
          resposta configurada pelo cliente e, se ele quiser, responde publicamente ao comentário. O serviço usa
          exclusivamente a API oficial do Instagram fornecida pela Meta.
        </p>
      </section>

      <section>
        <h2>2. Cadastro e acesso</h2>
        <ul>
          <li>
            O cadastro é feito no site, com confirmação do e-mail, ou criado pela nossa equipe para o cliente; neste caso o
            cliente define a própria senha pelo link enviado ao e-mail. Podemos exigir a análise de novos cadastros antes de
            liberar o painel.
          </li>
          <li>
            O cliente é responsável por manter a senha em sigilo, pelas pessoas que convida para o seu espaço de trabalho e
            por toda atividade feita com suas credenciais.
          </li>
          <li>
            O cliente deve nos avisar imediatamente em caso de uso não autorizado da conta, pelo e-mail{" "}
            <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Requisitos para usar</h2>
        <ul>
          <li>Ter uma conta profissional do Instagram (Business ou Creator) da qual seja titular ou administrador autorizado.</li>
          <li>Conectar a conta pelo login oficial da Meta e autorizar as permissões pedidas.</li>
          <li>
            Ativar, no aplicativo do Instagram, o acesso de ferramentas conectadas às mensagens, sem o qual as mensagens
            diretas não podem ser enviadas.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Uso aceitável</h2>
        <p>Ao usar a plataforma, o cliente se compromete a:</p>
        <ul>
          <li>
            Cumprir os Termos de Uso do Instagram, as Diretrizes da Comunidade, os Termos da Plataforma da Meta e a
            legislação brasileira, incluindo o Código de Defesa do Consumidor e a LGPD.
          </li>
          <li>Conectar apenas contas que lhe pertençam ou que esteja autorizado a gerenciar.</li>
          <li>
            Não usar a plataforma para spam, mensagens enganosas, conteúdo ilegal, discriminatório, ofensivo, que viole
            direitos de terceiros ou que promova produtos proibidos pelas políticas da Meta.
          </li>
          <li>
            Não tentar contornar limites de envio, janelas de mensagens ou outras regras da Meta, nem acessar o serviço por
            meios automatizados não fornecidos por nós.
          </li>
        </ul>
        <p>Podemos pausar automações ou suspender contas que violem estas regras ou que ponham em risco o acesso da plataforma à API da Meta.</p>
      </section>

      <section>
        <h2>5. Dados das pessoas que interagem com o cliente</h2>
        <p>
          Em relação aos dados de quem interage com a conta do cliente no Instagram, o cliente é o controlador e a{" "}
          {brand.name} atua como operadora, tratando esses dados somente para executar as automações configuradas. O
          cliente é responsável por ter base legal para esse tratamento e por informar essas pessoas, conforme a LGPD. Os
          detalhes estão na <Link href={legalPath("privacy", "pt-BR")}>Política de Privacidade</Link>.
        </p>
      </section>

      <section>
        <h2>6. Dependência da Meta</h2>
        <p>
          O funcionamento depende da disponibilidade e das regras da API do Instagram, que podem mudar por decisão da Meta,
          como limites de envio por hora, prazos para responder a um comentário, revisão de permissões ou bloqueios
          aplicados à conta. Não garantimos a entrega de toda mensagem nem respondemos por indisponibilidades, restrições ou
          decisões da Meta.
        </p>
      </section>

      <section>
        <h2>7. Disponibilidade e suporte</h2>
        <p>
          Empregamos esforços razoáveis para manter a plataforma disponível e corrigir falhas, mas o serviço pode passar por
          manutenções e interrupções. O suporte é prestado pelo e-mail{" "}
          <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>.
        </p>
      </section>

      <section>
        <h2>8. Condições comerciais</h2>
        <p>
          Preço, forma de pagamento, vigência e cancelamento são definidos na proposta comercial ou no contrato firmado com
          cada cliente, que prevalece sobre estes Termos no que for específico. O número de contas do Instagram que o cliente
          pode conectar é definido no plano contratado.
        </p>
      </section>

      <section>
        <h2>9. Propriedade intelectual</h2>
        <p>
          A marca, a interface e os materiais da {brand.name} pertencem a {legal.companyName} ou a seus licenciantes. O
          conteúdo das automações e as mensagens criadas pelo cliente continuam sendo do cliente, que nos autoriza a usá-los
          apenas para prestar o serviço.
        </p>
      </section>

      <section>
        <h2>10. Encerramento</h2>
        <p>
          O cliente pode remover a conta do Instagram a qualquer momento na aba Contas, o que apaga a conta conectada e os
          dados ligados a ela. Desativar a conta apenas pausa as automações, sem apagar dados. Para encerrar o cadastro de
          acesso, basta pedir pelo e-mail de suporte.
        </p>
        <p>
          Podemos recusar um cadastro novo, com o motivo informado por e-mail, e desativar uma conta de cliente (por exemplo,
          por falta de pagamento ou uso indevido): as automações param de responder, nada é apagado e tudo volta como estava
          se a conta for reativada. Podemos encerrar o acesso em caso de violação destes Termos ou do contrato.
        </p>
      </section>

      <section>
        <h2>11. Limitação de responsabilidade</h2>
        <p>
          Na máxima extensão permitida pela lei, não respondemos por lucros cessantes, perda de vendas ou danos indiretos
          decorrentes do uso ou da impossibilidade de uso da plataforma, nem pelo conteúdo das mensagens configuradas pelo
          cliente.
        </p>
      </section>

      <section>
        <h2>12. Alterações</h2>
        <p>
          Podemos atualizar estes Termos. A data da última atualização aparece no topo da página, e mudanças relevantes são
          comunicadas aos clientes com antecedência razoável.
        </p>
      </section>

      <section>
        <h2>13. Lei aplicável e foro</h2>
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de{" "}
          {legal.jurisdiction} para resolver qualquer controvérsia, salvo disposição legal em contrário.
        </p>
      </section>

      <section>
        <h2>14. Contato</h2>
        <p>
          {legal.companyName}, CNPJ {legal.cnpj}, {legal.address},{" "}
          <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>
        </p>
      </section>
    </>
  );
}

function TermsEn() {
  return (
    <>
      <section>
        <h2>1. The service</h2>
        <p>
          {brand.name} automates replies on Instagram professional accounts: when someone comments a keyword on a post or
          reel, replies to a Story or sends a direct message, the platform sends the reply the customer set up by direct
          message and, if the customer wants, replies publicly to the comment. The service uses only Instagram’s official API
          provided by Meta.
        </p>
      </section>

      <section>
        <h2>2. Sign-up and access</h2>
        <ul>
          <li>
            Customers sign up on the website, confirming their e-mail, or our team creates the account for them; in that case
            the customer sets their own password through the link sent by e-mail. We may review new sign-ups before giving
            access to the dashboard.
          </li>
          <li>
            The customer is responsible for keeping the password secret, for the people they invite to their workspace and
            for all activity done with their credentials.
          </li>
          <li>
            The customer must tell us at once about any unauthorized use of the account, at{" "}
            <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Requirements</h2>
        <ul>
          <li>An Instagram professional account (Business or Creator) that the customer owns or is authorized to manage.</li>
          <li>Connecting the account through Meta’s official login and granting the requested permissions.</li>
          <li>
            Turning on, in the Instagram app, access to messages for connected tools; without it, direct messages cannot be
            sent.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <p>By using the platform, the customer agrees to:</p>
        <ul>
          <li>
            Follow Instagram’s Terms of Use, the Community Guidelines, Meta’s Platform Terms and Brazilian law, including the
            Consumer Protection Code and the LGPD.
          </li>
          <li>Connect only accounts they own or are authorized to manage.</li>
          <li>
            Not use the platform for spam, misleading messages, illegal, discriminatory or offensive content, content that
            violates third-party rights, or products prohibited by Meta’s policies.
          </li>
          <li>
            Not try to get around send limits, messaging windows or other Meta rules, nor access the service by automated
            means we do not provide.
          </li>
        </ul>
        <p>We may pause automations or suspend accounts that break these rules or that put the platform’s access to Meta’s API at risk.</p>
      </section>

      <section>
        <h2>5. Data of people who interact with the customer</h2>
        <p>
          For the data of people who interact with the customer’s Instagram account, the customer is the controller and{" "}
          {brand.name} is a processor, handling that data only to run the automations the customer set up. The customer is
          responsible for having a legal basis for this processing and for informing those people, as the LGPD requires.
          Details are in the <Link href={legalPath("privacy", "en")}>Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>6. Dependence on Meta</h2>
        <p>
          The service depends on the availability and rules of Instagram’s API, which Meta may change, such as hourly send
          limits, deadlines to reply to a comment, permission reviews or restrictions applied to the account. We do not
          guarantee the delivery of every message and are not liable for Meta’s outages, restrictions or decisions.
        </p>
      </section>

      <section>
        <h2>7. Availability and support</h2>
        <p>
          We make reasonable efforts to keep the platform available and fix problems, but the service may have maintenance
          and interruptions. Support is provided at <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>.
        </p>
      </section>

      <section>
        <h2>8. Commercial terms</h2>
        <p>
          Price, payment, term and cancellation are set in the commercial proposal or contract signed with each customer,
          which prevails over these Terms where specific. The number of Instagram accounts a customer may connect is set by
          the plan.
        </p>
      </section>

      <section>
        <h2>9. Intellectual property</h2>
        <p>
          The {brand.name} brand, interface and materials belong to {legal.companyName} or its licensors. The automations
          and messages the customer creates remain the customer’s, who authorizes us to use them only to provide the service.
        </p>
      </section>

      <section>
        <h2>10. Termination</h2>
        <p>
          The customer can remove the Instagram account at any time in Accounts, which deletes the connected account and the
          data related to it. Turning the account off only pauses the automations and deletes nothing. To close the sign-in
          account, the customer can ask by e-mail to support.
        </p>
        <p>
          We may reject a new sign-up, telling the reason by e-mail, and disable a customer account (for example, for lack of
          payment or misuse): the automations stop answering, nothing is deleted, and everything works again if the account is
          re-enabled. We may end access if these Terms or the contract are breached.
        </p>
      </section>

      <section>
        <h2>11. Limitation of liability</h2>
        <p>
          To the fullest extent the law allows, we are not liable for lost profits, lost sales or indirect damages arising
          from the use of, or inability to use, the platform, nor for the content of the messages the customer sets up.
        </p>
      </section>

      <section>
        <h2>12. Changes</h2>
        <p>
          We may update these Terms. The date of the last update is shown at the top of the page, and relevant changes are
          announced to customers reasonably in advance.
        </p>
      </section>

      <section>
        <h2>13. Governing law and venue</h2>
        <p>
          These Terms are governed by the laws of the Federative Republic of Brazil. The courts of {legal.jurisdiction} have
          jurisdiction over any dispute, unless the law provides otherwise.
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          {legal.companyName}, CNPJ {legal.cnpj}, {legal.address}, Brazil,{" "}
          <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>
        </p>
      </section>
    </>
  );
}
