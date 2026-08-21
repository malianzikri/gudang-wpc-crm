"use client";

import { useEffect, useMemo, useState } from "react";

const STATUSES = [
  "Chat Builder",
  "Tanya Aja",
  "Qualified",
  "Quotation Dikirim",
  "Hot",
  "Closing",
  "Tidak Layak"
];

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
  last_message: string | null;
  last_seen_at: string;
  revenue: number | string;
  ctwa_clid: string | null;
  capi_lead_sent_at: string | null;
  capi_purchase_sent_at: string | null;
  capi_last_error: string | null;
};

type PerformanceMetrics = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  qualified: number;
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
};

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
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function capiLabel(lead: Lead) {
  if (lead.capi_purchase_sent_at) return "Purchase terkirim";
  if (lead.capi_lead_sent_at) return "Lead terkirim";
  if (lead.capi_last_error) return "CAPI error";
  if (lead.source === "Meta Ads" && lead.ctwa_clid) return "Siap CAPI";
  if (lead.source === "Meta Ads") return "Tanpa CTWA ID";
  return "Organic";
}

export default function Dashboard() {
  const today = useMemo(() => new Date(), []);
  const sevenDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d;
  }, []);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [drafts, setDrafts] = useState<
    Record<string, { status: string; revenue: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const [since, setSince] = useState(dateInputLocal(sevenDaysAgo));
  const [until, setUntil] = useState(dateInputLocal(today));
  const [performance, setPerformance] = useState<PerformanceResponse | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceGroup, setPerformanceGroup] = useState<"campaign" | "ad">(
    "campaign"
  );

  async function load() {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

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

      const nextDrafts: Record<
        string,
        { status: string; revenue: string }
      > = {};

      for (const lead of json.leads) {
        nextDrafts[lead.id] = {
          status: lead.status,
          revenue: String(Number(lead.revenue || 0))
        };
      }

      setDrafts(nextDrafts);
    } catch (e: any) {
      setError(e.message || "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPerformance() {
    setPerformanceLoading(true);

    try {
      const params = new URLSearchParams({ since, until });

      const res = await fetch(`/api/meta/performance?${params.toString()}`, {
        cache: "no-store"
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Gagal mengambil performa iklan.");
      }

      setPerformance(json);
    } catch (e: any) {
      setError(e.message || "Gagal mengambil performa iklan.");
    } finally {
      setPerformanceLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadPerformance();
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
          revenue: Number(draft.revenue || 0)
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
      }

      await load();
      await loadPerformance();
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

      await load();
      await loadPerformance();
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
    setSince(dateInputLocal(start));
    setUntil(dateInputLocal(end));

    setTimeout(() => {
      const params = new URLSearchParams({
        since: dateInputLocal(start),
        until: dateInputLocal(end)
      });

      setPerformanceLoading(true);

      fetch(`/api/meta/performance?${params.toString()}`, {
        cache: "no-store"
      })
        .then((r) => r.json().then((j) => ({ r, j })))
        .then(({ r, j }) => {
          if (!r.ok || !j.ok) throw new Error(j.error || "Gagal mengambil data.");
          setPerformance(j);
        })
        .catch((e) => setError(e.message))
        .finally(() => setPerformanceLoading(false));
    }, 0);
  }

  const summary = useMemo(() => {
    const highIntent = leads.filter((l) =>
      ["Qualified", "Quotation Dikirim", "Hot", "Closing"].includes(l.status)
    ).length;

    const closing = leads.filter((l) => l.status === "Closing").length;

    const revenue = leads
      .filter((l) => l.status === "Closing")
      .reduce((sum, l) => sum + Number(l.revenue || 0), 0);

    return {
      total: leads.length,
      highIntent,
      closing,
      revenue
    };
  }, [leads]);

  const statusCounts = useMemo(() => {
    return Object.fromEntries(
      STATUSES.map((s) => [
        s,
        leads.filter((l) => l.status === s).length
      ])
    );
  }, [leads]);

  const performanceRows =
    performanceGroup === "campaign"
      ? performance?.campaigns ?? []
      : performance?.ads ?? [];

  return (
    <main className="shell">
      <div className="header">
        <div>
          <h1>Gudang WPC CRM</h1>
          <p>Tracking WhatsApp → qualified → quotation → closing.</p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="refresh"
            onClick={backfillMeta}
            disabled={backfilling}
          >
            {backfilling ? "Sync Meta…" : "Sync Nama Iklan"}
          </button>

          <button className="refresh" onClick={() => {
            load();
            loadPerformance();
          }}>
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

      <section className="cards">
        <div className="card">
          <div className="label">Total lead</div>
          <div className="value">{summary.total}</div>
        </div>

        <div className="card">
          <div className="label">High Intent</div>
          <div className="value">{summary.highIntent}</div>
        </div>

        <div className="card">
          <div className="label">Closing</div>
          <div className="value">{summary.closing}</div>
        </div>

        <div className="card">
          <div className="label">Revenue Closing</div>
          <div className="value">{rupiah(summary.revenue)}</div>
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
              Spend Meta digabung dengan funnel dan revenue CRM.
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
            <button className="refresh" onClick={() => setRange(1)}>
              Hari ini
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
              className="save"
              onClick={loadPerformance}
              disabled={performanceLoading}
            >
              {performanceLoading ? "Memuat…" : "Terapkan"}
            </button>
          </div>
        </div>

        {performance?.warning && (
          <div className="error" style={{ marginBottom: 12 }}>
            {performance.warning}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(130px, 1fr))",
            gap: 10,
            marginBottom: 16,
            overflowX: "auto"
          }}
        >
          {[
            ["Spend", rupiah(performance?.summary?.spend ?? 0)],
            ["Lead", compactNumber(performance?.summary?.leads ?? 0)],
            ["Qualified", compactNumber(performance?.summary?.qualified ?? 0)],
            ["Closing", compactNumber(performance?.summary?.closing ?? 0)],
            ["Revenue", rupiah(performance?.summary?.revenue ?? 0)],
            ["ROAS", roas(performance?.summary?.roas ?? 0)]
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
              <div style={{ fontWeight: 800, fontSize: 20 }}>{value}</div>
            </div>
          ))}
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
                <th>Qualified</th>
                <th>Quotation</th>
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
                    <td>
                      {row.metrics.qualified}
                      <div className="sub">{pct(row.metrics.qualified_rate)}</div>
                    </td>
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
                    colSpan={performanceGroup === "campaign" ? 13 : 14}
                    style={{ textAlign: "center", color: "#667085", padding: 30 }}
                  >
                    Belum ada data performa pada periode ini.
                  </td>
                </tr>
              )}

              {performanceLoading && (
                <tr>
                  <td
                    colSpan={performanceGroup === "campaign" ? 13 : 14}
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

      <div className="funnel">
        {STATUSES.map((status) => (
          <span className="pill" key={status}>
            {status}
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
              {s}
            </option>
          ))}
        </select>

        <select
          className="control"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="">Semua sumber</option>
          <option value="Meta Ads">Meta Ads</option>
          <option value="WhatsApp Organic">WhatsApp Organic</option>
        </select>
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table style={{ minWidth: 1450 }}>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Sumber</th>
                <th>Campaign / Ad Set / Ad</th>
                <th>Pesan terakhir</th>
                <th>Waktu</th>
                <th>Status</th>
                <th>Revenue</th>
                <th>Meta CAPI</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                leads.map((lead) => {
                  const draft = drafts[lead.id] ?? {
                    status: lead.status,
                    revenue: String(Number(lead.revenue || 0))
                  };

                  return (
                    <tr key={lead.id}>
                      <td>
                        <div className="name">
                          {lead.name || "Tanpa nama"}
                        </div>
                        <div className="sub">
                          {lead.phone || `+${lead.wa_id}`}
                        </div>
                      </td>

                      <td>
                        <div
                          className={
                            lead.source === "Meta Ads"
                              ? "source-meta"
                              : ""
                          }
                        >
                          {lead.source}
                        </div>

                        {lead.source_id && (
                          <div className="sub">
                            Ad ID: {lead.source_id}
                          </div>
                        )}
                      </td>

                      <td style={{ minWidth: 280 }}>
                        {lead.campaign_name ? (
                          <>
                            <div>
                              <strong>Campaign:</strong>{" "}
                              {lead.campaign_name}
                            </div>
                            <div className="sub">
                              <strong>Ad Set:</strong>{" "}
                              {lead.adset_name || "—"}
                            </div>
                            <div className="sub">
                              <strong>Ad:</strong>{" "}
                              {lead.ad_name || "—"}
                            </div>
                          </>
                        ) : (
                          <>
                            <div>{lead.ad_headline || "—"}</div>
                            {lead.source === "Meta Ads" && (
                              <div className="sub">
                                Klik “Sync Nama Iklan”
                              </div>
                            )}
                          </>
                        )}
                      </td>

                      <td>
                        <div className="message">
                          {lead.last_message || "—"}
                        </div>
                      </td>

                      <td>{dateTime(lead.last_seen_at)}</td>

                      <td>
                        <select
                          className="status-select"
                          value={draft.status}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [lead.id]: {
                                ...draft,
                                status: e.target.value
                              }
                            }))
                          }
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <input
                          className="revenue"
                          inputMode="numeric"
                          value={draft.revenue}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [lead.id]: {
                                ...draft,
                                revenue:
                                  e.target.value.replace(/[^\d]/g, "")
                              }
                            }))
                          }
                        />
                      </td>

                      <td style={{ minWidth: 150 }}>
                        <div
                          className={
                            lead.capi_purchase_sent_at ||
                            lead.capi_lead_sent_at
                              ? "source-meta"
                              : ""
                          }
                          title={lead.capi_last_error || undefined}
                        >
                          {capiLabel(lead)}
                        </div>

                        {lead.capi_last_error && (
                          <div className="sub">
                            {lead.capi_last_error.slice(0, 90)}
                          </div>
                        )}
                      </td>

                      <td>
                        <button
                          className="save"
                          disabled={savingId === lead.id}
                          onClick={() => saveLead(lead)}
                        >
                          {savingId === lead.id
                            ? "Simpan…"
                            : "Simpan"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!loading && leads.length === 0 && (
          <div className="empty">Belum ada lead.</div>
        )}

        {loading && <div className="empty">Memuat lead…</div>}
      </section>
    </main>
  );
}
