import { brand } from "@/config/brand";
import ptBR from "./pt-BR.json";

export const LOCALE_COOKIE = "app-locale";
/**
 * pt-BR is the default interface language. English stays available because
 * Meta asks App Review screencasts to be recorded with the UI in English (or
 * captioned) — see GUIA_META_APP_REVIEW.md.
 */
export type Locale = "pt-BR" | "en";
export const DEFAULT_LOCALE: Locale = "pt-BR";
export type MessageKey = keyof typeof ptBR;

const catalogs: Record<Exclude<Locale, "en">, Record<MessageKey, string>> = {
  "pt-BR": ptBR,
};

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "pt-BR";
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * `{brand}` is filled in automatically with the configured brand name, so the
 * product name lives only in config/brand.ts and never in a message key.
 */
type AutoPlaceholder = "brand";
type Placeholders<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never;
type RequiredPlaceholders<S extends string> = Exclude<
  Placeholders<S>,
  AutoPlaceholder
>;
export type StaticMessageKey = {
  [K in MessageKey]: [RequiredPlaceholders<K>] extends [never] ? K : never;
}[MessageKey];
type MessageArgs<K extends MessageKey> = [RequiredPlaceholders<K>] extends [
  never,
]
  ? []
  : [values: Record<RequiredPlaceholders<K>, string | number>];

// English is the source language. Only application-owned copy belongs here;
// campaign messages, account names and API values are never translation keys.
const labels: Record<string, StaticMessageKey> = {
  ALL: "All",
  SENT: "Sent",
  FAILED: "Failed",
  PENDING: "Pending",
  SKIPPED_RATE_LIMIT: "Rate limited",
  SKIPPED_PLAN_LIMIT: "Plan limit",
  SKIPPED_DEDUP: "Dedup",
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  all: "All",
  active: "Active",
  paused: "Paused",
  waiting: "Waiting",
  delayed: "Delayed",
  failed: "Failed",
  Mon: "Mon",
  Tue: "Tue",
  Wed: "Wed",
  Thu: "Thu",
  Fri: "Fri",
  Sat: "Sat",
  Sun: "Sun",
};

export function createI18n(locale: Locale) {
  function t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string {
    const message = locale === "en" ? key : catalogs[locale][key];
    const values: Record<string, string | number> = {
      brand: brand.name,
      ...(args[0] as Record<string, string | number> | undefined),
    };
    return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      values[name] === undefined ? placeholder : String(values[name]),
    );
  }

  return {
    locale,
    t,
    label: (value: string) =>
      Object.hasOwn(labels, value) ? t(labels[value]) : value,
  };
}

export type I18n = ReturnType<typeof createI18n>;
