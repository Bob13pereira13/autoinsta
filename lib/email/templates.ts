import { brand } from "@/config/brand";

/** Minimal escaping for values interpolated into the HTML templates. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout({ heading, intro, buttonLabel, url, footer }: {
  heading: string;
  intro: string;
  buttonLabel: string;
  url: string;
  footer: string;
}) {
  const color = brand.colors.primary;
  const safeUrl = escapeHtml(url);
  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;padding:32px">
          <tr><td style="font-size:18px;font-weight:bold;padding-bottom:24px">${escapeHtml(brand.name)}</td></tr>
          <tr><td style="font-size:20px;font-weight:bold;padding-bottom:12px">${escapeHtml(heading)}</td></tr>
          <tr><td style="font-size:15px;line-height:22px;padding-bottom:24px">${escapeHtml(intro)}</td></tr>
          <tr><td align="center" style="padding-bottom:24px">
            <a href="${safeUrl}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:6px">${escapeHtml(buttonLabel)}</a>
          </td></tr>
          <tr><td style="font-size:13px;line-height:20px;color:#71717a;padding-bottom:12px">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">${safeUrl}</span></td></tr>
          <tr><td style="font-size:13px;line-height:20px;color:#71717a">${escapeHtml(footer)}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `${heading}\n\n${intro}\n\n${buttonLabel}: ${url}\n\n${footer}\n\n— ${brand.name}`;
  return { html, text };
}

export function magicLinkEmail(url: string) {
  return {
    subject: `Seu link de acesso ao ${brand.name}`,
    ...layout({
      heading: "Entrar na sua conta",
      intro: `Clique no botão abaixo para entrar no ${brand.name}. O link vale por 24 horas e só pode ser usado uma vez.`,
      buttonLabel: "Entrar",
      url,
      footer: "Se você não pediu este e-mail, pode ignorá-lo com segurança.",
    }),
  };
}

export function welcomeEmail(url: string, name?: string | null) {
  return {
    subject: `Sua conta no ${brand.name} está pronta`,
    ...layout({
      heading: name ? `Olá, ${name}!` : "Boas-vindas!",
      intro: `Criamos o seu acesso ao ${brand.name}. Clique no botão abaixo para definir a sua senha. O link vale por 7 dias e só pode ser usado uma vez.`,
      buttonLabel: "Definir minha senha",
      url,
      footer: "Depois de definir a senha, entre com o seu e-mail e a senha escolhida.",
    }),
  };
}

export function passwordResetEmail(url: string) {
  return {
    subject: `Redefinição de senha do ${brand.name}`,
    ...layout({
      heading: "Redefinir a sua senha",
      intro: "Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para escolher uma nova senha. O link vale por 1 hora e só pode ser usado uma vez.",
      buttonLabel: "Redefinir senha",
      url,
      footer: "Se você não pediu a redefinição, ignore este e-mail: a sua senha atual continua valendo.",
    }),
  };
}
