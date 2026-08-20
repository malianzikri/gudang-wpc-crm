import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { extractMessageText, unixToIso } from "@/lib/whatsapp";
import { verifyMetaSignature } from "@/lib/meta-signature";
export const runtime="nodejs";

export async function GET(request:Request){
  const url=new URL(request.url);
  const mode=url.searchParams.get("hub.mode"), token=url.searchParams.get("hub.verify_token"), challenge=url.searchParams.get("hub.challenge");
  if(mode==="subscribe" && token===process.env.WHATSAPP_VERIFY_TOKEN && challenge) return new Response(challenge,{status:200});
  return NextResponse.json({ok:false,error:"Webhook verification failed"},{status:403});
}

export async function POST(request:Request){
  const raw=await request.text();
  if(!verifyMetaSignature(raw,request.headers.get("x-hub-signature-256"))) return NextResponse.json({ok:false,error:"Invalid Meta signature"},{status:401});
  let payload:any; try{payload=JSON.parse(raw);}catch{return NextResponse.json({ok:false,error:"Invalid JSON"},{status:400});}
  try{
    const db=supabaseAdmin();
    for(const entry of payload?.entry??[]){
      for(const change of entry?.changes??[]){
        if(change?.field!=="messages") continue;
        const value=change?.value??{};
        const contacts=new Map<string,any>();
        for(const c of value?.contacts??[]) if(c?.wa_id) contacts.set(String(c.wa_id),c);
        for(const m of value?.messages??[]){
          const waId=String(m?.from??""), msgId=String(m?.id??""); if(!waId||!msgId) continue;
          const contact=contacts.get(waId), name=contact?.profile?.name??null, text=extractMessageText(m), time=unixToIso(m?.timestamp), referral=m?.referral??null;
          const {data:existing,error:findError}=await db.from("leads").select("*").eq("wa_id",waId).maybeSingle(); if(findError) throw findError;
          let leadId:string;
          if(!existing){
            const {data:inserted,error}=await db.from("leads").insert({wa_id:waId,phone:`+${waId}`,name,status:"Chat Builder",source:referral?"Meta Ads":"WhatsApp Organic",source_type:referral?.source_type??null,source_id:referral?.source_id??null,source_url:referral?.source_url??null,ad_headline:referral?.headline??null,ad_body:referral?.body??null,ad_media_type:referral?.media_type??null,first_message:text,last_message:text,first_seen_at:time,last_seen_at:time}).select("id").single();
            if(error) throw error; leadId=inserted.id;
            await db.from("lead_status_events").insert({lead_id:leadId,old_status:null,new_status:"Chat Builder",revenue:0});
          }else{
            leadId=existing.id;
            const patch:any={name:existing.name||name,last_message:text,last_seen_at:time};
            if(referral && !existing.source_id) Object.assign(patch,{source:"Meta Ads",source_type:referral?.source_type??null,source_id:referral?.source_id??null,source_url:referral?.source_url??null,ad_headline:referral?.headline??null,ad_body:referral?.body??null,ad_media_type:referral?.media_type??null});
            const {error}=await db.from("leads").update(patch).eq("id",leadId); if(error) throw error;
          }
          const {error:msgError}=await db.from("messages").upsert({wa_message_id:msgId,lead_id:leadId,direction:"inbound",type:m?.type??null,body:text,message_timestamp:time,raw_payload:m},{onConflict:"wa_message_id",ignoreDuplicates:true});
          if(msgError) throw msgError;
        }
      }
    }
    return NextResponse.json({ok:true});
  }catch(error){console.error(error); return NextResponse.json({ok:false,error:"Webhook processing failed"},{status:500});}
}
