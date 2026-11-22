"use client";

/**
 * DM Logs Page
 *
 * Filterable, paginated table of DM logs.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState, useCallback } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import StatusBadge from "@/components/status-badge";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented";

interface DmLog {
  id: string;
  commenterId: string;
  commenterName: string | null;
  commentText: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  automation: { name: string; keywords: string[]; type?: "COMMENTS" | "STORIES" | "DIRECT" };
  instagramAccount: { username: string };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_FILTERS = [
  "ALL",
  "SENT",
  "FAILED",
  "PENDING",
  "SKIPPED_RATE_LIMIT",
  "SKIPPED_PLAN_LIMIT",
  "SKIPPED_DEDUP",
  "SKIPPED_COOLDOWN",
  "SKIPPED_HUMAN_ACTIVE",
];

export default function LogsPage() {
  const { t, label, locale, message } = useI18n();
  const [logs, setLogs] = useState<DmLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (selectedAccountId !== "all") {
        params.set("instagramAccountId", selectedAccountId);
      }

      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data.logs);
        setPagination(data.data.pagination);
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, selectedAccountId]);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) setAccounts(payload.data.instagramAccounts ?? []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchLogs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchLogs]);

  function handleFilterChange(status: string) {
    setLoading(true);
    setStatusFilter(status);
    setPage(1);
  }

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("DM Logs")}
        actions={accounts.length > 1 ? <AccountSelect accounts={accounts} value={selectedAccountId} onChange={handleAccountChange} /> : undefined}
      />

      {/* Status filter */}
      <SegmentedControl
        size="sm"
        label={t("Status")}
        value={statusFilter}
        onChange={(status) => handleFilterChange(status)}
        items={STATUS_FILTERS.map((status) => ({ value: status, label: label(status) }))}
      />

      {/* Table */}
      <div className="card overflow-hidden">
        {/* Six columns don't fit a phone; the table keeps its width and scrolls
            horizontally inside the card rather than crushing every cell. */}
        <div className="table-scroll">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th scope="col">{t("Person")}</th>
                <th scope="col">{t("Message received")}</th>
                <th scope="col">{t("Automation")}</th>
                <th scope="col">{t("Account")}</th>
                <th scope="col">{t("Status")}</th>
                <th scope="col">{t("Time")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <>
                  {[...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6}>
                        <div className="h-4 rounded bg-surface-hover" />
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="!py-12 text-center text-muted">
                    {t("No logs found")}
                  </td>
                </tr>
              )}
              {!loading &&
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className="font-medium text-heading">
                        @{log.commenterName ?? log.commenterId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="max-w-[220px]">
                      <span className="block truncate text-muted">{log.commentText}</span>
                    </td>
                    <td>
                      <span className="text-foreground">{log.automation.name}</span>
                      <span className="block text-xs text-faint">
                        {log.automation.type === "STORIES" ? t("Stories") : log.automation.type === "DIRECT" ? t("Direct") : t("Comments")}
                      </span>
                    </td>
                    <td>
                      <span className="text-muted">@{log.instagramAccount.username}</span>
                    </td>
                    <td>
                      <StatusBadge status={log.status} />
                      {log.errorMessage && log.status !== "SENT" && (
                        <span className="mt-1 block max-w-[220px] text-xs text-faint">{message(log.errorMessage)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {new Date(log.createdAt).toLocaleString(locale, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3.5 sm:px-5">
            <p className="text-[13px] text-faint">
              {t("Showing {start}–{end} of {total}", {
                start: (pagination.page - 1) * pagination.limit + 1,
                end: Math.min(pagination.page * pagination.limit, pagination.total),
                total: pagination.total,
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => {
                  setLoading(true);
                  setPage(page - 1);
                }}
                className={buttonClass("secondary", "sm")}
              >
                {t("Previous")}
              </button>
              <span className="px-2 text-[13px] text-muted">
                {page} / {pagination.totalPages}
              </span>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => {
                  setLoading(true);
                  setPage(page + 1);
                }}
                className={buttonClass("secondary", "sm")}
              >
                {t("Next")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
