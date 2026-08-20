import { NextResponse } from "next/server";
export async function GET(){return NextResponse.json({ok:true,service:"Gudang WPC CRM",time:new Date().toISOString()});}
