"use server";

import { cookies } from "next/headers";
import { isLocale } from "./index";
import { localeCookie } from "./cookie";

export async function setLocale(value: string) {
  if (!isLocale(value)) throw new Error("Unsupported locale");
  const cookieStore = await cookies();
  cookieStore.set(...localeCookie(value));
}
