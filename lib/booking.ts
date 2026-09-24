import type { Slot, Appointment } from "./types";

export function compareBookings(
  a: Appointment,
  b: Appointment,
  now = Date.now(),
) {
  const aUpcoming = a.status === "booked" && Date.parse(a.slots.ends_at) > now;
  const bUpcoming = b.status === "booked" && Date.parse(b.slots.ends_at) > now;
  if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
  const difference =
    Date.parse(a.slots.starts_at) - Date.parse(b.slots.starts_at);
  return aUpcoming ? difference : -difference;
}

export function availableBookingSlots(
  slots: Slot[],
  currentSlot?: string,
  now = Date.now(),
) {
  return slots
    .filter(
      (slot) =>
        slot.available &&
        slot.active !== false &&
        slot.id !== currentSlot &&
        new Date(slot.starts_at).getTime() > now,
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}
