import type { Metadata } from "next";
import Link from "next/link";
import LegalShell from "@/components/legal-shell";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Termos de Uso - ${brand.name}`,
  description: `Condições para usar a plataforma ${brand.name} de automação de respostas no Instagram.`,
};

const legal = brand.legal;

export default function TermosPage() {
  return (
    <LegalShell
      title="Termos de Uso"
      description={`Estes Termos regulam o uso da plataforma ${brand.name}, operada por ${legal.companyName} (CNPJ ${legal.cnpj}). Ao acessar a plataforma, você concorda com eles.`}
    >
      <section>
        <h2>1. O serviço</h2>
        <p>
          A {brand.name} é uma plataforma que automatiza respostas em contas profissionais do Instagram:
          quando alguém comenta uma palavra-chave em um post ou reel, responde um Story ou envia uma mensagem
          direta com essa palavra-chave, a plataforma envia a resposta configurada pelo cliente por mensagem
          direta e, opcionalmente, responde publicamente ao comentário. O serviço usa exclusivamente a API
          oficial do Instagram fornecida pela Meta.
        </p>
      </section>

      <section>
        <h2>2. Cadastro e acesso</h2>
        <ul>
          <li>
            As contas de acesso são criadas pela {brand.name} para seus clientes. No primeiro acesso, o
            cliente define a própria senha pelo link enviado ao e-mail cadastrado.
          </li>
          <li>
            O cliente é responsável por manter a senha em sigilo, pelas pessoas que convida para o seu espaço
            de trabalho e por toda atividade realizada com suas credenciais.
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
          <li>Autorizar as permissões solicitadas pelo login oficial do Instagram.</li>
          <li>
            Ativar, no aplicativo do Instagram, a opção que permite o acesso de ferramentas conectadas às
            mensagens, sem a qual as mensagens diretas não podem ser enviadas.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Uso aceitável</h2>
        <p>Ao usar a plataforma, o cliente se compromete a:</p>
        <ul>
          <li>
            Cumprir os Termos de Uso do Instagram, as Diretrizes da Comunidade, os Termos da Plataforma da Meta
            e a legislação brasileira, incluindo o Código de Defesa do Consumidor e a LGPD.
          </li>
          <li>Conectar apenas contas que lhe pertençam ou que esteja autorizado a gerenciar.</li>
          <li>
            Não usar a plataforma para spam, mensagens enganosas, conteúdo ilegal, discriminatório, ofensivo,
            que viole direitos de terceiros ou que promova produtos proibidos pelas políticas da Meta.
          </li>
          <li>
            Não tentar contornar limites de envio, janelas de mensagens ou outras regras impostas pela Meta,
            nem acessar o serviço por meios automatizados não fornecidos por nós.
          </li>
        </ul>
        <p>
          Podemos pausar campanhas ou suspender contas que violem estas regras ou que coloquem em risco o
          acesso da plataforma à API da Meta.
        </p>
      </section>

      <section>
        <h2>5. Dados dos seguidores do cliente</h2>
        <p>
          Em relação aos dados de quem interage com a conta do cliente no Instagram, o cliente é o
          controlador e a {brand.name} atua como operadora, tratando esses dados somente para executar as
          automações configuradas. O cliente é responsável por ter base legal para esse tratamento e por
          informar seus seguidores, conforme a LGPD. Os detalhes estão na{" "}
          <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
      </section>

      <section>
        <h2>6. Dependência da Meta</h2>
        <p>
          O funcionamento depende da disponibilidade e das regras da API do Instagram, que podem mudar sem
          aviso por decisão da Meta — por exemplo, limites de envio por hora, prazos para responder a um
          comentário, revisão de permissões ou bloqueios aplicados à conta. Não garantimos a entrega de toda
          mensagem nem respondemos por indisponibilidades, restrições ou decisões da Meta.
        </p>
      </section>

      <section>
        <h2>7. Disponibilidade e suporte</h2>
        <p>
          Empregamos esforços razoáveis para manter a plataforma disponível e corrigir falhas, mas o serviço
          pode passar por manutenções e interrupções. O suporte é prestado pelo e-mail{" "}
          <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>.
        </p>
      </section>

      <section>
        <h2>8. Condições comerciais</h2>
        <p>
          Preço, forma de pagamento, prazo de vigência e condições de cancelamento são definidos na proposta
          comercial ou no contrato firmado com cada cliente, que prevalece sobre estes Termos no que for
          específico.
        </p>
      </section>

      <section>
        <h2>9. Propriedade intelectual</h2>
        <p>
          A marca, a interface e os materiais da {brand.name} pertencem a {legal.companyName} ou a seus
          licenciantes. O conteúdo das campanhas e as mensagens criadas pelo cliente continuam sendo do
          cliente, que nos autoriza a usá-los apenas para prestar o serviço.
        </p>
      </section>

      <section>
        <h2>10. Encerramento</h2>
        <p>
          O cliente pode remover a conta do Instagram a qualquer momento na aba Contas, o que apaga a
          conta conectada e os dados vinculados a ela. Desativar a conta apenas pausa as automações, sem
          apagar dados. Para encerrar o cadastro de acesso, basta solicitar pelo
          e-mail de suporte. Podemos encerrar o acesso em caso de violação destes Termos ou do contrato.
        </p>
      </section>

      <section>
        <h2>11. Limitação de responsabilidade</h2>
        <p>
          Na máxima extensão permitida pela lei, não respondemos por lucros cessantes, perda de vendas ou
          danos indiretos decorrentes do uso ou da impossibilidade de uso da plataforma, nem pelo conteúdo das
          mensagens configuradas pelo cliente.
        </p>
      </section>

      <section>
        <h2>12. Alterações</h2>
        <p>
          Podemos atualizar estes Termos. A data da última atualização aparece no topo da página, e mudanças
          relevantes serão comunicadas aos clientes com antecedência razoável.
        </p>
      </section>

      <section>
        <h2>13. Lei aplicável e foro</h2>
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca
          de {legal.jurisdiction} para resolver qualquer controvérsia, salvo disposição legal em contrário.
        </p>
      </section>

      <section>
        <h2>14. Contato</h2>
        <p>
          {legal.companyName} — CNPJ {legal.cnpj} — {legal.address} —{" "}
          <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>
        </p>
      </section>
    </LegalShell>
  );
}
