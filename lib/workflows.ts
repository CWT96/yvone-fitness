import { salePackages, packageOptions } from "./package-options";
import type { Appointment, Data } from "./types";
import { displayTime } from "./time";

export function bookingMatches(
  b: Appointment,
  filter: string,
  zone: string,
  now = Date.now(),
) {
  if (filter === "upcoming")
    return b.status === "booked" && Date.parse(b.slots.ends_at) > now;
  if (filter === "pending")
    return b.status === "booked" && Date.parse(b.slots.ends_at) <= now;
  if (filter === "today")
    return (
      b.status !== "cancelled" &&
      displayTime(b.slots.starts_at, zone, "yyyy-MM-dd") ===
        displayTime(new Date(now).toISOString(), zone, "yyyy-MM-dd")
    );
  return filter === "all" || b.status === filter;
}

export function memberNeeds(data: Data, memberId: string) {
  const price = data.member_prices.find((p) => p.member_id === memberId);
  return {
    plan: !data.plans.some(
      (p) =>
        p.member_id === memberId && !p.deleted_at && p.status === "published",
    ),
    price:
      !price ||
      !salePackages.some((k) => price[packageOptions[k].priceKey] != null),
  };
}
