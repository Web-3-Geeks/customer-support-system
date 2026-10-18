// A simple allowance per connection: at most `max` events in any `windowMs`. It protects the server from one client
// that sends join / leave events in a tight loop (each one costs a database read).
const createEventLimiter = ({ max = 30, windowMs = 10 * 1000 } = {}) => {
  let windowStart = Date.now();
  let count = 0;

  return () => {
    const now = Date.now();
    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count <= max;
  };
};

module.exports = { createEventLimiter };
