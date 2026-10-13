const { z } = require("zod");
const { ROLES } = require("../utils/constants");

const updateRoleSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id"),
  }),
  body: z.object({
    role: z.enum(Object.values(ROLES), { error: "Role must be CUSTOMER, AGENT or ADMIN" }),
  }),
});

const listUsersSchema = z.object({
  query: z.object({
    role: z.enum(Object.values(ROLES), { error: "Role must be CUSTOMER, AGENT or ADMIN" }).optional(),
  }),
});

module.exports = { updateRoleSchema, listUsersSchema };
