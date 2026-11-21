import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/brand-mark";
import SiteFooter from "@/components/site-footer";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `${brand.name} - ${brand.tagline}`,
  description: brand.description,
};

const steps = [
  {
    title: "Conecte sua conta profissional",
    body: "Você autoriza o acesso pelo login oficial do Instagram. Nunca pedimos sua senha.",
  },
  {
    title: "Crie uma campanha",
    body: "Escolha o post ou reel, defina as palavras-chave (ex.: LINK) e escreva a mensagem que será enviada.",
  },
  {
    title: "Responda no automático",
    body: "Quando alguém comenta a palavra-chave, enviamos a resposta por DM e, se quiser, uma resposta pública no comentário.",
  },
];

const features = [
  "Resposta por DM a partir de comentários em posts e reels",
  "Resposta automática a mensagens diretas e a respostas de Stories",
  "Resposta pública opcional no comentário",
  "Links rastreáveis com contagem de cliques",
  "Caixa de entrada para responder conversas pelo painel",
  "Histórico de envios com o motivo de cada falha",
];

const trust = [
  {
    title: "API oficial da Meta",
    body: "Funciona exclusivamente pela Instagram API com login do Instagram. Sem robôs, sem raspagem de dados e sem automação de navegador.",
  },
  {
    title: "Dados protegidos",
    body: "Os tokens de acesso são criptografados (AES-256-GCM) e as notificações da Meta têm a assinatura verificada em toda requisição.",
  },
  {
    title: "Você no controle",
    body: "Desconecte o Instagram quando quiser. Pedidos de exclusão feitos pelo Instagram são processados automaticamente.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <BrandMark />
          <Link
            href="/login"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">
            Automação para Instagram
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
            {brand.tagline}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">{brand.description}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Acessar minha conta
            </Link>
            <a
              href="#como-funciona"
              className="rounded border border-border px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
            >
              Como funciona
            </a>
          </div>
        </section>

        <section id="como-funciona" className="border-t border-border bg-surface">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <h2 className="text-2xl font-bold">Como funciona</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="panel rounded p-6">
                  <span className="text-sm font-semibold text-accent">Passo {index + 1}</span>
                  <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="text-2xl font-bold">O que você pode fazer</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <li key={feature} className="flex gap-3 text-sm leading-6">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <h2 className="text-2xl font-bold">Segurança e conformidade</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {trust.map((item) => (
                <div key={item.title}>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm text-muted">
              Leia a nossa{" "}
              <Link className="text-accent underline underline-offset-4" href="/privacidade">
                Política de Privacidade
              </Link>{" "}
              e os{" "}
              <Link className="text-accent underline underline-offset-4" href="/termos">
                Termos de Uso
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
