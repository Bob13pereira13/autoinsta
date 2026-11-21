import type { Metadata } from "next";
import Link from "next/link";
import LegalShell from "@/components/legal-shell";
import { brand } from "@/config/brand";
import { RETENTION_DAYS } from "@/lib/privacy/retention";

export const metadata: Metadata = {
  title: `Política de Privacidade - ${brand.name}`,
  description: `Como a ${brand.name} coleta, usa, armazena e exclui dados pessoais, incluindo dados do Instagram obtidos pela API oficial da Meta.`,
};

const legal = brand.legal;

export default function PrivacidadePage() {
  return (
    <LegalShell
      title="Política de Privacidade"
      description={`Esta política explica como a ${brand.name} trata dados pessoais ao oferecer automação de respostas para contas profissionais do Instagram, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e com os Termos da Plataforma da Meta.`}
    >
      <section>
        <h2>1. Quem somos</h2>
        <p>
          A {brand.name} é operada por <strong>{legal.companyName}</strong>, inscrita no CNPJ sob o nº{" "}
          <strong>{legal.cnpj}</strong>, com sede em {legal.address} (&quot;nós&quot;).
        </p>
        <p>
          Encarregado pelo tratamento de dados pessoais (DPO): <strong>{legal.dpoName}</strong> —{" "}
          <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>. Este é o canal oficial para qualquer
          pedido relacionado aos seus dados.
        </p>
      </section>

      <section>
        <h2>2. A quem esta política se aplica</h2>
        <ul>
          <li>
            <strong>Clientes:</strong> empresas e profissionais que usam a plataforma e conectam uma conta
            profissional do Instagram (Business ou Creator).
          </li>
          <li>
            <strong>Pessoas que interagem com os clientes no Instagram:</strong> quem comenta em posts e
            reels, responde Stories ou envia mensagens diretas para uma conta conectada à plataforma.
          </li>
          <li>
            <strong>Visitantes</strong> deste site.
          </li>
        </ul>
        <p>
          Em relação aos dados dos clientes, atuamos como <strong>controlador</strong>. Em relação aos dados
          de quem interage com as contas dos clientes no Instagram, atuamos como <strong>operador</strong>:
          tratamos esses dados apenas para executar as automações configuradas pelo cliente, que é o
          controlador desses dados (LGPD, art. 5º, VI e VII).
        </p>
      </section>

      <section>
        <h2>3. Dados que coletamos</h2>
        <h3>3.1 Dados de cadastro do cliente</h3>
        <ul>
          <li>Nome e e-mail de acesso.</li>
          <li>Senha, armazenada somente como hash irreversível (scrypt) — nunca em texto.</li>
          <li>Espaço de trabalho, função (proprietário, administrador ou membro) e convites enviados.</li>
        </ul>

        <h3>3.2 Dados da conta do Instagram conectada</h3>
        <p>
          A conexão é feita exclusivamente pelo login oficial da Meta — o login unificado (Facebook Login
          para Empresas com ativos do Instagram) ou o login do Instagram, conforme a configuração do
          aplicativo. <strong>Nunca pedimos nem armazenamos a senha do Instagram ou do Facebook.</strong>{" "}
          Solicitamos apenas as permissões abaixo, e você pode revogá-las a qualquer momento:
        </p>
        <table>
          <thead>
            <tr>
              <th>Permissão</th>
              <th>Para que usamos</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                instagram_basic
                <br />
                (ou instagram_business_basic)
              </td>
              <td>
                Identificar a conta conectada (ID, nome de usuário, nome e número de seguidores) e listar os
                seus posts e reels para você escolher onde a campanha vai funcionar.
              </td>
            </tr>
            <tr>
              <td>
                instagram_manage_comments
                <br />
                (ou instagram_business_manage_comments)
              </td>
              <td>
                Receber os comentários feitos nos posts e reels da conta conectada, identificar a
                palavra-chave configurada e, se você ativar, publicar uma resposta pública ao comentário.
              </td>
            </tr>
            <tr>
              <td>
                instagram_manage_messages
                <br />
                (ou instagram_business_manage_messages)
              </td>
              <td>
                Enviar a resposta privada (DM) para quem comentou a palavra-chave, responder mensagens diretas
                que contenham a palavra-chave e exibir as conversas na caixa de entrada do painel.
              </td>
            </tr>
            <tr>
              <td>business_management</td>
              <td>
                Somente no login unificado: localizar a conta do Instagram que você atribuiu ao nosso
                aplicativo no seu portfólio empresarial durante o login. Não lemos nem alteramos outros
                ativos do seu portfólio.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Armazenamos: ID da conta profissional, identificadores técnicos do login, nome de usuário, nome,
          o token de acesso (criptografado com AES-256-GCM) e sua data de expiração, quando houver, e o número
          diário de seguidores. Posts, reels e conversas são consultados na Meta no momento em que você abre o
          painel e não são copiados para o nosso banco de dados, exceto a referência ao post escolhido em cada
          campanha.
        </p>

        <h3>3.3 Dados de quem interage com a conta do cliente</h3>
        <ul>
          <li>
            Comentários e mensagens recebidos pela conta conectada: texto, identificador do comentário ou da
            mensagem, identificador e nome de usuário do autor no Instagram.
          </li>
          <li>
            Registro de cada envio automático: palavra-chave reconhecida, status (enviado, ignorado ou falha)
            e o motivo, para evitar envios duplicados e para o cliente acompanhar os resultados.
          </li>
          <li>
            Cliques em links rastreáveis enviados por DM: data e hora, navegador (user agent), página de
            origem e identificadores convertidos em hash irreversível do endereço IP e do destinatário — não
            guardamos o IP em si.
          </li>
        </ul>

        <h3>3.4 Dados técnicos</h3>
        <ul>
          <li>Notificações (webhooks) enviadas pela Meta, com assinatura verificada.</li>
          <li>Registros operacionais e de erro necessários para manter o serviço funcionando.</li>
          <li>Cookies estritamente necessários (ver seção 10).</li>
        </ul>
      </section>

      <section>
        <h2>4. Para que usamos os dados e bases legais</h2>
        <ul>
          <li>
            <strong>Prestar o serviço contratado</strong> — autenticar o acesso, conectar o Instagram,
            identificar palavras-chave, enviar respostas e exibir relatórios (execução de contrato, LGPD art.
            7º, V).
          </li>
          <li>
            <strong>Executar as automações do cliente</strong> sobre dados de quem interage com a conta dele,
            conforme as instruções do cliente e sob a base legal escolhida por ele como controlador.
          </li>
          <li>
            <strong>Segurança, prevenção a fraudes e abuso</strong>, como verificação de assinaturas, limites
            de envio e deduplicação (legítimo interesse, art. 7º, IX).
          </li>
          <li>
            <strong>Cumprir obrigações legais e regulatórias</strong> (art. 7º, II), incluindo a guarda de
            registros de acesso a aplicações pelo prazo de 6 meses prevista no art. 15 do Marco Civil da
            Internet (Lei nº 12.965/2014).
          </li>
        </ul>
      </section>

      <section>
        <h2>5. O que não fazemos</h2>
        <ul>
          <li>Não vendemos, alugamos ou licenciamos dados pessoais nem dados obtidos da Meta.</li>
          <li>
            Não usamos dados do Instagram para publicidade, criação de perfis, rastreamento entre sites ou
            treinamento de modelos de inteligência artificial.
          </li>
          <li>Não fazemos raspagem de dados (scraping) nem automação de navegador.</li>
          <li>
            Não enviamos mensagens para quem não interagiu com a conta do cliente: cada resposta é disparada
            por um comentário ou mensagem dessa pessoa, dentro das janelas e limites definidos pela Meta.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Compartilhamento</h2>
        <p>Compartilhamos dados apenas com:</p>
        <ul>
          <li>
            <strong>Meta Platforms</strong>, ao chamar a API oficial do Instagram em nome do cliente (por
            exemplo, para enviar uma mensagem).
          </li>
          <li>
            <strong>Operadores de infraestrutura</strong> que nos ajudam a prestar o serviço — hospedagem da
            aplicação, banco de dados, fila de processamento e envio de e-mails transacionais — sob contrato,
            com obrigações de confidencialidade e segurança.
          </li>
          <li>Autoridades públicas, quando houver obrigação legal ou ordem judicial.</li>
        </ul>
        <p>
          Alguns desses fornecedores podem armazenar dados fora do Brasil. Nesses casos, a transferência
          internacional segue o art. 33 da LGPD, com cláusulas contratuais e garantias de proteção
          adequadas. A lista atualizada de operadores pode ser solicitada ao encarregado.
        </p>
      </section>

      <section>
        <h2>7. Por quanto tempo guardamos os dados</h2>
        <table>
          <thead>
            <tr>
              <th>Dado</th>
              <th>Prazo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Conta do Instagram conectada, token, campanhas, registros de envio e cliques</td>
              <td>
                Enquanto a conta estiver conectada. São apagados imediatamente quando o cliente desconecta a
                conta no painel ou quando recebemos um pedido de exclusão da Meta.
              </td>
            </tr>
            <tr>
              <td>Notificações (webhooks) recebidas da Meta</td>
              <td>{RETENTION_DAYS.webhookEvents} dias</td>
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
              <td>
                Enquanto durar o contrato, e depois pelo prazo necessário ao cumprimento de obrigações legais.
              </td>
            </tr>
          </tbody>
        </table>
        <p>A exclusão dos prazos acima é feita automaticamente por uma rotina diária.</p>
      </section>

      <section>
        <h2>8. Seus direitos</h2>
        <p>
          Nos termos do art. 18 da LGPD, você pode solicitar: confirmação da existência de tratamento; acesso
          aos dados; correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou
          eliminação de dados desnecessários ou excessivos; portabilidade; eliminação dos dados; informação
          sobre com quem compartilhamos; informação sobre a possibilidade de não consentir; e revogação do
          consentimento, quando ele for a base legal.
        </p>
        <p>
          Envie o pedido para <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>. Respondemos em até 15
          dias. Se você interagiu com a conta de um cliente no Instagram, também pode procurar diretamente o
          cliente, que é o controlador desses dados. Você também pode apresentar reclamação à Autoridade
          Nacional de Proteção de Dados (ANPD).
        </p>
      </section>

      <section>
        <h2>9. Como excluir seus dados</h2>
        <ul>
          <li>
            <strong>No painel:</strong> em Configurações, clique em &quot;Desconectar&quot; na conta do
            Instagram. A conta, o token, as campanhas, os registros de envio e os links são apagados na hora.
          </li>
          <li>
            <strong>Pela Meta:</strong> remova o {brand.name} nas configurações de apps do Instagram ou do
            Facebook (Apps e sites / Integrações empresariais). A Meta nos envia um pedido de exclusão e
            apagamos automaticamente os dados da conta. Você recebe um código para acompanhar o pedido em{" "}
            <Link href="/exclusao-dados">/exclusao-dados</Link>.
          </li>
          <li>
            <strong>Por e-mail:</strong> escreva para <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>
            . Esse também é o caminho para quem comentou ou enviou mensagem para a conta de um cliente e quer a
            exclusão dos seus dados, e para clientes que desejam encerrar o cadastro de acesso.
          </li>
        </ul>
      </section>

      <section>
        <h2>10. Cookies</h2>
        <p>
          Usamos apenas cookies estritamente necessários: o cookie de sessão, que mantém você conectado, e o
          cookie de idioma da interface. Não usamos cookies de publicidade nem de análise de terceiros.
        </p>
      </section>

      <section>
        <h2>11. Segurança</h2>
        <ul>
          <li>Tráfego protegido por HTTPS.</li>
          <li>Tokens do Instagram criptografados em repouso com AES-256-GCM.</li>
          <li>Senhas armazenadas apenas como hash (scrypt) e tentativas de login limitadas.</li>
          <li>Verificação da assinatura (X-Hub-Signature-256) de toda notificação recebida da Meta.</li>
          <li>Acesso aos dados restrito ao espaço de trabalho do cliente e às funções de cada membro.</li>
        </ul>
        <p>
          Em caso de incidente de segurança que possa gerar risco ou dano relevante, comunicaremos os
          titulares afetados e a ANPD, conforme o art. 48 da LGPD.
        </p>
      </section>

      <section>
        <h2>12. Crianças e adolescentes</h2>
        <p>
          O serviço é destinado a empresas e profissionais maiores de 18 anos e não se destina a crianças ou
          adolescentes.
        </p>
      </section>

      <section>
        <h2>13. Alterações desta política</h2>
        <p>
          Podemos atualizar esta política. A data da última atualização aparece no topo da página. Mudanças
          relevantes serão comunicadas aos clientes por e-mail ou pelo painel.
        </p>
      </section>

      <section>
        <h2>14. Contato</h2>
        <p>
          {legal.companyName} — CNPJ {legal.cnpj} — {legal.address}
          <br />
          Encarregado (DPO): {legal.dpoName} — <a href={`mailto:${legal.dpoEmail}`}>{legal.dpoEmail}</a>
        </p>
        <p>
          Veja também os <Link href="/termos">Termos de Uso</Link> e a página de{" "}
          <Link href="/exclusao-dados">Exclusão de dados</Link>.
        </p>
      </section>
    </LegalShell>
  );
}
