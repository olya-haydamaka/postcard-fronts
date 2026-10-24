/** NFC, lowercase, no extension, quotes/punctuation → spaces, collapsed. */
export const normalize = (s: string): string =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[’ʼ'`"«».,\-_()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface SlotTitles {
  /** Current (possibly edited) title. */
  t: string;
  /** Original title. */
  t0: string;
}

/**
 * Slot index for a file name, or -1:
 * 1. a leading number 01…NN gives the slot;
 * 2. else an exact match on the normalized title (current or original);
 * 3. else a partial match (more than 3 characters).
 */
export function matchSlot(fileName: string, slots: readonly SlotTitles[]): number {
  const n = normalize(fileName);
  const num = n.match(/^(\d{1,2})(?!\d)/);
  if (num) {
    const i = Number(num[1]) - 1;
    if (i >= 0 && i < slots.length) return i;
  }
  const nn = n.replace(/^\d+\s*/, '');
  const titles = slots.flatMap((s, i) => [
    [i, normalize(s.t)] as const,
    [i, normalize(s.t0)] as const,
  ]);
  let found = titles.find(([, t]) => t === nn);
  if (!found && nn.length > 3) found = titles.find(([, t]) => nn.includes(t) || t.includes(nn));
  return found ? found[0] : -1;
}

export interface AssignmentPlan {
  /** [file index, slot index], matched by number or title, in file order. */
  matched: [number, number][];
  /** [file index, slot index], unmatched files placed in empty slots, in file order. */
  filled: [number, number][];
  /** Unmatched files beyond the free slots. */
  skipped: number;
}

/**
 * Decides where each file goes. A slot is taken once per batch; a second file matching a taken slot falls through to
 * the empty slots. A match overwrites a filled slot; an unmatched file only takes an empty one.
 */
export function planAssignments(
  fileNames: readonly string[],
  slots: readonly (SlotTitles & { filled: boolean })[],
): AssignmentPlan {
  const used = new Set<number>();
  const plan: AssignmentPlan = { matched: [], filled: [], skipped: 0 };
  const rest: number[] = [];
  fileNames.forEach((name, f) => {
    const i = matchSlot(name, slots);
    if (i >= 0 && !used.has(i)) {
      used.add(i);
      plan.matched.push([f, i]);
    } else rest.push(f);
  });
  for (const f of rest) {
    const i = slots.findIndex((s, si) => !s.filled && !used.has(si));
    if (i < 0) {
      plan.skipped++;
      continue;
    }
    used.add(i);
    plan.filled.push([f, i]);
  }
  return plan;
}
