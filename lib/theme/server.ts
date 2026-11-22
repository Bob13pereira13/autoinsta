import { cache } from "react";
import { cookies } from "next/headers";
import { resolveTheme, THEME_COOKIE } from "./index";

/** The theme saved in the cookie, or null to follow the system. */
export const getSavedTheme = cache(async () => {
  const cookieStore = await cookies();
  return resolveTheme(cookieStore.get(THEME_COOKIE)?.value);
});
