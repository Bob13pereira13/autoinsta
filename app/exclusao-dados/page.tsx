import type { Metadata } from "next";
import Link from "next/link";
import LegalShell from "@/components/legal-shell";
import { brand } from "@/config/brand";
import { prisma } from "@/lib/db/client";
import { isConfirmationCode } from "@/lib/privacy/data-deletion";

export const metadata: Metadata = {
  title: `Exclusão de dados - ${brand.name}`,
  description: `Como pedir a exclusão dos seus dados na ${brand.name} e acompanhar o status de um pedido.`,
  robots: { index: true, follow: true },
};

function formatDateTime(value: Date) {
  return value.toLocaleString("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

async function RequestStatus({ code }: { code: string }) {
  const request = isConfirmationCode(code)
    ? await prisma.dataDeletionRequest.findUnique({
        where: { confirmationCode: code },
        select: { status: true, accountsDeleted: true, requestedAt: true, completedAt: true },
      })
    : null;

  if (!request) {
    return (
      <div role="status" className="rounded border border-warning/30 bg-warning/10 p-4">
        <p className="font-semibold">Código não encontrado</p>
        <p className="mt-1">
          Confira se o código <span className="font-mono">{code}</span> foi digitado corretamente. Se o
          problema continuar, escreva para{" "}
          <a href={`mailto:${brand.legal.dpoEmail}`}>{brand.legal.dpoEmail}</a>.
        </p>
      </div>
    );
  }

  const done = request.status === "COMPLETED" || request.status === "NOT_FOUND";

  return (
    <div
      role="status"
      className={`rounded border p-4 ${
        done ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"
      }`}
    >
      <p className="font-semibold">
        {done ? "Exclusão concluída" : "Exclusão em processamento"}
      </p>
      <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="text-muted">Código</dt>
        <dd className="font-mono">{code}</dd>
        <dt className="text-muted">Recebido em</dt>
        <dd>{formatDateTime(request.requestedAt)}</dd>
        {request.completedAt && (
          <>
            <dt className="text-muted">Concluído em</dt>
            <dd>{formatDateTime(request.completedAt)}</dd>
          </>
        )}
      </dl>
      <p className="mt-3">
        {request.status === "COMPLETED" &&
          `Apagamos ${
            request.accountsDeleted === 1
              ? "a conta do Instagram conectada"
              : `${request.accountsDeleted} contas do Instagram conectadas`
          } e todos os dados vinculados: token de acesso, automações, imagens e vídeos enviados, registros de envio, comentários, links e cliques.`}
        {request.status === "NOT_FOUND" &&
          "Não havia dados armazenados vinculados a esta conta do Instagram, portanto não restou nada a apagar."}
        {!done &&
          "Recebemos o pedido e a exclusão está sendo processada. Ela é concluída em até 7 dias; volte a esta página para conferir."}
      </p>
    </div>
  );
}

export default async function ExclusaoDadosPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;
  const code = codigo?.trim().toUpperCase().slice(0, 64);

  return (
    <LegalShell
      title="Exclusão de dados"
      description={`Saiba como apagar os dados que a ${brand.name} guarda sobre você e acompanhe um pedido de exclusão.`}
    >
      <section>
        <h2>Consultar um pedido</h2>
        <p>
          Se você removeu o {brand.name} da sua conta do Instagram, a Meta mostrou um código de confirmação.
          Digite-o abaixo para ver o status.
        </p>
        <form method="get" action="/exclusao-dados" className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="codigo" className="sr-only">
            Código de confirmação
          </label>
          <input
            id="codigo"
            name="codigo"
            defaultValue={code ?? ""}
            placeholder="Ex.: 9F2C04A1B7D35E60"
            autoComplete="off"
            className="w-full rounded border border-border bg-surface px-4 py-3 font-mono text-sm uppercase focus:border-accent/40 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Consultar
          </button>
        </form>
        {code && (
          <div className="mt-6">
            <RequestStatus code={code} />
          </div>
        )}
      </section>

      <section>
        <h2>Como pedir a exclusão</h2>
        <h3>Se você é cliente e conectou uma conta do Instagram</h3>
        <ul>
          <li>
            <strong>Pelo painel:</strong> acesse Configurações e clique em &quot;Desconectar&quot; ao lado da
            conta. A conta conectada, o token de acesso, as automações (com imagens e vídeos), os registros de envio e os links
            rastreáveis são apagados imediatamente.
          </li>
          <li>
            <strong>Pela Meta:</strong> remova o {brand.name} das integrações da sua conta — no Instagram, em
            Configurações e privacidade → Permissões de apps e sites; no Facebook, em Configurações →
            Integrações empresariais (ou no portfólio empresarial, em Integrações → Apps conectados). A Meta
            nos envia o pedido, apagamos os dados automaticamente e você recebe um código para consultar nesta
            página.
          </li>
          <li>
            <strong>Para encerrar também o cadastro de acesso</strong> (e-mail e espaço de trabalho), escreva
            para <a href={`mailto:${brand.support.email}`}>{brand.support.email}</a>.
          </li>
        </ul>

        <h3>Se você comentou ou enviou mensagem para uma empresa que usa o {brand.name}</h3>
        <p>
          Escreva para o nosso encarregado de dados,{" "}
          <a href={`mailto:${brand.legal.dpoEmail}`}>{brand.legal.dpoEmail}</a>, informando o seu nome de
          usuário no Instagram e a conta com que você interagiu. Respondemos em até 15 dias. Você também pode
          pedir diretamente à empresa responsável pela conta.
        </p>
      </section>

      <section>
        <h2>O que é apagado</h2>
        <ul>
          <li>Identificadores, nome de usuário e token de acesso da conta do Instagram conectada.</li>
          <li>Campanhas, palavras-chave e mensagens configuradas para essa conta.</li>
          <li>Comentários e mensagens recebidos, registros de envio e cliques em links.</li>
          <li>Imagens e vídeos enviados para as automações da conta.</li>
          <li>Notificações da Meta e registros operacionais ligados à conta.</li>
        </ul>
        <p>
          Mais detalhes na <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
      </section>
    </LegalShell>
  );
}
