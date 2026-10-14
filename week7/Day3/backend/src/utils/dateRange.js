const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

// A range bound is either a plain date (YYYY-MM-DD, read as UTC) or an ISO 8601 timestamp.
const isValidDateParam = (value) =>
  (DATE_ONLY.test(value) || TIMESTAMP.test(value)) && !Number.isNaN(Date.parse(value));

const toRangeStart = (value) =>
  new Date(DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value);

// A plain date as the upper bound includes that whole day.
const toRangeEnd = (value) =>
  new Date(DATE_ONLY.test(value) ? `${value}T23:59:59.999Z` : value);

module.exports = { isValidDateParam, toRangeStart, toRangeEnd };
