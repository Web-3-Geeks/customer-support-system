const { z } = require("zod");
const {
  MESSAGE_MAX_LENGTH,
  DEFAULT_MESSAGE_LIMIT,
  MAX_MESSAGE_LIMIT,
} = require("../utils/messageRules");

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

const message = z
  .string({ error: "Message is required" })
  .trim()
  .min(1, "Message cannot be empty")
  .max(MESSAGE_MAX_LENGTH, `Message must be at most ${MESSAGE_MAX_LENGTH} characters`);

const ticketParams = z.object({ id: objectId });

const createMessageSchema = z.object({
  params: ticketParams,
  body: z.object({ message }),
});

const updateMessageSchema = z.object({
  params: ticketParams.extend({ messageId: objectId }),
  body: z.object({ message }),
});

const listMessagesSchema = z.object({
  params: ticketParams,
  query: z.object({
    limit: z.coerce.number().int().min(1).max(MAX_MESSAGE_LIMIT).default(DEFAULT_MESSAGE_LIMIT),
    before: objectId.optional(),
    after: objectId.optional(),
  }).refine((query) => !(query.before && query.after), {
    message: "Use either before or after, not both",
    path: ["after"],
  }),
});

module.exports = {
  createMessageSchema,
  updateMessageSchema,
  listMessagesSchema,
};
