/** URL slugs for the automation tabs (/automations?tipo=...). */
export const TYPE_SLUGS = { COMMENTS: "comentarios", STORIES: "stories", DIRECT: "direct" } as const;
export type AutomationKindName = keyof typeof TYPE_SLUGS;

export function automationTypeSlug(type: AutomationKindName): string {
  return TYPE_SLUGS[type];
}

export function automationTypeFromSlug(slug: string | null | undefined): AutomationKindName {
  const value = (slug ?? "").toLowerCase();
  if (value === "stories" || value === "story") return "STORIES";
  if (value === "direct" || value === "dm") return "DIRECT";
  return "COMMENTS";
}
