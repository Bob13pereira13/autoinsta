"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Dashboard Home Page
 *
 * Overview cards, 7-day chart, and recent activity feed.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import StatCard from "@/components/stat-card";
import StatusBadge from "@/components/status-badge";

interface DashboardStats {
  userName: string | null;
  contactsCount: number;
  totalAutomations: number;
  activeAutomations: number;
  dmsSentToday: number;
  dmsSentWeek: number;
  dmsSentMonth: number;
  dmsSkippedMonth: number;
  dmsFailedMonth: number;
  totalDMs: number;
  clicksThisMonth: number;
  totalClicks: number;
  ctrThisMonth: number;
  instagramAccounts: AccountOption[];
  selectedInstagramAccountId: string | null;
  topKeywords: { keyword: string; count: number }[];
  dailyDMs: { date: string; count: number }[];
  recentLogs: Array<{
    id: string;
    commenterName: string | null;
    commentText: string;
    status: string;
    createdAt: string;
    automation: { name: string };
    instagramAccount?: { username: string };
  }>;
}

export default function DashboardPage() {
  const { t, label } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedAccountId !== "all") {
      params.set("instagramAccountId", selectedAccountId);
    }

    fetch(`/api/dashboard/stats${params.size ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setStats(data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedAccountId]);

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-16 max-w-sm rounded-card bg-surface" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card h-[92px]" />
          ))}
        </div>
        <div className="card h-64" />
      </div>
    );
  }

  const maxDM = Math.max(...(stats?.dailyDMs.map((d) => d.count) ?? [1]), 1);

  const connectedCount = stats?.instagramAccounts.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Hello, {name}!", { name: stats?.userName ?? t("there") })}
        description={
          <>
            {t(connectedCount === 1 ? "{count} connected account" : "{count} connected accounts", { count: connectedCount })}
            {" · "}
            {t(stats?.contactsCount === 1 ? "{count} contact" : "{count} contacts", { count: stats?.contactsCount ?? 0 })}
            {" · "}
            <Link href="/logs" className="link">
              {t("See activity")}
            </Link>
          </>
        }
        actions={
          stats && stats.instagramAccounts.length > 1 ? (
            <AccountSelect accounts={stats.instagramAccounts} value={selectedAccountId} onChange={handleAccountChange} />
          ) : undefined
        }
      />

      {/* Numbers of the month. Only "DMs sent" has real daily values (the
          last 7 days), so only it gets the small line. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t("Active Campaigns")} value={stats?.activeAutomations ?? 0} />
        <StatCard label={t("DMs Sent")} value={stats?.dmsSentMonth ?? 0} daily={stats?.dailyDMs.map((d) => d.count)} />
        <StatCard label={t("Skipped")} value={stats?.dmsSkippedMonth ?? 0} />
        <StatCard label={t("Failed")} value={stats?.dmsFailedMonth ?? 0} />
        <StatCard label={t("Clicks")} value={stats?.clicksThisMonth ?? 0} />
        <StatCard label={t("CTR")} value={`${stats?.ctrThisMonth ?? 0}%`} />
      </div>

      {/* Chart + keywords + recent activity */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-6">
        {/* 7-day chart (real daily numbers) */}
        <div className="card p-5 sm:p-6 lg:col-span-3">
          <h2 className="title-section mb-6">{t("DMs — Last 7 Days")}</h2>
          <div className="flex h-44 items-end gap-1.5 sm:gap-2.5">
            {stats?.dailyDMs.map((day) => (
              <div key={label(day.date)} className="flex h-full min-w-0 flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-muted">{day.count}</span>
                {/* A percentage height needs a parent with a definite height, so
                    the bar sits in a wrapper that fills the column's free space. */}
                <div className="flex min-h-0 w-full flex-1 items-end">
                  <div
                    className="min-h-[4px] w-full rounded-md bg-gradient-accent shadow-glow"
                    style={{ height: `${Math.max((day.count / maxDM) * 100, 4)}%` }}
                  />
                </div>
                {/* Seven labels share a phone's width, so they must not wrap. */}
                <span className="w-full truncate text-center text-[11px] text-faint">{label(day.date)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top keywords */}
        <div className="card p-5 sm:p-6 lg:col-span-1">
          <h2 className="title-section mb-4">{t("Top Keywords")}</h2>
          <div className="space-y-2.5">
            {stats?.topKeywords.length === 0 && <p className="py-8 text-sm text-muted">{t("No keyword matches yet")}</p>}
            {stats?.topKeywords.map((keyword) => (
              <div key={keyword.keyword} className="flex items-center justify-between gap-3">
                <span className="chip truncate">{keyword.keyword}</span>
                <span className="text-[13px] text-faint">{keyword.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card p-5 sm:p-6 lg:col-span-2">
          <h2 className="title-section mb-4">{t("Recent Activity")}</h2>
          <div className="max-h-64 overflow-y-auto">
            {stats?.recentLogs.length === 0 && <p className="py-8 text-center text-sm text-muted">{t("No activity yet")}</p>}
            {stats?.recentLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 border-b border-border-subtle py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-heading">@{log.commenterName ?? "unknown"}</p>
                  <p className="truncate text-[13px] text-faint">
                    {log.instagramAccount ? `@${log.instagramAccount.username} · ` : ""}
                    {log.commentText}
                  </p>
                </div>
                <StatusBadge status={log.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
