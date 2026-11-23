import { LOCALE_COOKIE, type Locale } from "./index";

/** The language cookie: the same options wherever it is written. */
export function localeCookie(value: Locale) {
  return [
    LOCALE_COOKIE,
    value,
    {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax" as const,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
  ] as const;
}
