import { NextRequest, NextResponse } from "next/server";
function unauthorized(){return new NextResponse("Authentication required.",{status:401,headers:{"WWW-Authenticate":'Basic realm="Gudang WPC CRM"'}});}
export function middleware(request:NextRequest){
  const path=request.nextUrl.pathname; if(path.startsWith("/api/webhooks/whatsapp")||path.startsWith("/api/health")) return NextResponse.next();
  const user=process.env.DASHBOARD_USER, pass=process.env.DASHBOARD_PASSWORD; if(!user||!pass) return NextResponse.next();
  const auth=request.headers.get("authorization"); if(!auth?.startsWith("Basic ")) return unauthorized();
  try{const decoded=atob(auth.slice(6)), i=decoded.indexOf(":"); if(i<0) return unauthorized(); if(decoded.slice(0,i)!==user||decoded.slice(i+1)!==pass) return unauthorized(); return NextResponse.next();}catch{return unauthorized();}
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
