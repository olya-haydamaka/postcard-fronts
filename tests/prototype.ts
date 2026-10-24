import { readFileSync } from 'node:fs';

/** The design prototype is the reference implementation; tests evaluate pieces of it to prove parity. */
const html = readFileSync(new URL('../docs/prototype/postcard-front-tool.html', import.meta.url), 'utf8');

/** Source text from `start` (inclusive) to `end` (exclusive). */
export function prototypeSource(start: string, end: string): string {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`prototype markers not found: ${start} … ${end}`);
  return html.slice(a, b);
}

export function evalPrototype<T>(code: string, params: Record<string, unknown> = {}): T {
  const fn = new Function(...Object.keys(params), code);
  return fn(...Object.values(params)) as T;
}
