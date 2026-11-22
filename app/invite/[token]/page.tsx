import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import InvitationAcceptCard from "@/components/invitation-accept-card";
import BrandMark from "@/components/brand-mark";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("Accept Workspace Invitation - {brand}"),
    robots: { index: false, follow: false },
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { t, label } = await getI18n();
  const { token } = await params;
  const [session, invitation] = await Promise.all([
    auth(),
    prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: { select: { name: true } },
      },
    }),
  ]);

  if (!invitation || invitation.status !== "PENDING") {
    notFound();
  }

  const expired = invitation.expiresAt <= new Date();

  return (
    <main className="min-h-screen text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-12">
        <BrandMark className="mb-8" />
        <section className="card p-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-soft-fg">
            {t("Workspace invitation")}
          </p>
          <h1 className="title-page mt-4">
            {t("Join {workspace}", { workspace: invitation.workspace.name })}
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted">
            {t("You were invited as {role} for {email}.", { role: label(invitation.role), email: invitation.email })}
          </p>
          <div className="mt-8">
            {expired ? (
              <p className="text-sm text-error">
                {t("This invitation has expired. Ask the workspace owner to resend it.")}
              </p>
            ) : (
              <InvitationAcceptCard
                token={token}
                isSignedIn={Boolean(session?.user?.id)}
                invitedEmail={invitation.email}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

