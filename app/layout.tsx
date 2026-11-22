import type { Metadata, Viewport } from "next";
import { brand } from "@/config/brand";
import { getSavedTheme } from "@/lib/theme/server";
import { inter, spaceGrotesk } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: `${brand.name} - ${brand.tagline}`,
  description: brand.description,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: brand.shortName,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: brand.colors.theme,
  width: "device-width",
  initialScale: 1,
  // Installed on iOS the app owns the full screen, notch included; the safe
  // area insets below keep content clear of the system UI.
  viewportFit: "cover",
};

// Brand colors come from config/brand.ts. globals.css maps the accent tokens
// to these variables, so the accent and its gradient follow them.
const brandStyle = `:root{--brand-primary:${brand.colors.primary};--brand-primary-hover:${brand.colors.primaryHover};}`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // A saved choice (theme button) wins; without one, globals.css follows the
  // system. Rendered on the server, so the page never flashes the other theme.
  const theme = await getSavedTheme();
  return (
    <html
      lang="pt-BR"
      className={`h-full ${inter.variable} ${spaceGrotesk.variable}`}
      data-theme={theme ?? undefined}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandStyle }} />
      </head>
      <body
        className="min-h-full text-foreground font-sans antialiased"
        // Clears the home indicator when installed; 0 everywhere else.
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {children}
      </body>
    </html>
  );
}
