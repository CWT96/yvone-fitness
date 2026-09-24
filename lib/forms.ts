// Match the database limits so users can correct input before sending it.
export const fieldLimits: Record<string, number> = {
  p_name: 80,
  p_phone: 50,
  p_goals: 5000,
  p_location: 300,
  p_title: 160,
  p_content: 30000,
  p_notes: 10000,
  p_message: 2000,
};
export function initialMember(
  member: string | undefined,
  filter: string,
  activeIds: string[],
) {
  const selected = member || (filter === "all" ? "" : filter);
  return activeIds.includes(selected) ? selected : "";
}

// Invalidate in-flight reads on logout/account changes and prefer the latest read.
export class LatestRead {
  private version = 0;
  begin() {
    const version = ++this.version;
    return () => version === this.version;
  }
  invalidate() {
    this.version++;
  }
}

export async function saveThenRefresh(
  save: () => Promise<void>,
  refresh: () => Promise<void>,
) {
  await save();
  try {
    await refresh();
    return true;
  } catch {
    return false;
  }
}
