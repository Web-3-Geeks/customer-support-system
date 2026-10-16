const { toRangeStart, toRangeEnd } = require("./dateRange");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;

// Defaults to the last 30 days. Analytics always describe tickets that were created inside the range.
const resolveRange = ({ from, to } = {}, now = new Date()) => {
  const end = to ? toRangeEnd(to) : now;
  const start = from ? toRangeStart(from) : new Date(end.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  return { from: start, to: end };
};

const isValidTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

// JavaScript accepts "asia/karachi" or "utc" in any letter case, but the database only knows the exact names
// ("Asia/Karachi", "UTC"), so the name is always passed on in its official spelling.
const canonicalTimeZone = (timeZone) =>
  new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;

// "YYYY-MM-DD" of a moment as seen in a time zone.
const localDate = (date, timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// The first day of the day / Monday-based week / month that a local date belongs to.
const bucketOf = (dateKey, interval) => {
  if (interval === "day") return dateKey;

  const [year, month, day] = dateKey.split("-").map(Number);
  if (interval === "month") return `${year}-${String(month).padStart(2, "0")}-01`;

  const date = new Date(Date.UTC(year, month - 1, day));
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - sinceMonday);
  return date.toISOString().slice(0, 10);
};

// Every bucket between two moments, in order, so a chart shows empty days as zero instead of skipping them.
const bucketKeys = (from, to, interval, timeZone) => {
  const keys = [];
  const seen = new Set();
  const add = (date) => {
    const key = bucketOf(localDate(date, timeZone), interval);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  };

  for (let at = from.getTime(); at < to.getTime(); at += 6 * 60 * 60 * 1000) add(new Date(at));
  add(to);
  return keys;
};

module.exports = {
  DAY_MS,
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_DAYS,
  resolveRange,
  isValidTimeZone,
  canonicalTimeZone,
  bucketKeys,
};
