import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { extractMessageText, unixToIso } from "@/lib/whatsapp";
import { verifyMetaSignature } from "@/lib/meta-signature";
import { fetchMetaAdAttribution } from "@/lib/meta-marketing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    challenge
  ) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json(
    { ok: false, error: "Webhook verification failed" },
    { status: 403 }
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (
    !verifyMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256")
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid Meta signature" },
      { status: 401 }
    );
  }

  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  try {
    const db = supabaseAdmin();

    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change?.field !== "messages") continue;

        const value = change?.value ?? {};
        const contactByWaId = new Map<string, any>();

        for (const contact of value?.contacts ?? []) {
          if (contact?.wa_id) {
            contactByWaId.set(String(contact.wa_id), contact);
          }
        }

        for (const message of value?.messages ?? []) {
          const waId = String(message?.from ?? "");
          const waMessageId = String(message?.id ?? "");

          if (!waId || !waMessageId) continue;

          // Meta can retry the same webhook. Check idempotency before any
          // Marketing API request so a retry cannot create repeated API hits.
          const { data: duplicateMessage, error: duplicateError } = await db
            .from("messages")
            .select("id")
            .eq("wa_message_id", waMessageId)
            .maybeSingle();

          if (duplicateError) throw duplicateError;
          if (duplicateMessage) continue;

          const contact = contactByWaId.get(waId);
          const name = contact?.profile?.name ?? null;
          const messageText = extractMessageText(message);
          const messageTime = unixToIso(message?.timestamp);
          const referral = message?.referral ?? null;

          const sourceId = referral?.source_id
            ? String(referral.source_id)
            : null;

          const ctwaClid = referral?.ctwa_clid
            ? String(referral.ctwa_clid)
            : null;

          const { data: existing, error: findError } = await db
            .from("leads")
            .select("*")
            .eq("wa_id", waId)
            .maybeSingle();

          if (findError) throw findError;

          // Only enrich when this lead genuinely needs Meta object names.
          // This avoids unnecessary Marketing API calls on ordinary replies.
          let metaAttribution: any = null;
          const needsMetaEnrichment =
            Boolean(sourceId) &&
            (
              !existing ||
              !existing.source_id ||
              !existing.ad_name
            );

          if (sourceId && needsMetaEnrichment) {
            try {
              metaAttribution = await fetchMetaAdAttribution(sourceId);
            } catch (error) {
              console.error("Meta enrichment failed:", error);
            }
          }

          // These fields describe the first/known Meta click attached to the
          // lead. They do NOT decide first-touch acquisition.
          const metaReferralPatch = sourceId
            ? {
                source_type: referral?.source_type ?? null,
                source_id: sourceId,
                source_url: referral?.source_url ?? null,
                ad_headline: referral?.headline ?? null,
                ad_body: referral?.body ?? null,
                ad_media_type: referral?.media_type ?? null,
                ctwa_clid: ctwaClid,
                ad_name: metaAttribution?.ad_name ?? null,
                adset_id: metaAttribution?.adset_id ?? null,
                adset_name: metaAttribution?.adset_name ?? null,
                campaign_id: metaAttribution?.campaign_id ?? null,
                campaign_name: metaAttribution?.campaign_name ?? null,
                creative_id: metaAttribution?.creative_id ?? null,
                meta_enriched_at: metaAttribution
                  ? new Date().toISOString()
                  : null
              }
            : {};

          let leadId: string;

          if (!existing) {
            const initialSource = sourceId ? "Meta Ads" : "WhatsApp Organic";

            const { data: inserted, error: insertError } = await db
              .from("leads")
              .insert({
                wa_id: waId,
                phone: `+${waId}`,
                name,
                status: "Chat Builder",

                // FIRST TOUCH is decided once, when the lead is first created.
                source: initialSource,
                ...metaReferralPatch,

                last_touch_source: initialSource,
                last_touch_at: messageTime,
                source_confidence: sourceId
                  ? "live_meta_referral"
                  : "live_organic",

                suppress_capi: false,
                first_message: messageText,
                last_message: messageText,
                first_seen_at: messageTime,
                last_seen_at: messageTime
              })
              .select("id")
              .single();

            if (insertError) throw insertError;

            leadId = inserted.id;

            const { error: initialStatusError } = await db
              .from("lead_status_events")
              .insert({
                lead_id: leadId,
                old_status: null,
                new_status: "Chat Builder",
                revenue: 0
              });

            if (initialStatusError) {
              console.error(
                "Initial lead_status_events insert failed:",
                initialStatusError
              );
            }
          } else {
            leadId = existing.id;

            const patch: Record<string, any> = {
              name: existing.name || name,
              last_message: messageText,
              last_seen_at: messageTime
            };

            // A normal inbound reply never overwrites a manual Broadcast /
            // Follow-up touch. Only initialize an empty touch.
            if (!existing.last_touch_source) {
              patch.last_touch_source =
                existing.source || "WhatsApp Organic";
              patch.last_touch_at =
                existing.last_touch_at || messageTime;
            }

            // IMPORTANT:
            // `source` is sticky first-touch acquisition and is NOT changed.
            // Example: Organic first touch -> later Meta ad click:
            // source stays Organic; last_touch_source becomes Meta Ads.
            if (sourceId) {
              patch.last_touch_source = "Meta Ads";
              patch.last_touch_at = messageTime;

              // Keep the first known Meta click details. A later ad click does
              // not overwrite previously stored paid attribution fields.
              if (!existing.source_id) {
                Object.assign(patch, metaReferralPatch);
              } else {
                if (ctwaClid && !existing.ctwa_clid) {
                  patch.ctwa_clid = ctwaClid;
                }

                if (!existing.ad_name && metaAttribution) {
                  Object.assign(patch, {
                    ad_name: metaAttribution.ad_name ?? null,
                    adset_id: metaAttribution.adset_id ?? null,
                    adset_name: metaAttribution.adset_name ?? null,
                    campaign_id: metaAttribution.campaign_id ?? null,
                    campaign_name: metaAttribution.campaign_name ?? null,
                    creative_id: metaAttribution.creative_id ?? null,
                    meta_enriched_at: new Date().toISOString()
                  });
                }
              }

              // A real live CTWA click makes historical/imported leads eligible
              // for future CAPI events without rewriting first-touch source.
              if (ctwaClid) {
                patch.suppress_capi = false;

                if (existing.is_historical) {
                  patch.source_confidence = "historical_live_ctwa";
                }
              }
            } else if (ctwaClid && !existing.ctwa_clid) {
              patch.ctwa_clid = ctwaClid;
              patch.last_touch_source = "Meta Ads";
              patch.last_touch_at = messageTime;
              patch.suppress_capi = false;

              if (existing.is_historical) {
                patch.source_confidence = "historical_live_ctwa";
              }
            }

            const { error: updateError } = await db
              .from("leads")
              .update(patch)
              .eq("id", leadId);

            if (updateError) throw updateError;
          }

          const { error: messageError } = await db
            .from("messages")
            .upsert(
              {
                wa_message_id: waMessageId,
                lead_id: leadId,
                direction: "inbound",
                type: message?.type ?? null,
                body: messageText,
                message_timestamp: messageTime,
                raw_payload: message
              },
              { onConflict: "wa_message_id", ignoreDuplicates: true }
            );

          if (messageError) throw messageError;
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("WhatsApp webhook processing error:", error);

    return NextResponse.json(
      { ok: false, error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
