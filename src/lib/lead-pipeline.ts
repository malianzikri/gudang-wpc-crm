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
  "Survey Terjadwal",
  "Quotation Final",
  "Hot",
  "Closing"
]);

export const QUOTATION_STATUSES = new Set<string>([
  "Quotation Final",
  "Hot",
  "Closing"
]);

export const HOT_STATUSES = new Set<string>(["Hot", "Closing"]);

export const SOURCE_GROUPS = [
  { key: "meta", label: "Meta Ads" },
  { key: "organic", label: "Organic" },
  { key: "broadcast", label: "Broadcast" },
  { key: "walkin", label: "Walk-in" },
  { key: "referral", label: "Referral" },
  { key: "other", label: "Lainnya" }
] as const;

export type SourceGroupKey = (typeof SOURCE_GROUPS)[number]["key"];

export function sourceGroup(source: string | null | undefined): SourceGroupKey {
  const value = String(source || "").trim().toLowerCase();

  if (value.includes("meta")) return "meta";
  if (value.includes("broadcast")) return "broadcast";
  if (value.includes("walk")) return "walkin";
  if (value.includes("refer")) return "referral";
  if (value.includes("organic") || value.includes("whatsapp")) return "organic";
  return "other";
}

export function sourceGroupLabel(key: SourceGroupKey) {
  return SOURCE_GROUPS.find((item) => item.key === key)?.label ?? "Lainnya";
}

export function statusRank(status: string) {
  const index = (STATUSES as readonly string[]).indexOf(status);
  return index === -1 ? 999 : index;
}
