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
const { messageLimiter } = require("../middleware/rateLimiter");
const {
  createTicketSchema,
  ticketIdSchema,
  updateTicketSchema,
  updateStatusSchema,
  listTicketsSchema,
} = require("../validators/ticket.validator");
const {
  createMessage,
  listMessages,
  editMessage,
} = require("../controllers/message.controller");
const {
  createMessageSchema,
  updateMessageSchema,
  listMessagesSchema,
} = require("../validators/message.validator");
const { ROLES } = require("../utils/constants");

const router = express.Router();

router.use(protect);

router.post("/", authorize(ROLES.CUSTOMER), validate(createTicketSchema), createTicket);
router.get("/", validate(listTicketsSchema), listTickets);
router.get("/:id", validate(ticketIdSchema), getTicket);
router.patch("/:id", validate(updateTicketSchema), updateTicket);
router.patch("/:id/status", validate(updateStatusSchema), changeStatus);
router.post("/:id/messages", messageLimiter, validate(createMessageSchema), createMessage);
router.get("/:id/messages", validate(listMessagesSchema), listMessages);
router.patch("/:id/messages/:messageId", messageLimiter, validate(updateMessageSchema), editMessage);

module.exports = router;
