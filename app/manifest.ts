import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

// Lets the app be installed to the home screen: on iOS via Share -> "Add to
// Home Screen", on Android through the install prompt. It then opens
// standalone, without browser chrome, which makes checking campaigns from a
// phone practical.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    lang: "pt-BR",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    // The splash screen shows the icon on this colour: the icon's own background.
    background_color: brand.colors.iconBackground,
    theme_color: brand.colors.theme,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Full bleed with the mark in the safe zone, so Android's mask never clips it.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
