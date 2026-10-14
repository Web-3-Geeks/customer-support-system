const MESSAGE_TYPE = {
  TEXT: "TEXT",
  SYSTEM: "SYSTEM",
};

const MESSAGE_MAX_LENGTH = 2000;

// A sender may edit their own TEXT message for this long after posting it.
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 100;

const isWithinEditWindow = (createdAt, now = Date.now()) =>
  now - new Date(createdAt).getTime() <= MESSAGE_EDIT_WINDOW_MS;

module.exports = {
  MESSAGE_TYPE,
  MESSAGE_MAX_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  DEFAULT_MESSAGE_LIMIT,
  MAX_MESSAGE_LIMIT,
  isWithinEditWindow,
};
