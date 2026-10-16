import { daysAgo, toDateInput } from "./dates";

export const PRESETS = [7, 30, 90];
export const MAX_RANGE_DAYS = 366;

// "Last N days" counts today as the last day.
export const presetRange = (days) => ({
  preset: days,
  from: toDateInput(daysAgo(days - 1)),
  to: toDateInput(new Date()),
});
