import { byId } from './dom';

let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string): void {
  const el = byId('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), 4500);
}
