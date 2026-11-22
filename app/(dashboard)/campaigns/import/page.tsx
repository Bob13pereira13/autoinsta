"use client";

/**
 * Import Campaigns Page
 *
 * Paste a CSV of everything except the post. Each row is queued and opened in
 * the campaign builder prefilled and editable, one at a time, so you review
 * each campaign and pick its reel before saving.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import { parseCsv } from "@/lib/utils/csv";
import { IMPORT_QUEUE_KEY, IMPORT_ACCOUNT_KEY } from "@/lib/import-queue";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";

const SAMPLE = `keywords,dm_message,public_reply,tracked_url,opening_dm,opening_dm_button
"yc","here it is: {link}","sent. check dms","https://events.ycombinator.com/startup-school-2026","hey! click below for the referral","send link"
"LINK,SHOP","grab it here: {link}","dmed u",,,`;

export default function ImportCampaignsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) {
          const next = payload.data.instagramAccounts ?? [];
          setAccounts(next);
          setSelectedAccountId(next[0]?.id ?? "");
        }
      })
      .catch(() => setAccounts([]));
  }, []);

  function startImport() {
    setError(null);
    const parsed = parseCsv(csv);
    if (parsed.length === 0) {
      setError(t("Paste a CSV with a header row and at least one campaign."));
      return;
    }

    const rows = [];
    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      const keywords = (r.keywords ?? "")
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 10);
      const dmMessage = (r.dm_message ?? r.message ?? "").trim();
      if (keywords.length === 0 || !dmMessage) {
        setError(t("Row {row} is missing keywords or a message.", { row: i + 1 }));
        return;
      }
      rows.push({
        name: (r.name ?? "").trim(),
        keywords,
        dmMessage,
        publicReply: (r.public_reply ?? "").trim(),
        trackedUrl: (r.tracked_url ?? "").trim(),
        openingDmMessage: (r.opening_dm ?? "").trim(),
        openingDmButtonLabel: (r.opening_dm_button ?? "").trim(),
      });
    }

    try {
      window.localStorage.setItem(IMPORT_QUEUE_KEY, JSON.stringify(rows));
      if (selectedAccountId) {
        window.localStorage.setItem(IMPORT_ACCOUNT_KEY, selectedAccountId);
      }
    } catch {
      setError(t("Could not stage the import in this browser."));
      return;
    }
    router.push("/campaigns/new");
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="mb-2 text-[13px] text-faint">
          <Link href="/automations" className="rounded-sm text-accent-fg hover:text-accent-fg-hover">
            {t("Automations")}
          </Link>
        </p>
        <h1 className="title-page">{t("Import campaigns")}</h1>
        <p className="mt-2 leading-relaxed text-muted">
          {t("Paste a CSV with one row per campaign. Each row opens in the builder prefilled and editable, so you can review it and pick the reel before saving. Required columns are")}{" "}
          <code className="code text-accent-fg">keywords</code> {t("and")}{" "}
          <code className="code text-accent-fg">dm_message</code>{t(". Optional:")}{" "}
          <code className="code text-accent-fg">name</code>,{" "}
          <code className="code text-accent-fg">public_reply</code>,{" "}
          <code className="code text-accent-fg">tracked_url</code>,{" "}
          <code className="code text-accent-fg">opening_dm</code>,{" "}
          <code className="code text-accent-fg">opening_dm_button</code>{t(". Keywords go in one cell, separated by commas. Use")}{" "}
          <code className="code text-accent-fg">{"{link}"}</code> {t("in the message to insert the tracked link.")}
        </p>
      </div>

      {error && (
        <Alert tone="error">{error}</Alert>
      )}

      {accounts.length > 1 && (
        <div className="card space-y-2 p-5">
          <AccountSelect
            accounts={accounts}
            value={selectedAccountId}
            onChange={setSelectedAccountId}
            includeAll={false}
            label={t("Account")}
          />
        </div>
      )}

      <div className="card space-y-2.5 p-5">
        <label htmlFor="import-csv" className="label">CSV</label>
        <textarea
          id="import-csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={SAMPLE}
          rows={10}
          className="field font-mono"
        />
        <button
          type="button"
          onClick={() => setCsv(SAMPLE)}
          className="text-[13px] font-medium text-accent-fg hover:text-accent-fg-hover hover:underline"
        >
          {t("Fill with a sample")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          onClick={startImport}
          className="btn btn-primary"
        >
          {t("Review and import")}
        </button>
        <button
          onClick={() => router.push("/automations")}
          className="btn btn-secondary"
        >
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}
