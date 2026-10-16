const { z } = require("zod");
const {
  DEFAULT_NOTIFICATION_LIMIT,
  MAX_NOTIFICATION_LIMIT,
} = require("../utils/notificationRules");
const { MAX_PAGE } = require("../utils/pagination");

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

const listNotificationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_NOTIFICATION_LIMIT).default(DEFAULT_NOTIFICATION_LIMIT),
    unread: z
      .enum(["true", "false"], { error: "unread must be true or false" })
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
  }),
});

const markReadSchema = z.object({
  params: z.object({ id: objectId }),
});

// An optional ticketId limits "mark all as read" to one ticket, for example when its page is opened.
const markAllReadSchema = z.object({
  body: z.object({ ticketId: objectId.optional() }),
});

module.exports = { listNotificationsSchema, markReadSchema, markAllReadSchema };
