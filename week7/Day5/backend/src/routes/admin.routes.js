const express = require("express");
const {
  listUsers,
  changeUserRole,
  listAllTickets,
  assignTicket,
} = require("../controllers/admin.controller");
const { protect, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { updateRoleSchema, listUsersSchema } = require("../validators/admin.validator");
const { listTicketsSchema, assignTicketSchema } = require("../validators/ticket.validator");
const analytics = require("../controllers/analytics.controller");
const { analyticsRangeSchema, analyticsTicketsSchema } = require("../validators/analytics.validator");
const { ROLES } = require("../utils/constants");

const router = express.Router();

router.use(protect, authorize(ROLES.ADMIN));

router.get("/users", validate(listUsersSchema), listUsers);
router.patch("/users/:id/role", validate(updateRoleSchema), changeUserRole);

router.get("/tickets", validate(listTicketsSchema), listAllTickets);
router.patch("/tickets/:id/assign", validate(assignTicketSchema), assignTicket);

// Statistics are calculated by the database; the date range and time zone come from the query.
router.get("/analytics/overview", validate(analyticsRangeSchema), analytics.overview);
router.get("/analytics/tickets", validate(analyticsTicketsSchema), analytics.tickets);
router.get("/analytics/agents", validate(analyticsRangeSchema), analytics.agents);
router.get("/analytics/sla", validate(analyticsRangeSchema), analytics.sla);

module.exports = router;
