"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { HIGH_INTENT_STATUSES, STATUSES, TOUCH_OPTIONS, PRODUCTS, INTENTS, FOLLOW_UP_REASONS, statusRank, statusLabel, suggestedNextAction } from "@/lib/lead-pipeline";

type Lead = {
  id: string;
  wa_id: string;
  phone: string | null;
  name: string | null;
  status: string;
  source: string;
  source_id: string | null;
  ad_headline: string | null;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  manual_campaign: string | null;
  last_touch_source: string | null;
  last_touch_at: string | null;
  is_historical: boolean;
  suppress_capi: boolean;
  last_message: string | null;
  first_seen_at: string;
  last_seen_at: string;
  revenue: number | string;
  ctwa_clid: string | null;
  capi_lead_sent_at: string | null;
  capi_purchase_sent_at: string | null;
  capi_last_error: string | null;
  product_interest: string | null;
  intent: string | null;
  project_size: string | null;
  project_location: string | null;
  estimated_value: number | string;
  next_follow_up_at: string | null;
  follow_up_reason: string | null;
  pending_reason: string | null;
  lost_reason: string | null;
  lead_score: number;
};

type PerformanceMetrics = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  estimate: number;
  qualified: number;
  survey: number;
  quotation: number;
  hot: number;
  closing: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
  cost_per_qualified: number;
  cost_per_closing: number;
  qualified_rate: number;
  closing_rate: number;
  roas: number;
};

type PerformanceResponse = {
  ok: boolean;
  since: string;
  until: string;
  summary: PerformanceMetrics;
  closing_activity?: { closing: number; revenue: number };
  campaigns: Array<{
    id: string;
    campaign_name: string;
    metrics: PerformanceMetrics;
  }>;
  ads: Array<{
    id: string;
    ad_name: string;
    adset_name: string;
    campaign_name: string;
    metrics: PerformanceMetrics;
  }>;
  warning?: string;
  error?: string;
  last_synced_at?: string | null;
  can_sync_at?: string | null;
  cooldown_remaining_seconds?: number;
  stale?: boolean;
  sync_skipped?: boolean;
  sync_error?: string | null;
};

type LeadSummary = {
  total: number;
  highIntent: number;
  survey: number;
  closing: number;
  revenue: number;
  broadcastReactivation: number;
  touchTotals: Record<string, number>;
  statusCounts: Record<string, number>;
  sourceTotals: Record<string, number>;
  sources: Array<{
    key: string;
    label: string;
    total: number;
    closing: number;
    revenue: number;
    statuses: Record<string, number>;
  }>;
};

type SortKey =
  | "name"
  | "source"
  | "touch"
  | "campaign"
  | "last_message"
  | "first_seen_at"
  | "last_seen_at"
  | "status"
  | "revenue";

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("id-ID", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(value || 0);
}

function pct(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function roas(value: number) {
  return `${Number(value || 0).toFixed(2)}x`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(new Date(value));
}

function dateInputLocal(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function capiLabel(lead: Lead) {
  if (lead.suppress_capi) return "Historical · CAPI off";
  if (lead.capi_purchase_sent_at) return "Purchase terkirim";
  if (lead.capi_lead_sent_at) return "Lead terkirim";
  if (lead.capi_last_error) return "CAPI error";
  if (lead.ctwa_clid) return "Siap CAPI";
  if (lead.source === "Meta Ads") return "Tanpa CTWA ID";
  return "Non-Meta";
}

function autoLeadScore(status: string, draft: { product_interest?: string; intent?: string; project_size?: string; project_location?: string }) {
  const baseline: Record<string, number> = {
    "Chat Builder": 10,
    "Tanya Kebutuhan": 25,
    "Foto Area Diterima": 45,
    "Qualified": 55,
    "Estimasi Dikirim": 70,
    "Survey Ditawarkan": 78,
    "Survey Terjadwal": 84,
    "Quotation Final": 82,
    "Hot": 90,
    "Closing": 100,
    "Pending": 35,
    "No Response": 15,
    "Lost": 0,
    "Tidak Layak": 0
  };
  let score = baseline[normalizeStatusForScore(status)] ?? 0;
  if (draft.project_size) score += 10;
  if (draft.project_location) score += 5;
  if (draft.product_interest) score += 5;
  if (draft.intent === "Material + Pasang") score += 10;
  else if (draft.intent === "Hitung Kebutuhan") score += 8;
  else if (draft.intent === "Jasa Pasang" || draft.intent === "Survey") score += 6;
  return Math.min(100, score);
}

function normalizeStatusForScore(status: string) {
  if (status === "Tanya Aja") return "Tanya Kebutuhan";
  if (status === "Estimasi Harga") return "Estimasi Dikirim";
  return status;
}

function followUpLabel(value: string | null | undefined, nowMs: number) {
  if (!value) return { text: "+ Jadwalkan FU", overdue: false };
  const date = new Date(value);
  const diff = date.getTime() - nowMs;
  const absHours = Math.max(1, Math.round(Math.abs(diff) / 3600000));
  const now = new Date(nowMs);
  const sameDate = date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) === now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const tomorrow = new Date(nowMs); tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) === tomorrow.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(date);
  if (diff < 0) return { text: `OVERDUE ${absHours} jam`, overdue: true };
  if (sameDate) return { text: `Hari ini ${time}`, overdue: false };
  if (isTomorrow) return { text: `Besok ${time}`, overdue: false };
  return { text: dateTime(value), overdue: false };
}

export default function Dashboard() {
  const today = useMemo(() => new Date(), []);
  const sevenDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d;
  }, []);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadSummary, setLeadSummary] = useState<LeadSummary | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("last_seen_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [drafts, setDrafts] = useState<
    Record<string, { status: string; revenue: string; last_touch_source: string; product_interest: string; intent: string; project_size: string; project_location: string; estimated_value: string; next_follow_up_at: string; follow_up_reason: string; lead_score: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [leadDateBasis, setLeadDateBasis] = useState<"lead" | "activity">("lead");
  const [audienceType, setAudienceType] = useState<
    "all" | "high_intent" | "closing"
  >("all");
  const [quickFilter, setQuickFilter] = useState<"" | "hot" | "estimate" | "qualified" | "ask" | "builder" | "overdue">("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const [since, setSince] = useState(dateInputLocal(sevenDaysAgo));
  const [until, setUntil] = useState(dateInputLocal(today));
  const [performance, setPerformance] = useState<PerformanceResponse | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceSyncing, setPerformanceSyncing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [performanceGroup, setPerformanceGroup] = useState<"campaign" | "ad">(
    "campaign"
  );

  async function load(
    rangeSince = since,
    rangeUntil = until,
    rangeDateBasis: "lead" | "activity" = leadDateBasis
  ) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        since: rangeSince,
        until: rangeUntil,
        date_basis: rangeDateBasis
      });

      if (statusFilter) params.set("status", statusFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      if (q.trim()) params.set("q", q.trim());

      const res = await fetch(`/api/leads?${params.toString()}`, {
        cache: "no-store"
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Gagal mengambil lead.");
      }

      setLeads(json.leads);
      setLeadSummary(json.summary ?? null);

      const nextDrafts: Record<
        string,
        { status: string; revenue: string; last_touch_source: string; product_interest: string; intent: string; project_size: string; project_location: string; estimated_value: string; next_follow_up_at: string; follow_up_reason: string; lead_score: string }
      > = {};

      for (const lead of json.leads) {
        nextDrafts[lead.id] = {
          status: lead.status,
          revenue: String(Number(lead.revenue || 0)),
          last_touch_source: lead.last_touch_source || lead.source || "WhatsApp Organic",
          product_interest: lead.product_interest || "",
          intent: lead.intent || "",
          project_size: lead.project_size || "",
          project_location: lead.project_location || "",
          estimated_value: String(Number(lead.estimated_value || 0)),
          next_follow_up_at: lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toISOString().slice(0,16) : "",
          follow_up_reason: lead.follow_up_reason || "",
          lead_score: String(Number(lead.lead_score || 0))
        };
      }

      setDrafts(nextDrafts);
    } catch (e: any) {
      setError(e.message || "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPerformanceCache(
    rangeSince = since,
    rangeUntil = until
  ) {
    setPerformanceLoading(true);

    try {
      const params = new URLSearchParams({
        since: rangeSince,
        until: rangeUntil
      });

      // GET only reads Supabase cache + CRM data. It NEVER calls Meta.
      const res = await fetch(`/api/meta/performance?${params.toString()}`, {
        cache: "no-store"
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Gagal membaca cache performa.");
      }

      setPerformance(json);
    } catch (e: any) {
      setError(e.message || "Gagal membaca cache performa.");
    } finally {
      setPerformanceLoading(false);
    }
  }

  async function syncPerformance() {
    setPerformanceSyncing(true);
    setNotice("");

    try {
      const params = new URLSearchParams({ since, until });

      // POST is the ONLY performance action that calls Meta.
      // The server also enforces a 15 minute cooldown.
      const res = await fetch(`/api/meta/performance?${params.toString()}`, {
        method: "POST",
        cache: "no-store"
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Sync performa gagal.");
      }

      setPerformance(json);
      setNowMs(Date.now());

      if (json.sync_skipped) {
        setNotice("Sync Meta dilewati karena cooldown 15 menit masih aktif. Data cache tetap digunakan.");
      } else if (json.stale) {
        setNotice("Meta sedang membatasi request. Data performa terakhir tetap digunakan.");
      } else {
        setNotice("Performa Meta berhasil disinkronkan dan disimpan ke cache.");
      }
    } catch (e: any) {
      setError(e.message || "Sync performa gagal.");
    } finally {
      setPerformanceSyncing(false);
    }
  }

  useEffect(() => {
    load();
    loadPerformanceCache();

    const clock = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(clock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sourceFilter]);

  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function saveLead(lead: Lead) {
    const draft = drafts[lead.id];
    if (!draft) return;

    setSavingId(lead.id);
    setError("");
    setNotice("");

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: draft.status,
          revenue: Number(draft.revenue || 0),
          last_touch_source: draft.last_touch_source,
          product_interest: draft.product_interest,
          intent: draft.intent,
          project_size: draft.project_size,
          project_location: draft.project_location,
          next_follow_up_at: draft.next_follow_up_at || null,
          follow_up_reason: draft.follow_up_reason,
          lead_score: autoLeadScore(draft.status, draft)
        })
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Gagal menyimpan lead.");
      }

      if (json?.capi?.purchase?.ok && !json.capi.purchase.skipped) {
        setNotice("Closing tersimpan dan Purchase berhasil dikirim ke Meta.");
      } else if (json?.capi?.lead?.ok && !json.capi.lead.skipped) {
        setNotice("Lead tersimpan dan LeadSubmitted berhasil dikirim ke Meta.");
      } else if (json?.capi?.purchase && !json.capi.purchase.ok) {
        setNotice(
          `Closing tersimpan, tetapi CAPI belum terkirim: ${
            json.capi.purchase.reason || "cek log Meta CAPI"
          }`
        );
      } else if (json?.capi?.lead && !json.capi.lead.ok) {
        setNotice(
          `Status tersimpan, tetapi CAPI belum terkirim: ${
            json.capi.lead.reason || "cek log Meta CAPI"
          }`
        );
      } else {
        setNotice(
          `Tersimpan: Touch/Trigger ${json.lead.last_touch_source || "—"} • Status ${json.lead.status}.`
        );
      }

      setDrafts((current) => ({
        ...current,
        [lead.id]: {
          status: json.lead.status,
          revenue: String(Number(json.lead.revenue || 0)),
          last_touch_source:
            json.lead.last_touch_source || json.lead.source || "WhatsApp Organic",
          product_interest: json.lead.product_interest || "",
          intent: json.lead.intent || "",
          project_size: json.lead.project_size || "",
          project_location: json.lead.project_location || "",
          estimated_value: String(Number(json.lead.estimated_value || 0)),
          next_follow_up_at: json.lead.next_follow_up_at ? new Date(json.lead.next_follow_up_at).toISOString().slice(0,16) : "",
          follow_up_reason: json.lead.follow_up_reason || "",
          lead_score: String(Number(json.lead.lead_score || 0))
        }
      }));

      await load();
      await loadPerformanceCache();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan.");
    } finally {
      setSavingId(null);
    }
  }

  async function backfillMeta() {
    setBackfilling(true);
    setError("");

    try {
      const res = await fetch("/api/meta/backfill", {
        method: "POST"
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Backfill gagal.");
      }

      if (json.sync_skipped) {
        const minutes = Math.max(
          1,
          Math.ceil(Number(json.cooldown_remaining_seconds || 0) / 60)
        );
        setNotice(
          `Sync Nama Iklan dilewati karena cooldown Meta masih aktif. Coba lagi sekitar ${minutes} menit.`
        );
      } else if (json.warning) {
        setNotice(
          `Sync Nama Iklan berhenti aman: ${json.updated ?? 0} lead diperbarui. ${json.warning}`
        );
      } else {
        setNotice(
          `Sync nama iklan selesai: ${json.updated ?? 0} lead diperbarui, ${json.skipped ?? 0} dilewati.`
        );
      }

      await load();
      await loadPerformanceCache();
    } catch (e: any) {
      setError(e.message || "Backfill gagal.");
    } finally {
      setBackfilling(false);
    }
  }

  function setRange(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));

    const nextSince = dateInputLocal(start);
    const nextUntil = dateInputLocal(end);

    setSince(nextSince);
    setUntil(nextUntil);

    // CRM follows selected date basis.
    // Meta performance remains based on the selected acquisition period.
    load(nextSince, nextUntil, leadDateBasis);
    loadPerformanceCache(nextSince, nextUntil);
  }

  function setYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const date = dateInputLocal(yesterday);

    setSince(date);
    setUntil(date);

    load(date, date, leadDateBasis);
    loadPerformanceCache(date, date);
  }

  function changeLeadDateBasis(nextBasis: "lead" | "activity") {
    setLeadDateBasis(nextBasis);

    // Make the table immediately useful for the selected mode.
    setSortKey(nextBasis === "activity" ? "last_seen_at" : "first_seen_at");
    setSortDirection("desc");

    // Switching basis reloads CRM only. It does NOT call Meta.
    load(since, until, nextBasis);
  }


  function exportCustomAudience() {
    const params = new URLSearchParams({
      since,
      until,
      type: audienceType
    });

    // Export uses current dashboard date range.
    // This endpoint only reads Supabase and does not call Meta.
    window.location.href = `/api/leads/export?${params.toString()}`;
  }

  const canSyncPerformance =
    !performance?.can_sync_at ||
    nowMs >= new Date(performance.can_sync_at).getTime();

  const cooldownMinutes = performance?.can_sync_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(performance.can_sync_at).getTime() - nowMs) / 60000
        )
      )
    : 0;

  const summary = useMemo(() => {
    if (leadSummary) return leadSummary;

    const highIntent = leads.filter((l) => HIGH_INTENT_STATUSES.has(l.status)).length;
    const survey = leads.filter((l) =>
      ["Survey Ditawarkan", "Survey Terjadwal"].includes(l.status)
    ).length;
    const closing = leads.filter((l) => l.status === "Closing").length;
    const revenue = leads
      .filter((l) => l.status === "Closing")
      .reduce((sum, l) => sum + Number(l.revenue || 0), 0);

    return {
      total: leads.length,
      highIntent,
      survey,
      closing,
      revenue,
      broadcastReactivation: leads.filter((l) => String(l.last_touch_source || "").includes("Broadcast")).length,
      touchTotals: {},
      statusCounts: Object.fromEntries(
        STATUSES.map((status) => [status, leads.filter((l) => l.status === status).length])
      ),
      sourceTotals: {},
      sources: []
    };
  }, [leadSummary, leads]);

  const statusCounts = summary.statusCounts ?? {};

  const sortedLeads = useMemo(() => {
    const copy = leads.filter((lead) => {
      if (!quickFilter) return true;
      if (quickFilter === "hot") return lead.status === "Hot";
      if (quickFilter === "estimate") return lead.status === "Estimasi Dikirim";
      if (quickFilter === "qualified") return ["Foto Area Diterima", "Qualified"].includes(lead.status);
      if (quickFilter === "ask") return lead.status === "Tanya Kebutuhan";
      if (quickFilter === "builder") return lead.status === "Chat Builder";
      if (quickFilter === "overdue") return Boolean(lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() < nowMs && !["Closing", "Lost", "Tidak Layak"].includes(lead.status));
      return true;
    });

    const valueFor = (lead: Lead) => {
      if (sortKey === "name") return String(lead.name || lead.phone || lead.wa_id || "").toLowerCase();
      if (sortKey === "source") return String(lead.source || "").toLowerCase();
      if (sortKey === "touch") return String(lead.last_touch_source || "").toLowerCase();
      if (sortKey === "campaign") return String(lead.campaign_name || lead.manual_campaign || lead.ad_name || "").toLowerCase();
      if (sortKey === "last_message") return String(lead.last_message || "").toLowerCase();
      if (sortKey === "first_seen_at") return new Date(lead.first_seen_at).getTime();
      if (sortKey === "last_seen_at") return new Date(lead.last_seen_at).getTime();
      if (sortKey === "status") return statusRank(lead.status);
      if (sortKey === "revenue") return Number(lead.revenue || 0);
      return "";
    };

    copy.sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      let result = 0;

      if (typeof av === "number" && typeof bv === "number") result = av - bv;
      else result = String(av).localeCompare(String(bv), "id");

      return sortDirection === "asc" ? result : -result;
    });

    return copy;
  }, [leads, sortKey, sortDirection, quickFilter, nowMs]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "name" || nextKey === "source" || nextKey === "touch" || nextKey === "campaign" ? "asc" : "desc");
  }

  function sortLabel(label: string, key: SortKey) {
    const arrow = sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : " ↕";
    return `${label}${arrow}`;
  }

  function sourceStageCount(statuses: Record<string, number>, stage: string) {
    if (stage === "Chat") return (statuses["Chat Builder"] || 0) + (statuses["Tanya Kebutuhan"] || 0);
    if (stage === "Estimasi") return statuses["Estimasi Dikirim"] || 0;
    if (stage === "Foto") return statuses["Foto Area Diterima"] || 0;
    if (stage === "Qualified") return statuses["Qualified"] || 0;
    if (stage === "Survey") return (statuses["Survey Ditawarkan"] || 0) + (statuses["Survey Terjadwal"] || 0);
    if (stage === "Quotation") return statuses["Quotation Final"] || 0;
    if (stage === "Hot") return statuses["Hot"] || 0;
    if (stage === "Closing") return statuses["Closing"] || 0;
    return 0;
  }

  const performanceRows =
    performanceGroup === "campaign"
      ? performance?.campaigns ?? []
      : performance?.ads ?? [];

  return (
    <main className="shell">
      <div className="header">
        <div>
          <h1>Gudang WPC CRM</h1>
          <p>Tracking WhatsApp → kebutuhan → estimasi → survey → quotation final → closing.</p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="refresh"
            onClick={backfillMeta}
            disabled={backfilling}
          >
            {backfilling ? "Sync Meta…" : "Sync Nama Iklan"}
          </button>

          <button
            className="refresh"
            onClick={() => {
              load();
              loadPerformanceCache();
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {notice && (
        <div
          style={{
            background: "#ecfdf3",
            border: "1px solid #abefc6",
            color: "#067647",
            padding: "10px 12px",
            borderRadius: 10,
            marginBottom: 12
          }}
        >
          {notice}
        </div>
      )}

      <section className="headline-cards">
        <div className="headline-card"><div className="label">{leadDateBasis === "activity" ? "Lead Aktif" : "Total Lead"}</div><div className="value">{summary.total}</div></div>
        <div className="headline-card"><div className="label">High Intent</div><div className="value">{summary.highIntent}</div></div>
        <div className="headline-card"><div className="label">Closing</div><div className="value">{summary.closing}</div></div>
        <div className="headline-card"><div className="label">Revenue Closing</div><div className="value">{rupiah(summary.revenue)}</div></div>
      </section>
      <div className="attribution-strip">
        <span><b>Meta</b> {summary.sourceTotals?.meta ?? 0}</span>
        <span><b>Organic</b> {summary.sourceTotals?.organic ?? 0}</span>
        <span><b>Unattributed</b> {summary.sourceTotals?.legacy ?? 0}</span>
        <span><b>Reaktivasi</b> {summary.broadcastReactivation ?? 0}</span>
        <span><b>Survey</b> {summary.survey}</span>
      </div>

      <section className="card" style={{ marginBottom: 18, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 18px 10px" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Sumber & Status Lead</h2>
          <div className="sub">
            {leadDateBasis === "activity"
              ? "Menampilkan lead yang aktivitas WhatsApp terakhirnya berada pada periode terpilih; sumber tetap berdasarkan first touch."
              : "Menampilkan lead yang pertama kali masuk pada periode terpilih; sumber tetap berdasarkan first touch."}{" "}
            Broadcast dipisahkan sebagai reaktivasi/touch.
          </div>
        </div>
        <div className="table-wrap">
          <table style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>Sumber</th>
                <th>Total</th>
                <th>Chat / Tanya</th>
                <th>Estimasi</th>
                <th>Foto Area</th>
                <th>Qualified</th>
                <th>Survey</th>
                <th>Quotation Final</th>
                <th>Hot</th>
                <th>Closing</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(summary.sources ?? []).map((row) => (
                <tr key={row.key}>
                  <td><div className="name">{row.label}</div></td>
                  <td>{row.total}</td>
                  <td>{sourceStageCount(row.statuses, "Chat")}</td>
                  <td>{sourceStageCount(row.statuses, "Estimasi")}</td>
                  <td>{sourceStageCount(row.statuses, "Foto")}</td>
                  <td>{sourceStageCount(row.statuses, "Qualified")}</td>
                  <td>{sourceStageCount(row.statuses, "Survey")}</td>
                  <td>{sourceStageCount(row.statuses, "Quotation")}</td>
                  <td>{sourceStageCount(row.statuses, "Hot")}</td>
                  <td>{row.closing}</td>
                  <td>{rupiah(row.revenue)}</td>
                </tr>
              ))}
              {(summary.sources ?? []).length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", color: "#667085", padding: 24 }}>
                    Belum ada lead pada periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="card"
        style={{ marginBottom: 18, padding: 18 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 16
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 21 }}>Performa Iklan</h2>
            <div className="sub" style={{ fontSize: 13 }}>
              Spend/CPL/ROAS Meta tetap berdasarkan periode tanggal yang dipilih. Kartu, funnel, dan tabel CRM mengikuti mode {leadDateBasis === "activity" ? "Aktivitas Terakhir" : "Lead Masuk"}. Refresh biasa tidak memanggil Meta.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center"
            }}
          >
            <select
              className="control"
              value={leadDateBasis}
              onChange={(e) =>
                changeLeadDateBasis(
                  e.target.value as "lead" | "activity"
                )
              }
              title="Pilih basis tanggal untuk lead CRM"
              style={{ minWidth: 180 }}
            >
              <option value="lead">Filter: Lead Masuk</option>
              <option value="activity">Filter: Aktivitas Terakhir</option>
            </select>

            <button className="refresh" onClick={() => setRange(1)}>
              Hari ini
            </button>
            <button className="refresh" onClick={setYesterday}>
              Kemarin
            </button>
            <button className="refresh" onClick={() => setRange(7)}>
              7 hari
            </button>
            <button className="refresh" onClick={() => setRange(30)}>
              30 hari
            </button>

            <input
              className="control"
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              style={{ width: 145 }}
            />
            <span style={{ color: "#667085" }}>–</span>
            <input
              className="control"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              style={{ width: 145 }}
            />
            <button
              className="refresh"
              onClick={() => {
                load(since, until, leadDateBasis);
                loadPerformanceCache(since, until);
              }}
              disabled={performanceLoading || loading}
              title="Memfilter lead CRM + membaca cache performa, tanpa request ke Meta"
            >
              {performanceLoading || loading ? "Memuat…" : "Terapkan Filter"}
            </button>

            <button
              className="save"
              onClick={syncPerformance}
              disabled={performanceSyncing || !canSyncPerformance}
              title={
                canSyncPerformance
                  ? "Ambil data terbaru dari Meta Ads"
                  : "Cooldown server 15 menit untuk mencegah request berlebihan"
              }
            >
              {performanceSyncing
                ? "Sync Meta…"
                : canSyncPerformance
                  ? "Sync Performa Meta"
                  : `Sync lagi ${cooldownMinutes} m`}
            </button>
          </div>
        </div>

        <div
          className="sub"
          style={{
            marginBottom: 10,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <span>
            {performance?.last_synced_at
              ? `Sync Meta terakhir: ${dateTime(performance.last_synced_at)}`
              : "Belum pernah sync Meta untuk periode ini."}
          </span>
          <span>•</span>
          <span>
            Meta hanya dipanggil saat tombol “Sync Performa Meta” ditekan.
          </span>
          {performance?.stale && (
            <>
              <span>•</span>
              <strong style={{ color: "#b54708" }}>
                Menampilkan cache terakhir
              </strong>
            </>
          )}
        </div>

        {performance?.warning && (
          <div
            style={{
              background: "#fffaeb",
              border: "1px solid #fedf89",
              color: "#93370d",
              padding: "10px 12px",
              borderRadius: 10,
              marginBottom: 12
            }}
          >
            {performance.warning}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
            marginBottom: 16,
            overflowX: "auto"
          }}
        >
          {[
            ["Spend", rupiah(performance?.summary?.spend ?? 0)],
            ["Lead", compactNumber(performance?.summary?.leads ?? 0)],
            ["Estimasi", compactNumber(performance?.summary?.estimate ?? 0)],
            ["Qualified", compactNumber(performance?.summary?.qualified ?? 0)],
            ["Survey", compactNumber(performance?.summary?.survey ?? 0)],
            ["Closing Cohort", compactNumber(performance?.summary?.closing ?? 0)],
            ["Revenue Cohort", rupiah(performance?.summary?.revenue ?? 0)],
            ["Closing Aktual", compactNumber(performance?.closing_activity?.closing ?? 0)],
            ["Revenue Aktual", rupiah(performance?.closing_activity?.revenue ?? 0)],
            ["ROAS Cohort", roas(performance?.summary?.roas ?? 0)]
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                minWidth: 130
              }}
            >
              <div className="label">{label}</div>
              <div style={{ fontWeight: 800, fontSize: 18, whiteSpace: "nowrap" }}>{value}</div>
            </div>
          ))}
        </div>

        <div
          className="sub"
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "#fafafa"
          }}
        >
          <strong>Catatan atribusi:</strong> Revenue Cohort mengikuti tanggal pertama lead Meta Ads masuk CRM.
          {" "}Closing Meta Ads yang benar-benar terjadi pada periode ini: <strong>{performance?.closing_activity?.closing ?? 0}</strong>
          {" "}dengan revenue <strong>{rupiah(performance?.closing_activity?.revenue ?? 0)}</strong>.
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 10
          }}
        >
          <button
            className="refresh"
            onClick={() => setPerformanceGroup("campaign")}
            style={{
              fontWeight: performanceGroup === "campaign" ? 800 : 500
            }}
          >
            Per Campaign
          </button>
          <button
            className="refresh"
            onClick={() => setPerformanceGroup("ad")}
            style={{
              fontWeight: performanceGroup === "ad" ? 800 : 500
            }}
          >
            Per Ad
          </button>
        </div>

        <div className="table-wrap">
          <table style={{ minWidth: 1400 }}>
            <thead>
              <tr>
                <th>{performanceGroup === "campaign" ? "Campaign" : "Ad"}</th>
                {performanceGroup === "ad" && <th>Campaign / Ad Set</th>}
                <th>Spend</th>
                <th>Lead</th>
                <th>Estimasi</th>
                <th>Qualified</th>
                <th>Survey</th>
                <th>Quotation Final</th>
                <th>Hot</th>
                <th>Closing</th>
                <th>Revenue</th>
                <th>CPL</th>
                <th>Cost/Qualified</th>
                <th>Cost/Closing</th>
                <th>Closing Rate</th>
                <th>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {!performanceLoading &&
                performanceRows.map((row: any) => (
                  <tr key={row.id}>
                    <td>
                      <div className="name">
                        {performanceGroup === "campaign"
                          ? row.campaign_name
                          : row.ad_name}
                      </div>
                      {performanceGroup === "ad" && (
                        <div className="sub">Ad ID: {row.id}</div>
                      )}
                    </td>

                    {performanceGroup === "ad" && (
                      <td>
                        <div>{row.campaign_name}</div>
                        <div className="sub">{row.adset_name}</div>
                      </td>
                    )}

                    <td>{rupiah(row.metrics.spend)}</td>
                    <td>{row.metrics.leads}</td>
                    <td>{row.metrics.estimate}</td>
                    <td>
                      {row.metrics.qualified}
                      <div className="sub">{pct(row.metrics.qualified_rate)}</div>
                    </td>
                    <td>{row.metrics.survey}</td>
                    <td>{row.metrics.quotation}</td>
                    <td>{row.metrics.hot}</td>
                    <td>{row.metrics.closing}</td>
                    <td>{rupiah(row.metrics.revenue)}</td>
                    <td>{rupiah(row.metrics.cpl)}</td>
                    <td>{rupiah(row.metrics.cost_per_qualified)}</td>
                    <td>
                      {row.metrics.closing > 0
                        ? rupiah(row.metrics.cost_per_closing)
                        : "—"}
                    </td>
                    <td>{pct(row.metrics.closing_rate)}</td>
                    <td
                      style={{
                        fontWeight: 800,
                        color:
                          row.metrics.roas > 1
                            ? "#067647"
                            : row.metrics.spend > 0
                              ? "#b42318"
                              : undefined
                      }}
                    >
                      {roas(row.metrics.roas)}
                    </td>
                  </tr>
                ))}

              {!performanceLoading && performanceRows.length === 0 && (
                <tr>
                  <td
                    colSpan={performanceGroup === "campaign" ? 15 : 16}
                    style={{ textAlign: "center", color: "#667085", padding: 30 }}
                  >
                    Belum ada data performa pada periode ini.
                  </td>
                </tr>
              )}

              {performanceLoading && (
                <tr>
                  <td
                    colSpan={performanceGroup === "campaign" ? 15 : 16}
                    style={{ textAlign: "center", color: "#667085", padding: 30 }}
                  >
                    Memuat performa Meta Ads…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>Butuh Tindakan Hari Ini</h2>
            <div className="sub">Prioritas kerja sales. Follow-up yang lewat jadwal ditandai overdue di tabel.</div>
          </div>
          <div className="action-cards">
            <button className={`action-card-button ${quickFilter === "hot" ? "active" : ""}`} onClick={() => setQuickFilter(quickFilter === "hot" ? "" : "hot")}><b>{leads.filter(l => l.status === "Hot").length}</b><span>Hot</span></button>
            <button className={`action-card-button ${quickFilter === "estimate" ? "active" : ""}`} onClick={() => setQuickFilter(quickFilter === "estimate" ? "" : "estimate")}><b>{leads.filter(l => l.status === "Estimasi Dikirim").length}</b><span>Estimasi</span></button>
            <button className={`action-card-button ${quickFilter === "qualified" ? "active" : ""}`} onClick={() => setQuickFilter(quickFilter === "qualified" ? "" : "qualified")}><b>{leads.filter(l => ["Foto Area Diterima","Qualified"].includes(l.status)).length}</b><span>Qualified</span></button>
            <button className={`action-card-button ${quickFilter === "ask" ? "active" : ""}`} onClick={() => setQuickFilter(quickFilter === "ask" ? "" : "ask")}><b>{leads.filter(l => l.status === "Tanya Kebutuhan").length}</b><span>Tanya Aja</span></button>
            <button className={`action-card-button ${quickFilter === "builder" ? "active" : ""}`} onClick={() => setQuickFilter(quickFilter === "builder" ? "" : "builder")}><b>{leads.filter(l => l.status === "Chat Builder").length}</b><span>Builder</span></button>
            <button className={`action-card-button ${quickFilter === "overdue" ? "active" : ""}`} onClick={() => setQuickFilter(quickFilter === "overdue" ? "" : "overdue")}><b>{leads.filter(l => l.next_follow_up_at && new Date(l.next_follow_up_at).getTime() < nowMs && !["Closing","Lost","Tidak Layak"].includes(l.status)).length}</b><span>Overdue</span></button>
          </div>
        </div>
      </section>

      <div
        className="sub"
        style={{
          margin: "4px 0 8px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center"
        }}
      >
        <strong>
          {leadDateBasis === "activity"
            ? "Periode Aktivitas:"
            : "Periode Lead Masuk:"}
        </strong>
        <span>{since} s.d. {until}</span>
        <span>•</span>
        <span>
          {leadDateBasis === "activity"
            ? "Lead difilter dari aktivitas WhatsApp terakhir (last_seen_at)."
            : "Lead difilter dari waktu pertama masuk CRM (first_seen_at)."}
        </span>
      </div>

      <div className="funnel">
        {STATUSES.map((status) => (
          <span className="pill" key={status}>
            {statusLabel(status)}
            <b>{statusCounts[status] ?? 0}</b>
          </span>
        ))}
      </div>

      <section className="toolbar">
        <input
          className="control"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, nomor WA, pesan…"
        />

        <select
          className="control"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Semua status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>

        <select
          className="control"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="">Semua sumber</option>
          <option value="meta">Meta Ads</option>
          <option value="organic">Organic</option>
          <option value="legacy">Belum Teratribusi</option>
          <option value="walkin">Walk-in</option>
          <option value="referral">Referral</option>
        </select>
      </section>

      <section
        className="card"
        style={{
          marginBottom: 14,
          padding: 14,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap"
        }}
      >
        <div style={{ minWidth: 240, flex: "1 1 280px" }}>
          <div className="label">Export Custom Audience Meta</div>
          <div className="sub">
            Mengikuti periode {since} s.d. {until}. Export audience tetap berdasarkan tanggal Lead Masuk, bukan aktivitas terakhir. Tidak memanggil API Meta.
          </div>
        </div>

        <select
          className="control"
          value={audienceType}
          onChange={(e) =>
            setAudienceType(
              e.target.value as "all" | "high_intent" | "closing"
            )
          }
          style={{ minWidth: 220 }}
        >
          <option value="all">All Leads</option>
          <option value="high_intent">
            High Intent (Foto / Qualified / Survey / Quotation Final / Hot)
          </option>
          <option value="closing">Closing</option>
        </select>

        <button className="save" onClick={exportCustomAudience}>
          Export CSV Meta
        </button>
      </section>

      <section className="panel lead-panel">
        {quickFilter && <div className="quick-filter-banner">Filter cepat aktif: <strong>{{hot:"Hot",estimate:"Estimasi",qualified:"Qualified",ask:"Tanya Aja",builder:"Builder",overdue:"Overdue"}[quickFilter]}</strong><button onClick={() => setQuickFilter("")}>Tampilkan semua</button></div>}
        <div className="table-wrap lead-table-wrap">
          <table className="lead-table">
            <thead>
              <tr>
                <th><button className="sort-button" onClick={() => toggleSort("name")}>{sortLabel("Lead", "name")}</button></th>
                <th><button className="sort-button" onClick={() => toggleSort("first_seen_at")}>{sortLabel("Masuk", "first_seen_at")}</button></th>
                <th><button className="sort-button" onClick={() => toggleSort("last_seen_at")}>{sortLabel("Aktivitas", "last_seen_at")}</button></th>
                <th><button className="sort-button" onClick={() => toggleSort("status")}>{sortLabel("Status", "status")}</button></th>
                <th>Score</th>
                <th>Next Action</th>
                <th>Next FU</th>
                <th><button className="sort-button" onClick={() => toggleSort("revenue")}>{sortLabel("Revenue", "revenue")}</button></th>
                <th>CAPI</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {!loading && sortedLeads.map((lead) => {
                const draft = drafts[lead.id] ?? {
                  status: lead.status, revenue: String(Number(lead.revenue || 0)), last_touch_source: lead.last_touch_source || lead.source || "WhatsApp Organic",
                  product_interest: lead.product_interest || "", intent: lead.intent || "", project_size: lead.project_size || "", project_location: lead.project_location || "",
                  estimated_value: String(Number(lead.estimated_value || 0)), next_follow_up_at: lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toISOString().slice(0,16) : "", follow_up_reason: lead.follow_up_reason || "", lead_score: String(Number(lead.lead_score || 0))
                };
                const score = autoLeadScore(draft.status, draft);
                const followUp = followUpLabel(draft.next_follow_up_at || lead.next_follow_up_at, nowMs);
                const expanded = Boolean(expandedRows[lead.id]);
                return (
                  <Fragment key={lead.id}>
                    <tr className={followUp.overdue ? "lead-row overdue-row" : "lead-row"}>
                      <td className="sticky-lead">
                        <div className="name">{lead.name || "Tanpa nama"}</div>
                        <div className="sub">{lead.phone || `+${lead.wa_id}`}</div>
                        <div className="lead-source-line">{lead.source}{lead.campaign_name ? ` · ${lead.campaign_name}` : ""}</div>
                      </td>
                      <td><div className="compact-date">{dateTime(lead.first_seen_at)}</div></td>
                      <td><div className="compact-date">{dateTime(lead.last_seen_at)}</div></td>
                      <td>
                        <select className="status-select compact-select" value={draft.status} onChange={(e) => setDrafts((d) => ({...d,[lead.id]: {...draft,status:e.target.value}}))}>
                          {STATUSES.map((x) => <option key={x} value={x}>{statusLabel(x)}</option>)}
                        </select>
                      </td>
                      <td><span className={`score-badge score-${score >= 85 ? "hot" : score >= 55 ? "warm" : "low"}`}>{score}</span></td>
                      <td><div className={`next-action compact-next status-${draft.status.replace(/\s+/g,"-").toLowerCase()}`}><strong>Next:</strong> {suggestedNextAction(draft.status)}</div></td>
                      <td><button className={followUp.overdue ? "followup-chip overdue-chip" : "followup-chip"} onClick={() => setExpandedRows((x) => ({...x,[lead.id]:true}))}>{followUp.text}</button></td>
                      <td><input className="revenue compact-revenue" inputMode="numeric" value={draft.revenue} onChange={(e) => setDrafts((d) => ({...d,[lead.id]: {...draft,revenue:e.target.value.replace(/[^\d]/g,"")}}))}/></td>
                      <td><div className={lead.capi_purchase_sent_at || lead.capi_lead_sent_at ? "source-meta capi-small" : "capi-small"}>{capiLabel(lead)}</div></td>
                      <td><div className="row-actions"><button className="detail-button" onClick={() => setExpandedRows((x) => ({...x,[lead.id]:!expanded}))}>{expanded ? "Tutup" : "Detail Sales"}</button><button className="save" disabled={savingId === lead.id} onClick={() => saveLead(lead)}>{savingId === lead.id ? "Simpan…" : "Simpan"}</button></div></td>
                    </tr>
                    {expanded && (
                      <tr className="detail-row"><td colSpan={10}>
                        <div className="sales-detail-grid">
                          <div className="detail-block">
                            <div className="detail-title">Konteks Lead</div>
                            <div className="detail-message">{lead.last_message || "Belum ada pesan terakhir."}</div>
                            <div className="detail-meta"><b>First touch:</b> {lead.source} · <b>Touch terakhir:</b> {draft.last_touch_source}</div>
                            <div className="detail-meta"><b>Campaign:</b> {lead.campaign_name || lead.manual_campaign || "—"}</div>
                            <div className="detail-meta"><b>Ad Set:</b> {lead.adset_name || "—"} · <b>Ad:</b> {lead.ad_name || "—"}</div>
                          </div>
                          <div className="detail-block">
                            <div className="detail-title">Kebutuhan Proyek</div>
                            <div className="sales-grid">
                              <select className="mini-control" value={draft.product_interest} onChange={(e) => setDrafts((d) => ({...d,[lead.id]: {...draft,product_interest:e.target.value}}))}><option value="">Produk</option>{PRODUCTS.map((x)=><option key={x} value={x}>{x}</option>)}</select>
                              <select className="mini-control" value={draft.intent} onChange={(e) => setDrafts((d) => ({...d,[lead.id]: {...draft,intent:e.target.value}}))}><option value="">Intent</option>{INTENTS.map((x)=><option key={x} value={x}>{x}</option>)}</select>
                              <input className="mini-control" placeholder="Ukuran 3x3,5 m" value={draft.project_size} onChange={(e) => setDrafts((d) => ({...d,[lead.id]: {...draft,project_size:e.target.value}}))}/>
                              <input className="mini-control" placeholder="Lokasi proyek" value={draft.project_location} onChange={(e) => setDrafts((d) => ({...d,[lead.id]: {...draft,project_location:e.target.value}}))}/>
                            </div>
                          </div>
                          <div className="detail-block">
                            <div className="detail-title">Follow Up</div>
                            <div className="sales-grid">
                              <input className="mini-control" type="datetime-local" value={draft.next_follow_up_at} onChange={(e) => setDrafts((d) => ({...d,[lead.id]: {...draft,next_follow_up_at:e.target.value}}))}/>
                              <select className="mini-control" value={draft.follow_up_reason} onChange={(e) => setDrafts((d) => ({...d,[lead.id]: {...draft,follow_up_reason:e.target.value}}))}><option value="">Alasan FU</option>{FOLLOW_UP_REASONS.map((x)=><option key={x} value={x}>{x}</option>)}</select>
                              <select className="mini-control" value={draft.last_touch_source} onChange={(e) => setDrafts((d) => ({...d,[lead.id]: {...draft,last_touch_source:e.target.value}}))}>{TOUCH_OPTIONS.map((x)=><option key={x} value={x}>{x}</option>)}</select>
                              <div className="auto-score-box"><span>Auto Score</span><strong>{score}/100</strong><small>Dihitung dari status + data kebutuhan</small></div>
                            </div>
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && sortedLeads.length === 0 && <div className="empty">Belum ada lead untuk filter ini.</div>}
        {loading && <div className="empty">Memuat lead…</div>}
      </section>
    </main>
  );
}
