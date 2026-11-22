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
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <BrandMark />
          <Link
            href="/login"
            className="btn btn-primary"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-soft-fg">
            Automação para Instagram
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-[-0.03em] text-heading sm:text-6xl">
            {brand.tagline}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">{brand.description}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="btn btn-primary"
            >
              Acessar minha conta
            </Link>
            <a
              href="#como-funciona"
              className="btn btn-secondary"
            >
              Como funciona
            </a>
          </div>
        </section>

        <section id="como-funciona" className="border-t border-border-subtle">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-heading sm:text-3xl">Como funciona</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="card card-interactive p-6">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-accent text-sm font-bold text-on-accent shadow-glow" aria-label={`Passo ${index + 1}`}>{index + 1}</span>
                  <h3 className="mt-4 font-display text-lg font-semibold text-heading">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-heading sm:text-3xl">O que você pode fazer</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <li key={feature} className="flex gap-3 text-sm leading-6">
                <span aria-hidden="true" className="dot dot-accent mt-[7px]" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border-subtle">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-heading sm:text-3xl">Segurança e conformidade</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {trust.map((item) => (
                <div key={item.title}>
                  <h3 className="font-display text-lg font-semibold text-heading">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm text-muted">
              Leia a nossa{" "}
              <Link className="link" href="/privacidade">
                Política de Privacidade
              </Link>{" "}
              e os{" "}
              <Link className="link" href="/termos">
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
