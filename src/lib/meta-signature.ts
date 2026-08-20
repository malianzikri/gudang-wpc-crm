import crypto from "crypto";
export function verifyMetaSignature(raw:string,header:string|null){
  const secret=process.env.META_APP_SECRET;
  if(!secret) return true;
  if(!header?.startsWith("sha256=")) return false;
  const expected="sha256="+crypto.createHmac("sha256",secret).update(raw,"utf8").digest("hex");
  const a=Buffer.from(expected), b=Buffer.from(header);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
