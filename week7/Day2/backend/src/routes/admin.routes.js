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
const { ROLES } = require("../utils/constants");

const router = express.Router();

router.use(protect, authorize(ROLES.ADMIN));

router.get("/users", validate(listUsersSchema), listUsers);
router.patch("/users/:id/role", validate(updateRoleSchema), changeUserRole);

router.get("/tickets", validate(listTicketsSchema), listAllTickets);
router.patch("/tickets/:id/assign", validate(assignTicketSchema), assignTicket);

module.exports = router;
