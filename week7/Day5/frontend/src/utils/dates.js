// The date inputs hold the user's local day; the API compares UTC timestamps.
export const startOfLocalDay = (date) => new Date(`${date}T00:00:00`).toISOString();
export const endOfLocalDay = (date) => new Date(`${date}T23:59:59.999`).toISOString();

// A Date as the "YYYY-MM-DD" text a date input uses (in local time).
export const toDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const daysAgo = (days, from = new Date()) => {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return date;
};

// Days and weeks in the analytics are cut in this zone, so "today" means the viewer's today.
export const getTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
