const TicketMessage = require("../models/TicketMessage");
const AppError = require("../utils/AppError");
const { TICKET_STATUS } = require("../utils/ticketRules");
const {
  MESSAGE_TYPE,
  MESSAGE_EDIT_WINDOW_MS,
  isWithinEditWindow,
} = require("../utils/messageRules");
const { ROLES } = require("../utils/constants");
const { findTicketForUser } = require("./ticketAccess");
const { recordFirstResponse } = require("./sla.service");
const { notifyReply } = require("./notification.service");
const { emitTicketMessage } = require("../socket/events");

const SENDER_FIELDS = "name role";

// editableUntil does not depend on who is looking, so the same payload can be broadcast to everyone.
// The client shows the edit button only to the sender; the server enforces every rule again on PATCH.
const present = (message) => ({
  ...message.toJSON(),
  editableUntil:
    message.messageType === MESSAGE_TYPE.TEXT
      ? new Date(message.createdAt.getTime() + MESSAGE_EDIT_WINDOW_MS)
      : null,
});

const populateSender = (docOrQuery) => docOrQuery.populate("senderId", SENDER_FIELDS);

// Real-time clients get the message only after it has been saved. The sender also gets it in the API response,
// so clients match messages by _id to avoid showing one twice.
const broadcast = (ticketId, message) => {
  emitTicketMessage(ticketId, message);
  return message;
};

// The message is already saved and delivered, so a problem with the SLA bookkeeping must not fail the request.
const trackFirstResponse = async (ticket, at) => {
  try {
    await recordFirstResponse(ticket, at);
  } catch (error) {
    console.error(`Could not record first response: ${error.message}`);
  }
};

const createMessage = async (user, ticketId, text) => {
  const ticket = await findTicketForUser(user, ticketId);
  if (ticket.status === TICKET_STATUS.CLOSED) {
    throw new AppError("Closed tickets cannot receive new messages", 400);
  }

  const message = await TicketMessage.create({
    ticketId: ticket._id,
    senderId: user._id,
    message: text,
  });
  await populateSender(message);
  const result = broadcast(ticket._id, present(message));

  // Only a staff reply starts counting as the first response; the customer writing again does not.
  if (user.role !== ROLES.CUSTOMER) {
    await trackFirstResponse(ticket, message.createdAt);
  }
  await notifyReply(ticket, message, user);
  return result;
};

// System lines ("Status changed to RESOLVED") are written by the server on behalf of whoever did the action.
// They are not checked against the ticket status, because closing a ticket creates one too.
const createSystemMessage = async (actor, ticketId, text) => {
  const message = await TicketMessage.create({
    ticketId,
    senderId: actor._id,
    message: text,
    messageType: MESSAGE_TYPE.SYSTEM,
  });
  await populateSender(message);
  return broadcast(ticketId, present(message));
};

// Default and `before`: the newest page, returned oldest-first. `after`: everything newer than a known message.
const listMessages = async (user, ticketId, { limit, before, after }) => {
  const ticket = await findTicketForUser(user, ticketId);

  const filter = { ticketId: ticket._id };
  if (before) filter._id = { $lt: before };
  if (after) filter._id = { $gt: after };

  const newestFirst = !after;
  const found = await populateSender(
    TicketMessage.find(filter)
      .sort({ _id: newestFirst ? -1 : 1 })
      .limit(limit + 1)
  );

  const hasMore = found.length > limit;
  const page = found.slice(0, limit);
  if (newestFirst) page.reverse();

  return { messages: page.map(present), hasMore };
};

const editMessage = async (user, ticketId, messageId, text) => {
  const ticket = await findTicketForUser(user, ticketId);

  const message = await TicketMessage.findOne({ _id: messageId, ticketId: ticket._id });
  if (!message) {
    throw new AppError("Message not found", 404);
  }
  if (message.messageType !== MESSAGE_TYPE.TEXT) {
    throw new AppError("System messages cannot be edited", 403);
  }
  if (String(message.senderId) !== String(user._id)) {
    throw new AppError("You can only edit your own messages", 403);
  }
  if (ticket.status === TICKET_STATUS.CLOSED) {
    throw new AppError("Messages on a closed ticket cannot be edited", 400);
  }
  if (!isWithinEditWindow(message.createdAt)) {
    throw new AppError(
      `Messages can only be edited within ${MESSAGE_EDIT_WINDOW_MS / 60000} minutes of sending`,
      400
    );
  }

  const changed = text !== message.message;
  if (changed) {
    message.message = text;
    message.editedAt = new Date();
    await message.save();
  }
  await populateSender(message);
  const result = present(message);
  return changed ? broadcast(ticket._id, result) : result;
};

module.exports = {
  createMessage,
  createSystemMessage,
  listMessages,
  editMessage,
};
