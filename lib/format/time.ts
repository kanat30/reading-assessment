/**
 * Formats a timestamp in a contextual, human-readable format.
 *
 * Examples:
 * - "2:14 pm today"
 * - "yesterday 9:32 am"
 * - "monday 3:18 pm" (within the current week)
 * - "apr 12 11:05 am" (older than a week)
 */
export function formatContextualTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();

  // Get time portion
  const time = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();

  // Check if same day
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return `${time} today`;
  }

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `yesterday ${time}`;
  }

  // Check if within current week (past 7 days)
  const daysAgo = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (daysAgo < 7) {
    const dayName = d
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    return `${dayName} ${time}`;
  }

  // Older than a week - show month and day
  const monthDay = d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();

  return `${monthDay} ${time}`;
}
