import { normalizeLeadStatus } from "@/lib/lead-pipeline";

export const META_AUDIENCES = [
  { key: "all", label: "All Leads" },
  { key: "qualified_plus", label: "Qualified+" },
  { key: "hot_estimate", label: "Hot / Estimasi" },
  { key: "closing", label: "Closing" },
  { key: "no_response", label: "No Response" },
  { key: "wpc", label: "Produk WPC" },
  { key: "pvc", label: "Produk PVC" },
  { key: "wallboard_uv", label: "Wallboard / UV Marble" }
] as const;

export type MetaAudienceKey = (typeof META_AUDIENCES)[number]["key"];
export type MetaAudienceExportMode = "full" | "add" | "remove";

export function validAudienceKey(value: string | null | undefined): MetaAudienceKey {
  const key = String(value || "all") as MetaAudienceKey;
  return META_AUDIENCES.some((item) => item.key === key) ? key : "all";
}

export function validExportMode(value: string | null | undefined): MetaAudienceExportMode {
  return value === "add" || value === "remove" ? value : "full";
}

export function normalizePhone(raw: string | null | undefined) {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (digits.startsWith("8")) digits = `62${digits}`;
  if (digits.startsWith("620")) digits = `62${digits.slice(3)}`;
  if (digits.length < 8 || digits.length > 15) return "";
  return digits;
}

export function splitName(raw: string | null | undefined) {
  const name = String(raw || "").trim().replace(/\s+/g, " ");
  if (!name) return { fn: "", ln: "" };
  const parts = name.split(" ");
  if (parts.length === 1) return { fn: parts[0], ln: "" };
  return { fn: parts[0], ln: parts.slice(1).join(" ") };
}

export function isAudienceEligible(lead: any, key: MetaAudienceKey) {
  const status = normalizeLeadStatus(lead?.status);
  const product = String(lead?.product_interest || "").trim().toLowerCase();
  const phone = normalizePhone(lead?.phone || lead?.wa_id);
  if (!phone) return false;

  if (key === "all") return true;
  if (key === "closing") return status === "Closing";
  if (key === "no_response") return status === "No Response";
  if (key === "qualified_plus") {
    return [
      "Foto Area Diterima", "Qualified", "Estimasi Dikirim",
      "Survey Ditawarkan", "Survey Terjadwal", "Quotation Final",
      "Hot", "Closing"
    ].includes(status);
  }
  if (key === "hot_estimate") {
    return [
      "Estimasi Dikirim", "Survey Ditawarkan", "Survey Terjadwal",
      "Quotation Final", "Hot", "Closing"
    ].includes(status);
  }
  if (key === "wpc") return product === "wpc";
  if (key === "pvc") return product === "pvc plafon" || product === "pvc";
  if (key === "wallboard_uv") return product === "wallboard" || product === "uv marble";
  return false;
}

export function audienceLabel(key: MetaAudienceKey) {
  return META_AUDIENCES.find((item) => item.key === key)?.label ?? key;
}
