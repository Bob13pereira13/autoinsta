"use client";

import { useEffect } from "react";

/**
 * Keeps <html lang> on the legal page's language when it is reached by a
 * client-side navigation (the root layout, which writes it on the server,
 * does not render again then). Restores the previous value on the way out.
 */
export default function DocumentLang({ lang }: { lang: string }) {
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [lang]);
  return null;
}
