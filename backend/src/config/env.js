// Checks the environment before the server starts, so a wrong setting stops the deploy with a clear message
// instead of showing up later as a strange CORS or login error.
// In production a problem is fatal; in development it is only a warning.

const MIN_SECRET_LENGTH = 32;

const isHttpUrl = (value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const checkEnvironment = (env = process.env) => {
  const production = env.NODE_ENV === "production";
  const errors = [];
  const warnings = [];
  // Settings that would break the app everywhere are always errors; the rest are errors only in production.
  const problem = (message, { always = false } = {}) => (always || production ? errors : warnings).push(message);

  if (!env.MONGO_URI) problem("MONGO_URI is not set", { always: true });

  if (!env.JWT_SECRET) {
    problem("JWT_SECRET is not set", { always: true });
  } else {
    if (env.JWT_SECRET.length < MIN_SECRET_LENGTH) {
      problem(`JWT_SECRET is too short (use at least ${MIN_SECRET_LENGTH} random characters)`);
    }
    if (/change_this/i.test(env.JWT_SECRET)) problem("JWT_SECRET still has the placeholder value from .env.example");
  }

  if (!env.JWT_EXPIRES_IN) problem("JWT_EXPIRES_IN is not set (for example 7d)");

  if (!env.CLIENT_URL) {
    problem("CLIENT_URL is not set, so CORS would allow every website to call the API");
  } else if (!isHttpUrl(env.CLIENT_URL)) {
    problem("CLIENT_URL must be a full URL such as https://your-app.vercel.app");
  } else if (env.CLIENT_URL.endsWith("/")) {
    problem("CLIENT_URL must not end with a slash, or the browser's origin will not match it");
  }

  if (env.PORT !== undefined && !/^\d+$/.test(env.PORT)) problem("PORT must be a number");

  return { errors, warnings };
};

module.exports = { checkEnvironment, MIN_SECRET_LENGTH };
