import { getBaseUrl } from "@/lib/env";

/** Public URL Meta downloads a media file from (served by app/media/[key]). */
export function mediaPublicUrl(storageKey: string): string {
  return `${getBaseUrl().replace(/\/+$/, "")}/media/${encodeURIComponent(storageKey)}`;
}
