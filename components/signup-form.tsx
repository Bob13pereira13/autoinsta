"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { parseDocument } from "@/lib/validation/document";
import { normalizePhone } from "@/lib/validation/phone";
import TurnstileWidget, { type TurnstileHandle } from "@/components/turnstile-widget";

type Field = "name" | "email" | "password" | "companyName" | "phone" | "document" | "acceptTerms" | "turnstile";

export default function SignupForm({ siteKey, requireApproval }: { siteKey: string | null; requireApproval: boolean }) {
  const { t, message, locale } = useI18n();
  const [values, setValues] = useState({ name: "", email: "", password: "", companyName: "", phone: "", document: "" });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const widget = useRef<TurnstileHandle>(null);
  const onToken = useCallback((value: string | null) => setToken(value), []);

  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  function validate(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    if (values.name.trim().length < 2) found.name = t("Enter your name");
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) found.email = t("Enter a valid e-mail");
    if (values.password.length < 8) found.password = t("Use at least 8 characters");
    if (values.companyName.trim().length < 2) found.companyName = t("Enter the company name");
    if (!normalizePhone(values.phone)) found.phone = t("Enter a valid WhatsApp number with area code");
    if (values.document.trim() && !parseDocument(values.document)) found.document = t("Invalid CPF or CNPJ: check the digits");
    if (!acceptTerms) found.acceptTerms = t("Accept the Terms of Use and the Privacy Policy");
    if (siteKey && !token) found.turnstile = t("Complete the check below");
    return found;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, acceptTerms, turnstileToken: token, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setDoneFor(values.email.trim());
        return;
      }
      const text = message(data.error, "Could not create the account. Try again.");
      if (data.field && data.field !== "turnstile") setErrors({ [data.field as Field]: text });
      else setFormError(text);
    } catch {
      setFormError(t("Could not create the account. Try again."));
    } finally {
      setSending(false);
      // Turnstile tokens are single-use.
      widget.current?.reset();
    }
  }

  if (doneFor) {
    return (
      <div role="status" className="space-y-3">
        <h2 className="text-lg font-semibold">{t("Check your e-mail")}</h2>
        <p className="text-sm text-muted">
          {requireApproval
            ? t("If {email} can be used, we sent a link to confirm it. Open it to finish signing up; after that our team reviews your access.", { email: doneFor })
            : t("If {email} can be used, we sent a link to confirm it. Open it to finish signing up; after that you can sign in and use the dashboard.", { email: doneFor })}
        </p>
        <Link href={`/confirmar-email?email=${encodeURIComponent(doneFor)}`} className="text-sm font-medium text-accent hover:underline">
          {t("Did not get it? Resend the link")}
        </Link>
      </div>
    );
  }

  const input =
    "w-full rounded border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";
  const fieldError = (field: Field) =>
    errors[field] ? (
      <p id={`${field}-error`} className="text-xs text-error">
        {errors[field]}
      </p>
    ) : null;
  const describedBy = (field: Field) => (errors[field] ? `${field}-error` : undefined);

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError && (
        <p role="alert" className="rounded border border-error/20 bg-error/10 p-3 text-sm text-error">
          {formError}
        </p>
      )}
      <div className="space-y-1.5">
        <label htmlFor="su-name" className="block text-sm font-medium">{t("Your name")}</label>
        <input id="su-name" autoComplete="name" value={values.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} aria-describedby={describedBy("name")} className={input} maxLength={100} />
        {fieldError("name")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="su-email" className="block text-sm font-medium">{t("E-mail")}</label>
        <input id="su-email" type="email" autoComplete="email" value={values.email} onChange={set("email")} aria-invalid={Boolean(errors.email)} aria-describedby={describedBy("email")} className={input} maxLength={200} />
        {fieldError("email")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="su-password" className="block text-sm font-medium">{t("Password")}</label>
        <input id="su-password" type="password" autoComplete="new-password" value={values.password} onChange={set("password")} aria-invalid={Boolean(errors.password)} aria-describedby={describedBy("password") ?? "su-password-hint"} className={input} maxLength={200} />
        <p id="su-password-hint" className="text-xs text-muted">{t("At least 8 characters.")}</p>
        {fieldError("password")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="su-company" className="block text-sm font-medium">{t("Company name")}</label>
        <input id="su-company" autoComplete="organization" value={values.companyName} onChange={set("companyName")} aria-invalid={Boolean(errors.companyName)} aria-describedby={describedBy("companyName")} className={input} maxLength={120} />
        {fieldError("companyName")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="su-phone" className="block text-sm font-medium">{t("Phone (WhatsApp)")}</label>
        <input id="su-phone" type="tel" autoComplete="tel" placeholder="(11) 99999-8888" value={values.phone} onChange={set("phone")} aria-invalid={Boolean(errors.phone)} aria-describedby={describedBy("phone")} className={input} maxLength={30} />
        {fieldError("phone")}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="su-document" className="block text-sm font-medium">
          {t("CPF or CNPJ")} <span className="font-normal text-muted">{t("(optional)")}</span>
        </label>
        <input id="su-document" inputMode="text" value={values.document} onChange={set("document")} aria-invalid={Boolean(errors.document)} aria-describedby={describedBy("document")} className={input} maxLength={30} />
        {fieldError("document")}
      </div>
      <div className="space-y-1.5">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => {
              setAcceptTerms(e.target.checked);
              setErrors((prev) => ({ ...prev, acceptTerms: undefined }));
            }}
            aria-invalid={Boolean(errors.acceptTerms)}
            aria-describedby={describedBy("acceptTerms")}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            {t("I have read and accept the")}{" "}
            <Link href="/termos" target="_blank" className="text-accent underline underline-offset-2">{t("Terms of Use")}</Link>{" "}
            {t("and the")}{" "}
            <Link href="/privacidade" target="_blank" className="text-accent underline underline-offset-2">{t("Privacy Policy")}</Link>.
          </span>
        </label>
        {fieldError("acceptTerms")}
      </div>
      {siteKey && (
        <div className="space-y-1.5">
          <TurnstileWidget ref={widget} siteKey={siteKey} language={locale === "en" ? "en" : "pt-br"} onToken={onToken} />
          {fieldError("turnstile")}
        </div>
      )}
      <button
        type="submit"
        disabled={sending}
        className="w-full rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {sending ? t("Creating account…") : t("Create account")}
      </button>
    </form>
  );
}
