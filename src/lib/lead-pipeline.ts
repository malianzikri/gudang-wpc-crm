export const STATUSES = [
  "Chat Builder",
  "Tanya Kebutuhan",
  "Foto Area Diterima",
  "Qualified",
  "Estimasi Dikirim",
  "Survey Ditawarkan",
  "Survey Terjadwal",
  "Quotation Final",
  "Hot",
  "Closing",
  "Pending",
  "No Response",
  "Lost",
  "Tidak Layak"
] as const;

export type LeadStatus = (typeof STATUSES)[number];

const LEGACY_STATUS_MAP: Record<string, LeadStatus> = {
  "Tanya Aja": "Tanya Kebutuhan",
  "Kebutuhan": "Tanya Kebutuhan",
  "Quotation Dikirim": "Estimasi Dikirim",
  "Survey": "Survey Ditawarkan",
  "Waiting Decision": "Estimasi Dikirim",
  "No Response - Builder": "No Response",
  "No Response - Tanya Aja": "No Response",
  "No Response - Estimasi Harga": "No Response"
};

export function normalizeLeadStatus(status: string | null | undefined): string {
  const value = String(status || "").trim();
  return LEGACY_STATUS_MAP[value] ?? value;
}

export function statusLabel(status: string) {
  if (status === "Tanya Kebutuhan") return "Tanya Aja";
  if (status === "Estimasi Dikirim") return "Estimasi Harga";
  return status;
}

export const HIGH_INTENT_STATUSES = new Set<string>([
  "Foto Area Diterima", "Qualified", "Estimasi Dikirim", "Survey Ditawarkan",
  "Survey Terjadwal", "Quotation Final", "Hot", "Closing"
]);
export const HIGH_INTENT_AUDIENCE_STATUSES = new Set<string>(
  [...HIGH_INTENT_STATUSES].filter((status) => status !== "Closing")
);
export const QUALIFIED_STATUSES = new Set<string>([
  "Qualified", "Estimasi Dikirim", "Survey Ditawarkan", "Survey Terjadwal",
  "Quotation Final", "Hot", "Closing"
]);
export const ESTIMATE_STATUSES = new Set<string>([
  "Estimasi Dikirim", "Foto Area Diterima", "Qualified", "Survey Ditawarkan", "Survey Terjadwal", "Quotation Final", "Hot", "Closing"
]);
export const SURVEY_STATUSES = new Set<string>(["Survey Ditawarkan", "Survey Terjadwal"]);
export const QUOTATION_STATUSES = new Set<string>(["Quotation Final", "Hot", "Closing"]);
export const HOT_STATUSES = new Set<string>(["Hot", "Closing"]);

export const PRODUCTS = ["WPC", "PVC Plafon", "Wallboard", "UV Marble", "Interior", "Lainnya"] as const;
export const INTENTS = ["Cek Harga", "Cek Stok", "Cari Motif", "Hitung Kebutuhan", "Material + Pasang", "Jasa Pasang", "Survey", "Lainnya"] as const;
export const FOLLOW_UP_REASONS = ["Final FU Builder", "Kirim Katalog", "Info Restock", "Hitung Kebutuhan", "Follow Up Estimasi", "Closing", "Follow Up Pending", "Lainnya"] as const;
export const PENDING_REASONS = ["Renovasi belum mulai", "Menunggu budget", "Bulan depan", "Menunggu pasangan/keluarga", "Menunggu tukang", "Lainnya"] as const;
export const LOST_REASONS = ["Harga", "Beli kompetitor", "Tidak jadi renovasi", "Di luar area", "Produk tidak cocok", "Tidak diketahui", "Lainnya"] as const;

export const SOURCE_GROUPS = [
  { key: "meta", label: "Meta Ads" }, { key: "organic", label: "WhatsApp Organic" },
  { key: "legacy", label: "Legacy / Belum Teratribusi" }, { key: "walkin", label: "Walk-in" },
  { key: "referral", label: "Referral" }, { key: "other", label: "Lainnya" }
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
export function sourceGroupLabel(key: SourceGroupKey) { return SOURCE_GROUPS.find((item) => item.key === key)?.label ?? "Lainnya"; }

export const TOUCH_OPTIONS = ["WhatsApp Organic", "Meta Ads", "WhatsApp Broadcast", "Follow-up Personal", "Survey", "Walk-in", "Referral"] as const;
const LEGACY_TOUCH_MAP: Record<string, (typeof TOUCH_OPTIONS)[number]> = { "WA Broadcast": "WhatsApp Broadcast", "Reaktivasi Broadcast": "WhatsApp Broadcast" };
export function normalizeTouchSource(touch: string | null | undefined): string { const value = String(touch || "").trim(); return LEGACY_TOUCH_MAP[value] ?? value; }

export function statusRank(status: string) { const normalized = normalizeLeadStatus(status); const index = (STATUSES as readonly string[]).indexOf(normalized); return index === -1 ? -1 : index; }

export function suggestedNextAction(status: string) {
  const s = normalizeLeadStatus(status);
  if (s === "Chat Builder") return "Kirim final follow-up 1/2/3";
  if (s === "Tanya Kebutuhan") return "Arahkan ke ukuran / kebutuhan";
  if (s === "Foto Area Diterima" || s === "Qualified") return "Hitung dan kirim estimasi";
  if (s === "Estimasi Dikirim") return "Follow up keputusan / keberatan";
  if (s === "Survey Ditawarkan") return "Kunci jadwal survey";
  if (s === "Survey Terjadwal") return "Pastikan survey berjalan";
  if (s === "Quotation Final") return "Follow up quotation final";
  if (s === "Hot") return "Kejar DP / jadwal pemasangan";
  if (s === "Pending") return "Follow up sesuai tanggal";
  if (s === "No Response") return "Nurture / broadcast, jangan dikejar harian";
  if (s === "Lost" || s === "Tidak Layak") return "Tidak perlu follow-up aktif";
  return "Selesaikan order & catat revenue";
}
