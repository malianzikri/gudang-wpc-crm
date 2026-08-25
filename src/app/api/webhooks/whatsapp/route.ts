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

          let metaAttribution: any = null;

          if (sourceId) {
            try {
              metaAttribution = await fetchMetaAdAttribution(sourceId);
            } catch (error) {
              console.error("Meta enrichment failed:", error);
            }
          }

          const { data: existing, error: findError } = await db
            .from("leads")
            .select("*")
            .eq("wa_id", waId)
            .maybeSingle();

          if (findError) throw findError;

          let leadId: string;

          const attributionPatch = sourceId
            ? {
                source: "Meta Ads",
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

          if (!existing) {
            const { data: inserted, error: insertError } = await db
              .from("leads")
              .insert({
                wa_id: waId,
                phone: `+${waId}`,
                name,
                status: "Chat Builder",
                source: sourceId ? "Meta Ads" : "WhatsApp Organic",
                ...attributionPatch,
                first_message: messageText,
                last_message: messageText,
                first_seen_at: messageTime,
                last_seen_at: messageTime
              })
              .select("id")
              .single();

            if (insertError) throw insertError;

            leadId = inserted.id;

            await db.from("lead_status_events").insert({
              lead_id: leadId,
              old_status: null,
              new_status: "Chat Builder",
              revenue: 0
            });
          } else {
            leadId = existing.id;

            const patch: Record<string, any> = {
              name: existing.name || name,
              last_message: messageText,
              last_seen_at: messageTime
            };

            // Repair an inconsistent historical row immediately:
            // if it already owns Meta attribution, it must be classified Meta Ads.
            if (existing.source_id || existing.ctwa_clid) {
              patch.source = "Meta Ads";
            }

            // First CTWA attribution is sticky. Later organic/ad messages do
            // not replace the original ad click, but any incoming ad referral
            // always makes the source Meta Ads.
            if (sourceId) {
              patch.source = "Meta Ads";

              if (!existing.source_id) {
                Object.assign(patch, attributionPatch);
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
            } else if (ctwaClid && !existing.ctwa_clid) {
              patch.ctwa_clid = ctwaClid;
              patch.source = "Meta Ads";
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
