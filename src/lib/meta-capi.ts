import { supabaseAdmin } from "@/lib/supabase-admin";

export type MessagingEventName = "LeadSubmitted" | "Purchase";

type LeadForCapi = {
  id: string;
  source: string | null;
  ctwa_clid: string | null;
  revenue: number | string | null;
  capi_lead_sent_at?: string | null;
  capi_purchase_sent_at?: string | null;
};

type SendResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status?: number;
  response?: any;
};

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";

function eventIdFor(leadId: string, eventName: MessagingEventName) {
  return `wpc-crm:${eventName}:${leadId}:v1`;
}

export function capiConfigStatus() {
  return {
    dataset: Boolean(process.env.META_DATASET_ID),
    token: Boolean(process.env.META_CAPI_ACCESS_TOKEN),
    waba: Boolean(process.env.WHATSAPP_WABA_ID),
    graphVersion: GRAPH_VERSION
  };
}

export async function sendMessagingConversion(
  lead: LeadForCapi,
  eventName: MessagingEventName
): Promise<SendResult> {
  const datasetId = process.env.META_DATASET_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_WABA_ID;

  if (!datasetId || !token || !wabaId) {
    return {
      ok: false,
      skipped: true,
      reason: "CAPI environment variables are incomplete."
    };
  }

  if (lead.source !== "Meta Ads") {
    return {
      ok: false,
      skipped: true,
      reason: "Lead is not attributed to Meta Ads."
    };
  }

  if (!lead.ctwa_clid) {
    return {
      ok: false,
      skipped: true,
      reason: "Lead has no ctwa_clid, so Meta cannot attribute the messaging conversion."
    };
  }

  const revenue = Number(lead.revenue || 0);

  if (eventName === "Purchase" && (!Number.isFinite(revenue) || revenue <= 0)) {
    return {
      ok: false,
      skipped: true,
      reason: "Purchase requires revenue greater than 0."
    };
  }

  const eventId = eventIdFor(lead.id, eventName);
  const db = supabaseAdmin();

  const { data: existing } = await db
    .from("meta_conversion_events")
    .select("id,status,response,http_status,error")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing?.status === "sent") {
    return {
      ok: true,
      skipped: true,
      reason: "Event already sent successfully.",
      status: existing.http_status ?? undefined,
      response: existing.response
    };
  }

  const event: Record<string, any> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: {
      whatsapp_business_account_id: wabaId,
      ctwa_clid: lead.ctwa_clid
    }
  };

  if (eventName === "Purchase") {
    event.custom_data = {
      currency: "IDR",
      value: revenue,
      order_id: lead.id
    };
  }

  const endpoint =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events`;

  let response: Response;
  let json: any;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ data: [event] }),
      cache: "no-store"
    });

    json = await response.json().catch(() => ({}));
  } catch (error: any) {
    const message = error?.message || "Network error while sending Meta CAPI event.";

    await db.from("meta_conversion_events").upsert(
      {
        lead_id: lead.id,
        event_name: eventName,
        event_id: eventId,
        status: "failed",
        error: message
      },
      { onConflict: "event_id" }
    );

    return { ok: false, reason: message };
  }

  const accepted =
    response.ok &&
    !json?.error &&
    (
      typeof json?.events_received !== "number" ||
      json.events_received > 0
    );

  if (!accepted) {
    const message =
      json?.error?.message ||
      json?.error?.error_user_msg ||
      `Meta returned HTTP ${response.status}.`;

    await db.from("meta_conversion_events").upsert(
      {
        lead_id: lead.id,
        event_name: eventName,
        event_id: eventId,
        status: "failed",
        http_status: response.status,
        response: json,
        error: message
      },
      { onConflict: "event_id" }
    );

    return {
      ok: false,
      status: response.status,
      response: json,
      reason: message
    };
  }

  await db.from("meta_conversion_events").upsert(
    {
      lead_id: lead.id,
      event_name: eventName,
      event_id: eventId,
      status: "sent",
      http_status: response.status,
      response: json,
      error: null,
      sent_at: new Date().toISOString()
    },
    { onConflict: "event_id" }
  );

  return {
    ok: true,
    status: response.status,
    response: json
  };
}
