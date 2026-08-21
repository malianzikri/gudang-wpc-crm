"use client";

import { useEffect, useMemo, useState } from "react";

const STATUSES = [
  "Chat Builder","Tanya Aja","Qualified","Quotation Dikirim","Hot","Closing","Tidak Layak"
];

type Lead = {
  id: string; wa_id: string; phone: string | null; name: string | null;
  status: string; source: string; source_id: string | null;
  ad_headline: string | null; ad_name: string | null; adset_name: string | null;
  campaign_name: string | null; last_message: string | null; last_seen_at: string;
  revenue: number | string;
};

function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value||0)}
function dateTime(value:string){return new Intl.DateTimeFormat("id-ID",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(value))}

export default function Dashboard(){
  const [leads,setLeads]=useState<Lead[]>([]);
  const [drafts,setDrafts]=useState<Record<string,{status:string;revenue:string}>>({});
  const [loading,setLoading]=useState(true); const [savingId,setSavingId]=useState<string|null>(null);
  const [syncing,setSyncing]=useState(false); const [error,setError]=useState("");
  const [q,setQ]=useState(""); const [statusFilter,setStatusFilter]=useState(""); const [sourceFilter,setSourceFilter]=useState("");

  async function load(){
    setLoading(true); setError("");
    try{
      const params=new URLSearchParams(); if(statusFilter)params.set("status",statusFilter); if(sourceFilter)params.set("source",sourceFilter); if(q.trim())params.set("q",q.trim());
      const res=await fetch(`/api/leads?${params.toString()}`,{cache:"no-store"}); const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Gagal mengambil lead.");
      setLeads(json.leads); const d:Record<string,{status:string;revenue:string}>={};
      for(const lead of json.leads)d[lead.id]={status:lead.status,revenue:String(Number(lead.revenue||0))}; setDrafts(d);
    }catch(e:any){setError(e.message||"Terjadi kesalahan.")}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[statusFilter,sourceFilter]);
  useEffect(()=>{const t=setTimeout(()=>load(),350);return()=>clearTimeout(t)},[q]);

  async function syncMeta(){
    setSyncing(true); setError("");
    try{const res=await fetch("/api/meta/backfill",{method:"POST"}); const json=await res.json(); if(!res.ok||!json.ok)throw new Error(json.error||"Sync Meta gagal"); await load();}
    catch(e:any){setError(e.message||"Sync Meta gagal")}finally{setSyncing(false)}
  }

  async function saveLead(lead:Lead){
    const draft=drafts[lead.id]; if(!draft)return; setSavingId(lead.id); setError("");
    try{const res=await fetch(`/api/leads/${lead.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:draft.status,revenue:Number(draft.revenue||0)})}); const json=await res.json(); if(!res.ok||!json.ok)throw new Error(json.error||"Gagal menyimpan lead."); await load();}
    catch(e:any){setError(e.message||"Gagal menyimpan") } finally{setSavingId(null)}
  }

  const summary=useMemo(()=>({
    total:leads.length,
    highIntent:leads.filter(l=>["Qualified","Quotation Dikirim","Hot","Closing"].includes(l.status)).length,
    closing:leads.filter(l=>l.status==="Closing").length,
    revenue:leads.filter(l=>l.status==="Closing").reduce((s,l)=>s+Number(l.revenue||0),0)
  }),[leads]);
  const statusCounts=useMemo(()=>Object.fromEntries(STATUSES.map(s=>[s,leads.filter(l=>l.status===s).length])),[leads]);

  return <main className="shell">
    <div className="header"><div><h1>Gudang WPC CRM</h1><p>Tracking WhatsApp → qualified → quotation → closing.</p></div><div style={{display:"flex",gap:8}}><button className="refresh" onClick={syncMeta} disabled={syncing}>{syncing?"Sync Meta…":"Sync Nama Iklan"}</button><button className="refresh" onClick={load}>Refresh</button></div></div>
    {error&&<div className="error">{error}</div>}
    <section className="cards">
      <div className="card"><div className="label">Total lead</div><div className="value">{summary.total}</div></div>
      <div className="card"><div className="label">High Intent</div><div className="value">{summary.highIntent}</div></div>
      <div className="card"><div className="label">Closing</div><div className="value">{summary.closing}</div></div>
      <div className="card"><div className="label">Revenue Closing</div><div className="value">{rupiah(summary.revenue)}</div></div>
    </section>
    <div className="funnel">{STATUSES.map(s=><span className="pill" key={s}>{s}<b>{statusCounts[s]??0}</b></span>)}</div>
    <section className="toolbar">
      <input className="control" value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari nama, nomor WA, pesan…"/>
      <select className="control" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Semua status</option>{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select>
      <select className="control" value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="">Semua sumber</option><option value="Meta Ads">Meta Ads</option><option value="WhatsApp Organic">WhatsApp Organic</option></select>
    </section>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Lead</th><th>Sumber</th><th>Campaign / Ad Set / Ad</th><th>Pesan terakhir</th><th>Waktu</th><th>Status</th><th>Revenue</th><th></th></tr></thead><tbody>
      {!loading&&leads.map(lead=>{const draft=drafts[lead.id]??{status:lead.status,revenue:String(Number(lead.revenue||0))};return <tr key={lead.id}>
        <td><div className="name">{lead.name||"Tanpa nama"}</div><div className="sub">{lead.phone||`+${lead.wa_id}`}</div></td>
        <td><div className={lead.source==="Meta Ads"?"source-meta":""}>{lead.source}</div>{lead.source_id&&<div className="sub">Ad ID: {lead.source_id}</div>}</td>
        <td style={{minWidth:260}}>{lead.campaign_name?<><div><strong>Campaign:</strong> {lead.campaign_name}</div><div className="sub"><strong>Ad Set:</strong> {lead.adset_name||"—"}</div><div className="sub"><strong>Ad:</strong> {lead.ad_name||"—"}</div></>:<><div>{lead.ad_headline||"—"}</div>{lead.source==="Meta Ads"&&<div className="sub">Klik “Sync Nama Iklan”</div>}</>}</td>
        <td><div className="message">{lead.last_message||"—"}</div></td><td>{dateTime(lead.last_seen_at)}</td>
        <td><select className="status-select" value={draft.status} onChange={e=>setDrafts(d=>({...d,[lead.id]:{...draft,status:e.target.value}}))}>{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></td>
        <td><input className="revenue" inputMode="numeric" value={draft.revenue} onChange={e=>setDrafts(d=>({...d,[lead.id]:{...draft,revenue:e.target.value.replace(/[^\d]/g,"")}}))}/></td>
        <td><button className="save" disabled={savingId===lead.id} onClick={()=>saveLead(lead)}>{savingId===lead.id?"Simpan…":"Simpan"}</button></td>
      </tr>})}
    </tbody></table></div>{!loading&&leads.length===0&&<div className="empty">Belum ada lead.</div>}{loading&&<div className="empty">Memuat lead…</div>}</section>
  </main>
}
