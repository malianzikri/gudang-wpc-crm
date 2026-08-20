import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
export async function GET(request:Request){
  try{
    const db=supabaseAdmin(), url=new URL(request.url), status=url.searchParams.get("status"), source=url.searchParams.get("source"), q=url.searchParams.get("q")?.trim();
    let query=db.from("leads").select("*").order("last_seen_at",{ascending:false}).limit(500);
    if(status) query=query.eq("status",status); if(source) query=query.eq("source",source);
    if(q){const safe=q.replace(/[%_,()]/g,""); query=query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,last_message.ilike.%${safe}%`);}
    const {data,error}=await query; if(error) throw error; return NextResponse.json({ok:true,leads:data??[]});
  }catch(error){console.error(error); return NextResponse.json({ok:false,error:"Failed to load leads"},{status:500});}
}
