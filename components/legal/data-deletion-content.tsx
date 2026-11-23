/**
 * Data deletion instructions and the status of a request made through Meta
 * (the confirmation code our callback returns), in Portuguese and English.
 * Public: no sign-in needed.
 */
import Link from "next/link";
import { brand } from "@/config/brand";
import { prisma } from "@/lib/db/client";
import { legalPath, type LegalLocale } from "@/lib/legal/paths";
import { isConfirmationCode } from "@/lib/privacy/data-deletion";

function formatDateTime(value: Date, locale: LegalLocale) {
  return value.toLocaleString(locale === "en" ? "en-US" : "pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

const TEXT = {
  "pt-BR": {
    lookupTitle: "Consultar um pedido",
    lookupIntro: `Se você removeu o ${brand.name} da sua conta pelo Facebook ou pelo Instagram, a Meta mostrou um código de confirmação. Digite-o abaixo para ver o status.`,
    codeLabel: "Código de confirmação",
    codePlaceholder: "Ex.: 9F2C04A1B7D35E60",
    lookup: "Consultar",
    notFoundTitle: "Código não encontrado",
    notFound: (code: string) => `Confira se o código ${code} foi digitado corretamente. Se o problema continuar, escreva para `,
    done: "Exclusão concluída",
    processing: "Exclusão em processamento",
    code: "Código",
    received: "Recebido em",
    completed: "Concluído em",
    deleted: (n: number) =>
      `Apagamos ${n === 1 ? "a conta do Instagram conectada" : `${n} contas do Instagram conectadas`} e todos os dados ligados a ela: token de acesso, automações, imagens e vídeos, registros de envio, comentários e mensagens, links, cliques, notificações da Meta e registros operacionais.`,
    nothing: "Não havia dados guardados ligados a esta conta, então não restou nada a apagar.",
    pending: "Recebemos o pedido e a exclusão está sendo processada. Ela é concluída em até 7 dias; volte a esta página para conferir.",
  },
  en: {
    lookupTitle: "Check a request",
    lookupIntro: `If you removed ${brand.name} from your account through Facebook or Instagram, Meta showed you a confirmation code. Enter it below to see the status.`,
    codeLabel: "Confirmation code",
    codePlaceholder: "e.g. 9F2C04A1B7D35E60",
    lookup: "Check",
    notFoundTitle: "Code not found",
    notFound: (code: string) => `Check that the code ${code} was typed correctly. If the problem continues, write to `,
    done: "Deletion completed",
    processing: "Deletion in progress",
    code: "Code",
    received: "Received on",
    completed: "Completed on",
    deleted: (n: number) =>
      `We deleted ${n === 1 ? "the connected Instagram account" : `${n} connected Instagram accounts`} and all data related to it: access token, automations, images and videos, send records, comments and messages, links, clicks, Meta notifications and operational logs.`,
    nothing: "No data was stored for this account, so there was nothing left to delete.",
    pending: "We received the request and the deletion is being processed. It is completed within 7 days; come back to this page to check.",
  },
} as const;

async function RequestStatus({ code, locale }: { code: string; locale: LegalLocale }) {
  const text = TEXT[locale];
  const request = isConfirmationCode(code)
    ? await prisma.dataDeletionRequest.findUnique({
        where: { confirmationCode: code },
        select: { status: true, accountsDeleted: true, requestedAt: true, completedAt: true },
      })
    : null;

  if (!request) {
    return (
      <div role="status" data-deletion-status="unknown" className="rounded-control border border-warning-border bg-warning-soft p-4">
        <p className="font-semibold">{text.notFoundTitle}</p>
        <p className="mt-1">
          {text.notFound(code)}
          <a href={`mailto:${brand.legal.dpoEmail}`}>{brand.legal.dpoEmail}</a>.
        </p>
      </div>
    );
  }

  const done = request.status === "COMPLETED" || request.status === "NOT_FOUND";
  return (
    <div
      role="status"
      data-deletion-status={request.status}
      className={`rounded-control border p-4 ${done ? "border-success-border bg-success-soft" : "border-warning-border bg-warning-soft"}`}
    >
      <p className="font-semibold">{done ? text.done : text.processing}</p>
      <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="text-muted">{text.code}</dt>
        <dd className="font-mono">{code}</dd>
        <dt className="text-muted">{text.received}</dt>
        <dd>{formatDateTime(request.requestedAt, locale)}</dd>
        {request.completedAt && (
          <>
            <dt className="text-muted">{text.completed}</dt>
            <dd>{formatDateTime(request.completedAt, locale)}</dd>
          </>
        )}
      </dl>
      <p className="mt-3">
        {request.status === "COMPLETED" && text.deleted(request.accountsDeleted)}
        {request.status === "NOT_FOUND" && text.nothing}
        {!done && text.pending}
      </p>
    </div>
  );
}

export function DataDeletionContent({ locale, code }: { locale: LegalLocale; code?: string }) {
  const text = TEXT[locale];
  const action = legalPath("dataDeletion", locale);
  return (
    <>
      <section>
        <h2>{text.lookupTitle}</h2>
        <p>{text.lookupIntro}</p>
        <form method="get" action={action} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="codigo" className="sr-only">
            {text.codeLabel}
          </label>
          <input
            id="codigo"
            name="codigo"
            defaultValue={code ?? ""}
            placeholder={text.codePlaceholder}
            autoComplete="off"
            className="field font-mono"
          />
          <button type="submit" className="btn btn-primary">
            {text.lookup}
          </button>
        </form>
        {code && (
          <div className="mt-6">
            <RequestStatus code={code} locale={locale} />
          </div>
        )}
      </section>
      {locale === "en" ? <InstructionsEn /> : <InstructionsPt />}
    </>
  );
}

function InstructionsPt() {
  return (
    <>
      <section>
        <h2>Como pedir a exclusão</h2>
        <h3>Se você é cliente e conectou uma conta do Instagram</h3>
        <ul>
          <li>
            <strong>Pelo painel:</strong> em Contas, clique na lixeira ao lado da conta. A conta, o token de acesso, as
            automações (com imagens e vídeos), os registros de envio, os links e cliques, as notificações da Meta e os
            registros operacionais ligados a ela são apagados na hora. Desativar a conta só pausa as respostas e não apaga
            nada.
          </li>
          <li>
            <strong>Pela Meta:</strong> remova o {brand.name} das integrações da sua conta: no Facebook, em Configurações →
            Integrações empresariais (ou no portfólio empresarial, em Integrações → Apps conectados); no Instagram, em
            Configurações → Permissões de apps e sites. A Meta nos envia o pedido, apagamos os mesmos dados automaticamente e
            você recebe um código para consultar nesta página.
          </li>
          <li>
            <strong>Para encerrar também o cadastro de acesso</strong> (e-mail e espaço de trabalho), escreva para{" "}
            <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>.
          </li>
        </ul>

        <h3>Se você comentou ou mandou mensagem para uma empresa que usa o {brand.name}</h3>
        <p>
          Escreva para o nosso encarregado de dados, <a href={`mailto:${brand.legal.dpoEmail}`}>{brand.legal.dpoEmail}</a>,
          informando o seu nome de usuário no Instagram e a conta com que você interagiu. Respondemos em até 15 dias. Você
          também pode pedir diretamente à empresa responsável pela conta.
        </p>
      </section>

      <section>
        <h2>O que é apagado</h2>
        <ul>
          <li>Identificadores, nome de usuário e token de acesso da conta do Instagram conectada.</li>
          <li>Automações, palavras-chave e mensagens configuradas para essa conta.</li>
          <li>Comentários e mensagens recebidos, registros de envio, links e cliques.</li>
          <li>Imagens e vídeos enviados para as automações da conta.</li>
          <li>Notificações da Meta e registros operacionais ligados à conta.</li>
        </ul>
        <p>
          Mais detalhes na <Link href={legalPath("privacy", "pt-BR")}>Política de Privacidade</Link>.
        </p>
      </section>
    </>
  );
}

function InstructionsEn() {
  return (
    <>
      <section>
        <h2>How to request deletion</h2>
        <h3>If you are a customer and connected an Instagram account</h3>
        <ul>
          <li>
            <strong>In the dashboard:</strong> in Accounts, click the trash icon next to the account. The account, its access
            token, automations (with images and videos), send records, links and clicks, Meta notifications and operational
            logs related to it are deleted at once. Turning the account off only pauses the replies and deletes nothing.
          </li>
          <li>
            <strong>Through Meta:</strong> remove {brand.name} from your account’s integrations: on Facebook, Settings →
            Business integrations (or, in your business portfolio, Integrations → Connected apps); on Instagram, Settings →
            Apps and websites. Meta sends us the request, we delete the same data automatically, and you get a code to check
            on this page.
          </li>
          <li>
            <strong>To also close your sign-in account</strong> (e-mail and workspace), write to{" "}
            <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>.
          </li>
        </ul>

        <h3>If you commented on or messaged a business that uses {brand.name}</h3>
        <p>
          Write to our data protection officer, <a href={`mailto:${brand.legal.dpoEmail}`}>{brand.legal.dpoEmail}</a>, with
          your Instagram username and the account you interacted with. We answer within 15 days. You can also ask the
          business that owns the account directly.
        </p>
      </section>

      <section>
        <h2>What is deleted</h2>
        <ul>
          <li>The connected Instagram account’s identifiers, username and access token.</li>
          <li>The automations, keywords and messages set up for that account.</li>
          <li>Comments and messages received, send records, links and clicks.</li>
          <li>Images and videos uploaded for the account’s automations.</li>
          <li>Meta notifications and operational logs related to the account.</li>
        </ul>
        <p>
          More details in the <Link href={legalPath("privacy", "en")}>Privacy Policy</Link>.
        </p>
      </section>
    </>
  );
}
