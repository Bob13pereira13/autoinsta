"use server";

import { signOut } from "@/lib/auth";

/**
 * Ends the session and sends the user back to the login page. A Server
 * Function so client components (the dashboard sidebar) can use it as a form
 * action, the pattern the Next.js forms guide describes.
 */
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
