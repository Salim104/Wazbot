/**
 * Groups a collection of contacts by their creation date.
 * @param contacts Array of contact objects with _creationTime
 * @returns Sorted array of objects { date: string, count: number } for the last 7 days.
 */
export function groupContactsByDate(contacts: any[]) {
  const history: Record<string, number> = {};
  
  for (const contact of contacts) {
    const date = new Date(contact._creationTime).toISOString().split("T")[0];
    history[date] = (history[date] || 0) + 1;
  }

  return Object.entries(history)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7); // Default to last 7 days
}
