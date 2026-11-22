import { brand } from "@/config/brand";
import { createI18n, resolveLocale, type Locale } from "@/lib/i18n";

/**
 * E-mails of public sign-up and client approval, in the client's language
 * (stored at sign-up; pt-BR otherwise). Notices to the operator are pt-BR.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(
  locale: Locale,
  parts: { heading: string; intro: string; lines?: string[]; buttonLabel?: string; url?: string; footer: string }
) {
  const { t } = createI18n(locale);
  const color = brand.colors.primary;
  const rows = (parts.lines ?? [])
    .map((line) => `<tr><td style="font-size:14px;line-height:21px;padding-bottom:4px">${escapeHtml(line)}</td></tr>`)
    .join("");
  const button =
    parts.url && parts.buttonLabel
      ? `<tr><td align="center" style="padding:20px 0 24px">
            <a href="${escapeHtml(parts.url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:6px">${escapeHtml(parts.buttonLabel)}</a>
          </td></tr>
          <tr><td style="font-size:13px;line-height:20px;color:#71717a;padding-bottom:12px">${escapeHtml(t("If the button does not work, copy and paste this address into your browser:"))}<br><span style="word-break:break-all">${escapeHtml(parts.url)}</span></td></tr>`
      : "";
  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;padding:32px">
          <tr><td style="font-size:18px;font-weight:bold;padding-bottom:24px">${escapeHtml(brand.name)}</td></tr>
          <tr><td style="font-size:20px;font-weight:bold;padding-bottom:12px">${escapeHtml(parts.heading)}</td></tr>
          <tr><td style="font-size:15px;line-height:22px;padding-bottom:16px">${escapeHtml(parts.intro)}</td></tr>
          ${rows}
          ${button}
          <tr><td style="font-size:13px;line-height:20px;color:#71717a;padding-top:8px">${escapeHtml(parts.footer)}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = [parts.heading, "", parts.intro, ...(parts.lines?.length ? ["", ...parts.lines] : []), ...(parts.url && parts.buttonLabel ? ["", `${parts.buttonLabel}: ${parts.url}`] : []), "", parts.footer, "", `— ${brand.name}`].join("\n");
  return { html, text };
}

function supportLine(locale: Locale): string {
  const { t } = createI18n(locale);
  return brand.support.whatsapp
    ? t("Support: {email} · WhatsApp {whatsapp}", { email: brand.support.email, whatsapp: brand.support.whatsapp })
    : t("Support: {email}", { email: brand.support.email });
}

export function verifyEmailMessage(url: string, name: string | null, rawLocale?: string | null) {
  const locale = resolveLocale(rawLocale);
  const { t } = createI18n(locale);
  return {
    subject: t("Confirm your e-mail to finish signing up"),
    ...render(locale, {
      heading: name ? t("Hello, {name}!", { name }) : t("Confirm your e-mail"),
      intro: t("Confirm this address to finish creating your account. The link is valid for 48 hours and can be used once. After that, our team reviews your sign-up."),
      buttonLabel: t("Confirm my e-mail"),
      url,
      footer: t("If you did not create an account, ignore this e-mail and nothing happens."),
    }),
  };
}

export function alreadyRegisteredMessage(loginUrl: string, resetUrl: string, rawLocale?: string | null) {
  const locale = resolveLocale(rawLocale);
  const { t } = createI18n(locale);
  return {
    subject: t("You already have an account"),
    ...render(locale, {
      heading: t("You already have an account"),
      intro: t("Someone tried to create an account with this e-mail, but it is already registered. Sign in with your password, or reset it if you forgot it: {resetUrl}", { resetUrl }),
      buttonLabel: t("Sign in"),
      url: loginUrl,
      footer: t("If it was not you, ignore this e-mail: nothing changed in your account."),
    }),
  };
}

export function approvedMessage(loginUrl: string, name: string | null, rawLocale?: string | null) {
  const locale = resolveLocale(rawLocale);
  const { t } = createI18n(locale);
  return {
    subject: t("Your account was approved"),
    ...render(locale, {
      heading: name ? t("Welcome, {name}!", { name }) : t("Welcome!"),
      intro: t("Your access was approved. Sign in to connect your Instagram account and create your first automation."),
      buttonLabel: t("Sign in"),
      url: loginUrl,
      footer: supportLine(locale),
    }),
  };
}

export function rejectedMessage(reason: string, name: string | null, rawLocale?: string | null) {
  const locale = resolveLocale(rawLocale);
  const { t } = createI18n(locale);
  return {
    subject: t("Your sign-up was not approved"),
    ...render(locale, {
      heading: name ? t("Hello, {name}", { name }) : t("Your sign-up was not approved"),
      intro: t("We reviewed your sign-up and could not approve it."),
      lines: [t("Reason: {reason}", { reason })],
      footer: `${supportLine(locale)} ${t("Your sign-up data is deleted in 30 days.")}`,
    }),
  };
}

export function adminNewSignupMessage(
  client: { name: string | null; email: string; companyName: string | null; phone: string | null; document: string | null },
  url: string
) {
  const locale: Locale = "pt-BR";
  return {
    subject: `Novo cadastro aguardando aprovação: ${client.companyName ?? client.email}`,
    ...render(locale, {
      heading: "Novo cadastro aguardando aprovação",
      intro: "Um cliente confirmou o e-mail e está aguardando a sua aprovação.",
      lines: [
        `Nome: ${client.name ?? "—"}`,
        `E-mail: ${client.email}`,
        `Empresa: ${client.companyName ?? "—"}`,
        `WhatsApp: ${client.phone ?? "—"}`,
        `CPF/CNPJ: ${client.document ?? "não informado"}`,
      ],
      buttonLabel: "Abrir na área de gestão",
      url,
      footer: "Você recebe este aviso porque o seu e-mail está em ADMIN_EMAILS.",
    }),
  };
}
