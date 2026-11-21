/**
 * Customer account management for the operator (closed sign-up).
 *
 *   npm run user -- create cliente@loja.com.br --name "Maria" --workspace "Loja da Maria"
 *   npm run user -- import clientes.csv          # columns: email,nome,empresa
 *   npm run user -- resend cliente@loja.com.br   # new set-password link
 *   npm run user -- disable cliente@loja.com.br  # blocks sign-in, ends sessions
 *   npm run user -- enable cliente@loja.com.br
 *   npm run user -- list
 *
 * "create" and "import" send the welcome e-mail with a link (valid 7 days) for
 * the customer to choose a password, and also print the link, so you can send
 * it another way if the e-mail does not arrive. Add --no-email to only print.
 *
 * Reads DATABASE_URL, NEXTAUTH_URL and the e-mail settings from .env (when the
 * file exists) or from the environment.
 */
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

type Flags = { name?: string; workspace?: string; email: boolean };

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Flags = { email: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--name") flags.name = argv[++i];
    else if (arg === "--workspace") flags.workspace = argv[++i];
    else if (arg === "--no-email") flags.email = false;
    else positional.push(arg);
  }
  return { command: positional[0], args: positional.slice(1), flags };
}

async function main() {
  const { prisma } = await import("@/lib/db/client");
  const { ensureWorkspaceForUser } = await import("@/lib/workspace");
  const { authTokenUrl, createAuthToken, normalizeEmail, sendWelcomeEmail } = await import(
    "@/lib/account/tokens"
  );
  const { parseCsv } = await import("@/lib/utils/csv");

  const { command, args, flags } = parseArgs(process.argv.slice(2));

  async function createOne(rawEmail: string, name?: string, workspaceName?: string) {
    const email = normalizeEmail(rawEmail ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error(`✗ E-mail inválido: "${rawEmail}"`);
      return false;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`• ${email} já existe — use "resend" para enviar um novo link.`);
      return false;
    }
    const user = await prisma.user.create({ data: { email, name: name || null } });
    const workspace = await ensureWorkspaceForUser(user.id, email);
    if (workspaceName) {
      await prisma.workspace.update({ where: { id: workspace.id }, data: { name: workspaceName } });
    }
    await deliverLink(user.id, email, "WELCOME");
    return true;
  }

  async function deliverLink(userId: string, email: string, purpose: "WELCOME" | "RESET") {
    if (flags.email && purpose === "WELCOME") {
      try {
        const url = await sendWelcomeEmail(userId);
        console.log(`✓ ${email} — e-mail de boas-vindas enviado.\n  Link: ${url}`);
        return;
      } catch (err) {
        console.error(`! ${email} — falha ao enviar e-mail (${(err as Error).message}).`);
      }
    }
    const url = authTokenUrl(await createAuthToken(userId, purpose), purpose);
    console.log(`✓ ${email} — envie este link ao cliente:\n  ${url}`);
  }

  switch (command) {
    case "create": {
      if (!args[0]) throw new Error('Uso: npm run user -- create <email> [--name "Nome"] [--workspace "Empresa"]');
      await createOne(args[0], flags.name, flags.workspace);
      break;
    }
    case "import": {
      if (!args[0]) throw new Error("Uso: npm run user -- import <arquivo.csv> (colunas: email,nome,empresa)");
      const rows = parseCsv(readFileSync(args[0], "utf8"));
      let created = 0;
      for (const row of rows) {
        if (await createOne(row.email, row.nome ?? row.name, row.empresa ?? row.workspace)) created++;
      }
      console.log(`\n${created} de ${rows.length} contas criadas.`);
      break;
    }
    case "resend": {
      const email = normalizeEmail(args[0] ?? "");
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) throw new Error(`Usuário ${email} não encontrado.`);
      await deliverLink(user.id, email, user.passwordHash ? "RESET" : "WELCOME");
      break;
    }
    case "disable":
    case "enable": {
      const email = normalizeEmail(args[0] ?? "");
      const user = await prisma.user.update({
        where: { email },
        data: { disabledAt: command === "disable" ? new Date() : null },
      });
      console.log(`✓ ${user.email} ${command === "disable" ? "bloqueado (sessões encerradas)" : "desbloqueado"}.`);
      break;
    }
    case "list": {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          email: true,
          name: true,
          passwordHash: true,
          disabledAt: true,
          createdAt: true,
          workspaceMembers: { select: { role: true, workspace: { select: { name: true, _count: { select: { instagramAccounts: true } } } } } },
        },
      });
      for (const u of users) {
        const ws = u.workspaceMembers.map((m) => `${m.workspace.name} (${m.role}, ${m.workspace._count.instagramAccounts} IG)`).join("; ");
        const status = u.disabledAt ? "BLOQUEADO" : u.passwordHash ? "ativo" : "aguardando senha";
        console.log(`${u.email}\t${u.name ?? "-"}\t${status}\t${ws}`);
      }
      console.log(`\n${users.length} usuário(s).`);
      break;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
      process.exitCode = 1;
  }

  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
