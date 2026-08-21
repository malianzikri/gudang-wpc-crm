type MetaInsightRow = {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
};

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";

async function graphGet(path: string, params: Record<string, string>) {
  const token = process.env.META_MARKETING_ACCESS_TOKEN;
  if (!token) {
    throw new Error("META_MARKETING_ACCESS_TOKEN belum dikonfigurasi.");
  }

  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("access_token", token);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store"
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok || json?.error) {
    const message =
      json?.error?.message ||
      json?.error?.error_user_msg ||
      `Meta API HTTP ${response.status}`;

    throw new Error(message);
  }

  return json;
}

export async function resolveAdAccountId(adId: string): Promise<string> {
  const json = await graphGet(encodeURIComponent(adId), {
    fields: "account_id"
  });

  if (!json?.account_id) {
    throw new Error("Ad Account ID tidak ditemukan dari Ad ID.");
  }

  return String(json.account_id);
}

export async function fetchAdInsights(
  accountId: string,
  since: string,
  until: string
): Promise<MetaInsightRow[]> {
  const fields = [
    "ad_id",
    "ad_name",
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "ctr",
    "cpc",
    "cpm"
  ].join(",");

  const allRows: MetaInsightRow[] = [];
  let nextUrl: string | null = null;

  const first = await graphGet(`act_${encodeURIComponent(accountId)}/insights`, {
    level: "ad",
    fields,
    time_range: JSON.stringify({ since, until }),
    limit: "500"
  });

  allRows.push(...(first?.data ?? []));
  nextUrl = first?.paging?.next ?? null;

  let pageGuard = 0;

  while (nextUrl && pageGuard < 20) {
    pageGuard++;

    const token = process.env.META_MARKETING_ACCESS_TOKEN;
    if (!token) break;

    const url = new URL(nextUrl);

    // Keep the server-side token authoritative.
    url.searchParams.set("access_token", token);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store"
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok || json?.error) {
      throw new Error(
        json?.error?.message || `Meta Insights pagination HTTP ${response.status}`
      );
    }

    allRows.push(...(json?.data ?? []));
    nextUrl = json?.paging?.next ?? null;
  }

  return allRows;
}
