export function extractMessageText(message:any):string{
  if(!message) return "";
  if(message.type==="text") return message.text?.body??"";
  if(message.type==="button") return message.button?.text??"";
  if(message.type==="interactive") return message.interactive?.button_reply?.title??message.interactive?.list_reply?.title??"[Interactive]";
  if(message.type==="image") return message.image?.caption??"[Image]";
  if(message.type==="video") return message.video?.caption??"[Video]";
  if(message.type==="document") return message.document?.caption??message.document?.filename??"[Document]";
  if(message.type==="audio") return "[Audio]";
  if(message.type==="sticker") return "[Sticker]";
  if(message.type==="location") return "[Location]";
  return `[${message.type??"Unknown"}]`;
}
export function unixToIso(timestamp?:string):string{
  const seconds=Number(timestamp); return Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():new Date().toISOString();
}
