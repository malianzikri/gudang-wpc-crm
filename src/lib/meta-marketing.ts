type MetaAdAttribution = {
  ad_id: string;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  creative_id: string | null;
};

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";

export async function fetchMetaAdAttribution(
  adId: string
): Promise<MetaAdAttribution | null> {
  const token = process.env.META_MARKETING_ACCESS_TOKEN;

  if (!token || !adId) return null;

  const fields =
    "id,name,campaign{id,name},adset{id,name},adcreatives{id,name}";

  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(adId)}`
  );

  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store"
  });

  const json = await response.json();

  if (!response.ok || json?.error) {
    console.error("Meta Marketing API error:", {
      status: response.status,
      error: json?.error
    });
    return null;
  }

  const creative = Array.isArray(json?.adcreatives?.data)
    ? json.adcreatives.data[0]
    : null;

  return {
    ad_id: String(json?.id ?? adId),
    ad_name: json?.name ?? null,
    adset_id: json?.adset?.id ? String(json.adset.id) : null,
    adset_name: json?.adset?.name ?? null,
    campaign_id: json?.campaign?.id ? String(json.campaign.id) : null,
    campaign_name: json?.campaign?.name ?? null,
    creative_id: creative?.id ? String(creative.id) : null
  };
}
