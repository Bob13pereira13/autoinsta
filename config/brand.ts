/**
 * Configuração central da marca (white-label).
 *
 * Tudo o que identifica a sua empresa na interface, nos e-mails, no manifest
 * do app e nas páginas legais (/privacidade, /termos, /exclusao-dados) vem
 * daqui. Troque os valores abaixo e faça o deploy de novo — não há outro lugar
 * para editar.
 *
 * Campos marcados com "[PREENCHER]" são obrigatórios antes de publicar em
 * produção e antes de enviar o app para o Meta App Review: a Política de
 * Privacidade precisa identificar o controlador dos dados (LGPD, art. 9º) e um
 * canal de contato do encarregado (art. 41). A página /diagnostics lista os
 * campos que ainda estão pendentes.
 *
 * Este arquivo é importado por código de servidor e de cliente. Não coloque
 * segredos aqui.
 */

export const PLACEHOLDER = "[PREENCHER]";

export const brand = {
  /** Nome exibido na interface, nos e-mails e no título das páginas. */
  name: "ChatIntegrAI",
  /** Nome curto para o ícone do app instalado no celular (até ~12 letras). */
  shortName: "ChatIntegrAI",
  /** Frase curta usada na landing page e nas metatags. */
  tagline: "Respostas automáticas no Instagram, do comentário à DM.",
  /** Descrição usada em metatags e no manifest. */
  description:
    "Plataforma de automação para contas profissionais do Instagram: quando alguém comenta uma palavra-chave no seu post ou reel, enviamos a resposta por mensagem direta usando a API oficial da Meta.",

  /**
   * Logotipo. Coloque o arquivo em /public/brand/ e ajuste o caminho.
   * Use SVG ou PNG com fundo transparente. Os ícones do app (favicon e
   * instalação no celular) ficam em /public/icon-192.png, /public/icon-512.png
   * e /public/apple-touch-icon.png — substitua esses arquivos mantendo os nomes.
   * Para o Meta App Review você também precisa de um ícone de 1024x1024 px,
   * enviado direto no painel da Meta.
   */
  logo: {
    src: "/brand/logo.svg",
    alt: "ChatIntegrAI",
    width: 32,
    height: 32,
  },

  /**
   * Cores. `primary` é usada em botões, links e destaques; `primaryHover` no
   * estado de hover. O texto sobre `primary` é branco, então escolha uma cor
   * com contraste suficiente (WCAG AA: 4,5:1).
   */
  colors: {
    primary: "#4f46e5",
    primaryHover: "#4338ca",
    /** Cor da barra do navegador no celular e do app instalado. */
    theme: "#18181b",
  },

  /** Contato exibido para clientes e para titulares de dados. */
  support: {
    email: "suporte@chatintegrai.com",
    /** Opcional. Ex.: "+55 11 99999-9999". Deixe "" para ocultar. */
    whatsapp: "",
  },

  /**
   * Dados da empresa responsável (controlador dos dados, LGPD).
   * Aparecem na Política de Privacidade e nos Termos de Uso.
   */
  legal: {
    /** Razão social. Ex.: "Minha Empresa Tecnologia LTDA". */
    companyName: "Bruno Fernandes Pereira",
    /** CNPJ no formato 00.000.000/0000-00. */
    cnpj: "33.926.069/0001-08",
    /** Endereço completo da sede. */
    address: "São Paulo/SP",
    /** Nome do encarregado pelo tratamento de dados pessoais (DPO). */
    dpoName: "Bruno Fernandes",
    /** E-mail do encarregado — canal oficial para pedidos de titulares. */
    dpoEmail: "bruno@chatintegrai.com",
    /** Cidade/UF do foro dos Termos de Uso. Ex.: "São Paulo/SP". */
    jurisdiction: "São Paulo/SP",
    /**
     * Data da última revisão das páginas legais (AAAA-MM-DD). Atualize quando
     * mudar o texto de /privacidade ou /termos.
     */
    lastUpdated: "2026-11-22",
  },
} as const;

export type Brand = typeof brand;

/** Lista os campos da marca que ainda contêm "[PREENCHER]". */
export function missingBrandFields(source: unknown = brand, prefix = ""): string[] {
  if (typeof source === "string") {
    return source.includes(PLACEHOLDER) ? [prefix] : [];
  }
  if (source && typeof source === "object") {
    return Object.entries(source).flatMap(([key, value]) =>
      missingBrandFields(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [];
}

/** Formata a data de revisão das páginas legais em pt-BR. */
export function legalLastUpdatedLabel(): string {
  const [year, month, day] = brand.legal.lastUpdated.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
