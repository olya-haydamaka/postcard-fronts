/**
 * Per-browser preferences. localStorage can be missing or throw (a private window, blocked site data), so every read
 * falls back to null and every write may silently last for this page only.
 */
export function readStored(key: string): unknown {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : (JSON.parse(v) as unknown);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the setting lasts for this page only.
  }
}
