export const WALK_CLOCK = { day: 'Tue', start: 12 * 60 + 40 };

export function clockAt(t: number, day = false): string {
  const m = WALK_CLOCK.start + Math.floor(t / 60);
  const hm = `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')}`;
  return day ? `${WALK_CLOCK.day} ${hm}` : hm;
}
