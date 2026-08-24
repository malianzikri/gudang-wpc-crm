export const STATUSES = [
  "Chat Builder",
  "Tanya Kebutuhan",
  "Estimasi Dikirim",
  "Foto Area Diterima",
  "Qualified",
  "Survey Ditawarkan",
  "Survey Terjadwal",
  "Quotation Final",
  "Hot",
  "Closing",
  "Tidak Layak"
] as const;

export type LeadStatus = (typeof STATUSES)[number];

const LEGACY_STATUS_MAP: Record<string, LeadStatus> = {
  "Tanya Aja": "Tanya Kebutuhan",
  "Quotation Dikirim": "Estimasi Dikirim"
};

export function normalizeLeadStatus(status: string | null | undefined): string {
  const value = String(status || "");
  return LEGACY_STATUS_MAP[value] ?? value;
}

export const HIGH_INTENT_STATUSES = new Set<string>([
  "Foto Area Diterima",
  "Qualified",
  "Survey Ditawarkan",
  "Survey Terjadwal",
  "Quotation Final",
  "Hot",
  "Closing"
]);

export const QUALIFIED_STATUSES = new Set<string>([
  "Qualified",
  "Survey Ditawarkan",
  "Survey Terjadwal",
  "Quotation Final",
  "Hot",
  "Closing"
]);

export const ESTIMATE_STATUSES = new Set<string>([
  "Estimasi Dikirim",
  "Foto Area Diterima",
  "Qualified",
  "Survey Ditawarkan",
  "Survey Terjadwal",
  "Quotation Final",
  "Hot",
  "Closing"
]);

export const SURVEY_STATUSES = new Set<string>([
  "Survey Ditawarkan",
  "Survey Terjadwal"
]);

export const QUOTATION_STATUSES = new Set<string>([
  "Quotation Final",
  "Hot",
  "Closing"
]);

export const HOT_STATUSES = new Set<string>(["Hot", "Closing"]);

// `source` is FIRST-TOUCH / acquisition source and must stay sticky.
// Broadcast is intentionally NOT an acquisition group. It is tracked as a
// marketing touch in `last_touch_source`.
export const SOURCE_GROUPS = [
  { key: "meta", label: "Meta Ads" },
  { key: "organic", label: "WhatsApp Organic" },
  { key: "legacy", label: "Legacy / Belum Teratribusi" },
  { key: "walkin", label: "Walk-in" },
  { key: "referral", label: "Referral" },
  { key: "other", label: "Lainnya" }
] as const;

export type SourceGroupKey = (typeof SOURCE_GROUPS)[number]["key"];

export function sourceGroup(source: string | null | undefined): SourceGroupKey {
  const value = String(source || "").trim().toLowerCase();

  if (value.includes("meta")) return "meta";
  if (value.includes("legacy") || value.includes("belum teratribusi")) return "legacy";
  if (value.includes("walk")) return "walkin";
  if (value.includes("refer")) return "referral";
  if (value.includes("organic") || value === "whatsapp") return "organic";
  return "other";
}

export function sourceGroupLabel(key: SourceGroupKey) {
  return SOURCE_GROUPS.find((item) => item.key === key)?.label ?? "Lainnya";
}

export const TOUCH_OPTIONS = [
  "WhatsApp Organic",
  "Meta Ads",
  "WhatsApp Broadcast",
  "Follow-up Personal",
  "Survey",
  "Walk-in",
  "Referral"
] as const;

export function statusRank(status: string) {
  const normalized = normalizeLeadStatus(status);
  const index = (STATUSES as readonly string[]).indexOf(normalized);
  return index === -1 ? -1 : index;
}
