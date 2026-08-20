import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
const ALLOWED=new Set(["Chat Builder","Tanya Aja","Qualified","Quotation Dikirim","Hot","Closing","Tidak Layak"]);
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {id}=await context.params, body=await request.json(), db=supabaseAdmin();
    const {data:existing,error:e1}=await db.from("leads").select("*").eq("id",id).single(); if(e1) throw e1;
    const patch:any={};
    if(body.status!==undefined){if(!ALLOWED.has(body.status)) return NextResponse.json({ok:false,error:"Invalid status"},{status:400}); patch.status=body.status; if(body.status==="Closing"&&existing.status!=="Closing") patch.closed_at=new Date().toISOString(); if(body.status!=="Closing"&&existing.status==="Closing") patch.closed_at=null;}
    if(body.revenue!==undefined){const rev=Number(body.revenue); if(!Number.isFinite(rev)||rev<0) return NextResponse.json({ok:false,error:"Invalid revenue"},{status:400}); patch.revenue=rev;}
    if(body.notes!==undefined) patch.notes=String(body.notes??"").slice(0,5000);
    const {data:updated,error:e2}=await db.from("leads").update(patch).eq("id",id).select("*").single(); if(e2) throw e2;
    if(patch.status!==undefined&&patch.status!==existing.status) await db.from("lead_status_events").insert({lead_id:id,old_status:existing.status,new_status:patch.status,revenue:updated.revenue??0});
    return NextResponse.json({ok:true,lead:updated});
  }catch(error){console.error(error); return NextResponse.json({ok:false,error:"Failed to update lead"},{status:500});}
}
