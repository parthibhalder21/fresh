const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN");

export const money = (v) => inr.format(v || 0);
export const money2 = (v) => (Number.isInteger(v) ? inr.format(v) : inr2.format(v || 0));
export const n = (v) => num.format(v || 0);

const PLURAL = { box: "boxes", loaf: "loaves", bunch: "bunches", dozen: "dozen", kg: "kg" };
export const units = (unit, count) => (count === 1 ? unit : PLURAL[unit] ?? `${unit}s`);

export function expiresIn(daysLeft) {
  if (daysLeft < -1) return `Expired ${-daysLeft} days ago`;
  if (daysLeft === -1) return "Expired yesterday";
  if (daysLeft === 0) return "Expires today";
  if (daysLeft === 1) return "Expires tomorrow";
  return `Expires in ${daysLeft} days`;
}

export function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function shortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function timeAgo(sqlOrIso) {
  if (!sqlOrIso) return "";
  const t = new Date(sqlOrIso.includes("T") ? sqlOrIso : `${sqlOrIso.replace(" ", "T")}Z`).getTime();
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export function clock(iso) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export const ACTION_TEXT = {
  "auth.login": "signed in",
  "auth.register": "registered",
  "batch.create": "added stock",
  "batch.update": "updated stock",
  "batch.create_override": "added stock despite a data warning",
  "data.anomaly_flagged": "triggered a data-quality warning",
  "transfer.create": "moved stock",
  "listing.create": "listed surplus",
  "listing.escalate": "sent a listing to NGOs",
  "listing.withdraw": "withdrew a listing",
  "listing.recover": "sent stock to recovery",
  "claim.create": "claimed stock",
  "order.create": "placed an order",
  "order.cancel": "cancelled an order",
  "order.packed": "packed an order",
  "order.out_for_delivery": "sent an order out for delivery",
  "order.ready_for_pickup": "put an order at the counter",
  "order.completed": "completed an order",
  "order.no_show": "marked an order not collected",
  "claim.pickup": "confirmed a pickup",
  "claim.no_show": "marked a no-show",
  "org.verify": "verified a partner",
  "org.unverify": "suspended a partner",
  "org.update": "updated their profile",
};
