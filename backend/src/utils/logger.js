// One place for all logging, so every line has the same shape and nothing sensitive can slip into it.
//  - production: one JSON object per line (easy to search in the hosting dashboard)
//  - development: a readable line
//  - tests: silent, unless LOG_LEVEL is set
// Passwords, tokens and connection strings are replaced before anything is written.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|uri|credential/i;
const CONNECTION_STRING = /mongodb(\+srv)?:\/\/[^\s"']+/gi;
const BEARER = /Bearer\s+[\w.-]+/gi;
const MAX_DEPTH = 4;
const STACK_LINES = 8;

const currentLevel = () => {
  const name = process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info");
  if (name === "silent") return -1;
  return LEVELS[name] ?? LEVELS.info;
};

const scrubText = (text) =>
  String(text).replace(CONNECTION_STRING, "mongodb://[redacted]").replace(BEARER, "Bearer [redacted]");

const serializeError = (error) => ({
  name: error.name,
  message: scrubText(error.message),
  ...(error.code !== undefined ? { code: error.code } : {}),
  stack: error.stack ? scrubText(error.stack.split("\n").slice(0, STACK_LINES).join("\n")) : undefined,
});

const clean = (value, depth = 0) => {
  if (value instanceof Error) return serializeError(value);
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[too deep]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => clean(item, depth + 1));

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : clean(item, depth + 1);
  }
  return result;
};

const format = (level, message, meta) => {
  const fields = clean(meta);
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify({ time: new Date().toISOString(), level, message: scrubText(message), ...fields });
  }
  const details = Object.entries(fields)
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(" ");
  return `${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${scrubText(message)}${details ? " " + details : ""}`;
};

const write = (level, message, meta = {}) => {
  if (LEVELS[level] > currentLevel()) return;
  const line = format(level, message, meta);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

const logger = {
  error: (message, meta) => write("error", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  info: (message, meta) => write("info", message, meta),
  debug: (message, meta) => write("debug", message, meta),
};

module.exports = logger;
module.exports.clean = clean;
module.exports.scrubText = scrubText;
