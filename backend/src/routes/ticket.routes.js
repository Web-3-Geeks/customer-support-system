const express = require("express");
const {
  createTicket,
  listTickets,
  getTicket,
  updateTicket,
  changeStatus,
} = require("../controllers/ticket.controller");
const { protect, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
  createTicketSchema,
  ticketIdSchema,
  updateTicketSchema,
  updateStatusSchema,
  listTicketsSchema,
} = require("../validators/ticket.validator");
const { ROLES } = require("../utils/constants");

const router = express.Router();

router.use(protect);

router.post("/", authorize(ROLES.CUSTOMER), validate(createTicketSchema), createTicket);
router.get("/", validate(listTicketsSchema), listTickets);
router.get("/:id", validate(ticketIdSchema), getTicket);
router.patch("/:id", validate(updateTicketSchema), updateTicket);
router.patch("/:id/status", validate(updateStatusSchema), changeStatus);

module.exports = router;
