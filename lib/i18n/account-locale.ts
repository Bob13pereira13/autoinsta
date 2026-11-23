import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { isLocale, LOCALE_COOKIE } from "./index";
import { localeCookie } from "./cookie";

/**
 * On sign-in: a browser that has no language choice yet takes the language
 * saved on the account (User.locale, e.g. English for the App Review account)
 * and keeps it in the cookie. A browser that already chose a language keeps
 * its choice. Never fails the sign-in: any problem leaves the language as is.
 */
export async function adoptAccountLocale(userId: string): Promise<void> {
  try {
    const store = await cookies();
    if (store.get(LOCALE_COOKIE)) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
    if (!isLocale(user?.locale)) return;
    store.set(...localeCookie(user.locale));
  } catch (error) {
    console.warn("[i18n] Could not apply the account's language:", error instanceof Error ? error.message : error);
  }
}
