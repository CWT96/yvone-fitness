import type { Slot } from "./types";

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
