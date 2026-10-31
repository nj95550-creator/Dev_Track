/**
 * Display helpers for project status and local calendar dates. Date-only
 * values are interpreted at local noon to avoid midnight/timezone date shifts.
 */
export const statusLabels = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
};
/**
 * Format a date-only value for the interface, omitting the year when it is
 * the current year. Missing/unusable values get a readable no-date label.
 */
export function calendarDate(value: string | null): string {
  if (!value) return 'No due date';
  const text = value.slice(0, 10);
  const date = new Date(text + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return 'No due date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}
/**
 * Return a local YYYY-MM-DD key for comparisons; UTC ISO dates can identify
 * the previous/next day for users near a timezone boundary.
 */
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/**
 * Compare calendar-day keys for overdue/today/tomorrow labels and otherwise
 * use the shared date formatter. Local noon reduces daylight-saving boundary drift.
 */
export function dueLabel(value: string | null): string {
  if (!value) return 'No due date';
  const days = Math.round(
    (new Date(value.slice(0, 10) + 'T12:00:00').getTime() -
      new Date(dateKey() + 'T12:00:00').getTime()) /
      86400000,
  );
  return days < 0
    ? `${Math.abs(days)}d overdue`
    : days === 0
      ? 'Due today'
      : days === 1
        ? 'Due tomorrow'
        : calendarDate(value);
}
