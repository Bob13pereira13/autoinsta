import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { hashPassword, validateNewPassword, verifyPassword } from "@/lib/account/password";

async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, passwordHash: true },
  });
}

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    data: { email: user.email, hasPassword: Boolean(user.passwordHash) },
  });
}

/**
 * Changes (or, for magic-link-only users, sets) the password. Every session —
 * including this one — is ended, so the user signs in again with the new one.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = body.newPassword;

  if (user.passwordHash && !(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json(
      { success: false, error: "The current password is incorrect." },
      { status: 400 }
    );
  }

  const invalid = validateNewPassword(newPassword, user.email);
  if (invalid) {
    return NextResponse.json({ success: false, error: invalid }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
