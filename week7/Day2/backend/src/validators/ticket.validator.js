const { z } = require("zod");
const {
  TICKET_STATUS,
  TICKET_PRIORITY,
  TICKET_CATEGORY,
} = require("../utils/ticketRules");
const { isValidDateParam, toRangeStart, toRangeEnd } = require("../utils/dateRange");

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

const dateParam = z
  .string()
  .refine(isValidDateParam, "Use YYYY-MM-DD or an ISO 8601 timestamp");

const subject = z
  .string({ error: "Subject is required" })
  .trim()
  .min(3, "Subject must be at least 3 characters")
  .max(150, "Subject must be at most 150 characters");

const description = z
  .string({ error: "Description is required" })
  .trim()
  .min(10, "Description must be at least 10 characters")
  .max(5000, "Description must be at most 5000 characters");

const category = z.enum(Object.values(TICKET_CATEGORY), {
  error: `Category must be one of: ${Object.values(TICKET_CATEGORY).join(", ")}`,
});

const priority = z.enum(Object.values(TICKET_PRIORITY), {
  error: `Priority must be one of: ${Object.values(TICKET_PRIORITY).join(", ")}`,
});

const status = z.enum(Object.values(TICKET_STATUS), {
  error: `Status must be one of: ${Object.values(TICKET_STATUS).join(", ")}`,
});

const createTicketSchema = z.object({
  body: z.object({
    subject,
    description,
    category: category.optional(),
  }),
});

const ticketIdSchema = z.object({
  params: z.object({ id: objectId }),
});

const updateTicketSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      subject: subject.optional(),
      description: description.optional(),
      category: category.optional(),
      priority: priority.optional(),
    })
    .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update"),
});

const updateStatusSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ status }),
});

const assignTicketSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    assignedTo: objectId,
  }),
});

const listTicketsSchema = z.object({
  query: z
    .object({
      status: status.optional(),
      priority: priority.optional(),
      category: category.optional(),
      assignedTo: z.union([objectId, z.literal("unassigned")]).optional(),
      from: dateParam.optional(),
      to: dateParam.optional(),
      q: z.string().trim().max(100, "Search text is too long").optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(10),
      sortBy: z.enum(["createdAt", "updatedAt", "ticketNumber"]).default("createdAt"),
      order: z.enum(["asc", "desc"]).default("desc"),
    })
    .refine((query) => !query.from || !query.to || toRangeStart(query.from) <= toRangeEnd(query.to), {
      message: "from must be before or equal to to",
      path: ["to"],
    }),
});

module.exports = {
  createTicketSchema,
  ticketIdSchema,
  updateTicketSchema,
  updateStatusSchema,
  assignTicketSchema,
  listTicketsSchema,
};
