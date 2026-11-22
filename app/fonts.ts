import localFont from "next/font/local";

/*
 * Inter (text) and Space Grotesk (titles), self-hosted from app/fonts/ (SIL
 * Open Font License, the license files sit next to the fonts). Local files,
 * so the build never depends on downloading fonts. Latin subset: covers
 * Portuguese and English; anything else falls back to the system font.
 */
export const inter = localFont({
  src: "./fonts/InterVariable-latin.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const spaceGrotesk = localFont({
  src: "./fonts/SpaceGroteskVariable-latin.woff2",
  weight: "500 700",
  style: "normal",
  display: "swap",
  variable: "--font-space-grotesk",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});
