const { z } = require("zod");
const { isValidDateParam } = require("../utils/dateRange");
const {
  DAY_MS,
  MAX_RANGE_DAYS,
  resolveRange,
  isValidTimeZone,
  canonicalTimeZone,
} = require("../utils/analyticsRange");

const dateParam = z.string().refine(isValidDateParam, "Use YYYY-MM-DD or an ISO 8601 timestamp");

const rangeFields = {
  from: dateParam.optional(),
  to: dateParam.optional(),
  // Days and weeks are cut in this time zone, so "today" means today for the person looking at the chart.
  tz: z.string().refine(isValidTimeZone, "Unknown time zone").transform(canonicalTimeZone).default("UTC"),
};

// The same defaults as the service, so the limit applies to the range that will really be used.
const withRangeRules = (shape) =>
  z
    .object(shape)
    .refine(
      (query) => {
        const { from, to } = resolveRange(query);
        return from <= to;
      },
      { message: "from must be before or equal to to", path: ["to"] }
    )
    .refine(
      (query) => {
        const { from, to } = resolveRange(query);
        return to - from <= MAX_RANGE_DAYS * DAY_MS;
      },
      { message: `The date range can be at most ${MAX_RANGE_DAYS} days`, path: ["to"] }
    );

const analyticsRangeSchema = z.object({ query: withRangeRules(rangeFields) });

const analyticsTicketsSchema = z.object({
  query: withRangeRules({
    ...rangeFields,
    interval: z.enum(["day", "week", "month"], { error: "interval must be day, week or month" }).default("day"),
  }),
});

module.exports = { analyticsRangeSchema, analyticsTicketsSchema };
