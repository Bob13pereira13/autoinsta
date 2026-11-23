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

/** A company that processes data for us, and the country of its servers (ISO 3166-1 alpha-2). */
export interface Processor {
  name: string;
  country: string;
}

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
  /** A frase e a descrição em inglês (interface em English, Meta App Review). */
  en: {
    tagline: "Automatic Instagram replies, from comment to DM.",
    description:
      "Automation for Instagram professional accounts: when someone comments a keyword on your post or reel, we send your reply by direct message through Meta's official API.",
  },

  /**
   * Logotipo (símbolo + nome), em duas versões: `light` para o tema claro (cor
   * escura) e `dark` para o tema escuro (cor clara). Coloque os arquivos em
   * /public/brand/ e ajuste os caminhos; `width` e `height` dão a proporção.
   * Use SVG (ou PNG) com fundo transparente.
   *
   * Ícones do app: o símbolo do logotipo, branco, sobre um quadrado cheio da
   * cor `colors.iconBackground`, sem transparência e sem cantos arredondados
   * (o sistema arredonda sozinho). O desenho de origem é
   * docs/design/app-icon.svg; dele saem /app/favicon.ico (16, 32 e 48 px, com
   * o símbolo maior para ficar legível na aba), /public/icon-192.png,
   * /public/icon-512.png, /public/apple-touch-icon.png (iOS arredonda os
   * cantos sozinho) e /public/icon-maskable-512.png (Android: o símbolo fica
   * dentro da zona segura, um círculo de 40% do lado). Substitua esses
   * arquivos mantendo os nomes; o teste __tests__/app-icons.test.ts confere
   * tamanho, fundo, posição do símbolo e margens. Para o Meta App Review use
   * docs/design/app-icon-1024.png (1024x1024, sem transparência), enviado
   * direto no painel da Meta.
   */
  logo: {
    light: "/brand/logo-light.svg",
    dark: "/brand/logo-dark.svg",
    alt: "ChatIntegrAI",
    width: 483.7,
    height: 100,
  },

  /**
   * Cores. `primary` é o destaque do painel: botões, chaves, abas ativas e o
   * início do gradiente de destaque; `primaryHover` é o hover. O texto sobre
   * `primary` é branco, então escolha uma cor com contraste suficiente (WCAG
   * AA: 4,5:1). Os temas claro e escuro ficam em app/globals.css.
   */
  colors: {
    primary: "#7C3AED",
    primaryHover: "#6D28D9",
    /** Cor da barra do navegador no celular e do app instalado (segue a marca). */
    theme: "#7C3AED",
    /**
     * Fundo dos ícones do app (o mesmo do ícone enviado à Meta) e da tela de
     * abertura do app instalado, que mostra o ícone sobre essa cor. Não muda
     * botões nem destaques do painel, que seguem `primary`.
     */
    iconBackground: "#111827",
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
    lastUpdated: "2026-11-23",
  },

  /**
   * Quem trata dados por nós (operadores, LGPD art. 39). Aparecem na Política
   * de Privacidade, seção "Compartilhamento", nos dois idiomas, e nas
   * respostas de tratamento de dados do Meta App Review. `name`: a empresa;
   * `country`: onde ficam os servidores, em código ISO de 2 letras ("US",
   * "BR", "DE"); a política escreve o nome do país no idioma da página.
   * Enquanto um deles for null, a política descreve sem nomear e o
   * Diagnóstico mostra a pendência.
   */
  processors: {
    /** Hospedagem do app, do banco e da fila (VPS com Coolify). */
    hosting: { name: "Hostinger", country: "US" } as Processor | null,
    /** Envio de e-mails transacionais: confirmação de cadastro, recuperação de senha, convites. */
    email: { name: "Resend, Inc.", country: "US" } as Processor | null,
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

/** Um valor da marca, ou null enquanto ainda for "[PREENCHER]". */
export function filledBrandValue(value: string): string | null {
  return value && !value.includes(PLACEHOLDER) ? value : null;
}

/** Frase e descrição no idioma da interface. */
export function brandText(locale: string): { tagline: string; description: string } {
  return locale === "en" ? brand.en : { tagline: brand.tagline, description: brand.description };
}

/** Formata a data de revisão das páginas legais (pt-BR ou en). */
export function legalLastUpdatedLabel(locale: string = "pt-BR"): string {
  const [year, month, day] = brand.legal.lastUpdated.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale === "en" ? "en-US" : "pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
