const Notification = require("../models/Notification");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { ROLES } = require("../utils/constants");
const { NOTIFICATION_TYPE } = require("../utils/notificationRules");
const { TICKET_STATUS } = require("../utils/ticketRules");
const { HOUR_MS, SLA_CLOCK, getTargets } = require("../utils/slaRules");
const { emitNotification, emitNotificationsUpdated } = require("../socket/events");

// ---------------------------------------------------------------------------------------------
// Who is told about what (the person who did the action is never told about their own action):
//
//   ticket created      all admins
//   ticket assigned     the new agent and the customer
//   new reply           the other side: a customer's reply goes to the assigned agent (or to the admins while
//                       nobody is assigned); an agent's reply goes to the customer; an admin's reply goes to the
//                       customer and the assigned agent
//   status changed      the customer and the assigned agent
//   ticket resolved     the customer (the agent is told about the status change)
//   SLA at risk/breach  the assigned agent and all admins (only the admins while nobody is assigned)
// ---------------------------------------------------------------------------------------------

const preview = (text, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}...` : text);

const readable = (value) => value.replace(/_/g, " ").toLowerCase();

// A ticket loaded with populate() carries whole user documents instead of ids; both forms are accepted.
const idOf = (value) => (value && value._id ? value._id : value);

const formatDuration = (ms) => {
  const hours = ms / HOUR_MS;
  if (hours >= 48) return `${Math.round(hours / 24)} days`;
  return `${Math.round(hours)}h`;
};

// Notifications must never make the action that caused them fail: the ticket change is already saved.
const bestEffort = (name, fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    logger.error("Notification failed", { name, err: error });
    return null;
  }
};

const unreadCountFor = (userId) => Notification.countDocuments({ userId, isRead: false });

const adminIds = async () => {
  const admins = await User.find({ role: ROLES.ADMIN }).select("_id");
  return admins.map((admin) => admin._id);
};

// Removes duplicates, empty values and the person who caused the event.
const recipientsExcept = (ids, actorId) => {
  const seen = new Set();
  const result = [];
  for (const id of ids) {
    if (!id) continue;
    const key = String(idOf(id));
    if (key === String(idOf(actorId)) || seen.has(key)) continue;
    seen.add(key);
    result.push(idOf(id));
  }
  return result;
};

const push = async (notification) => {
  emitNotification(notification.userId, notification.toJSON(), await unreadCountFor(notification.userId));
};

const deliver = async (entries) => {
  if (entries.length === 0) return [];
  const created = await Notification.insertMany(entries);
  await Promise.all(created.map(push));
  return created;
};

const entryFor = (userId, ticket, type, title, message) => ({
  userId: idOf(userId),
  ticketId: ticket._id,
  type,
  title,
  message,
});

const notifyTicketCreated = async (ticket, customer) => {
  const recipients = recipientsExcept(await adminIds(), customer._id);
  await deliver(
    recipients.map((userId) =>
      entryFor(
        userId,
        ticket,
        NOTIFICATION_TYPE.TICKET_CREATED,
        `New ticket ${ticket.ticketNumber}`,
        `${customer.name}: ${preview(ticket.subject, 120)}`
      )
    )
  );
};

const notifyTicketAssigned = async (ticket, agent, actor) => {
  const entries = [];

  if (String(agent._id) !== String(actor._id)) {
    entries.push(
      entryFor(
        agent._id,
        ticket,
        NOTIFICATION_TYPE.TICKET_ASSIGNED,
        "A ticket was assigned to you",
        `${ticket.ticketNumber}: ${preview(ticket.subject, 120)}`
      )
    );
  }
  if (String(idOf(ticket.createdBy)) !== String(actor._id)) {
    entries.push(
      entryFor(
        ticket.createdBy,
        ticket,
        NOTIFICATION_TYPE.TICKET_ASSIGNED,
        `${ticket.ticketNumber} has an agent`,
        `${agent.name} will handle your ticket.`
      )
    );
  }
  await deliver(entries);
};

// Replies in a busy conversation would bury the list, so while a user still has an unread reply notification
// for a ticket, new replies update that one (count, text, time) instead of adding another.
const upsertReply = async (userId, ticket, text, now) => {
  const filter = { userId, ticketId: ticket._id, type: NOTIFICATION_TYPE.NEW_REPLY, isRead: false };
  const update = {
    $inc: { count: 1 },
    $set: {
      title: `New reply on ${ticket.ticketNumber}`,
      message: text,
      lastEventAt: now,
    },
  };
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };

  try {
    return await Notification.findOneAndUpdate(filter, update, options);
  } catch (error) {
    // Two replies at the same moment can both try to insert; the unique index lets one win, so retry as an update.
    if (error.code === 11000) {
      return Notification.findOneAndUpdate(filter, update, { new: true });
    }
    throw error;
  }
};

const notifyReply = async (ticket, message, sender) => {
  let recipients;
  if (sender.role === ROLES.CUSTOMER) {
    recipients = ticket.assignedTo ? [ticket.assignedTo] : await adminIds();
  } else {
    recipients = [ticket.createdBy, ticket.assignedTo];
    if (sender.role === ROLES.AGENT) recipients = [ticket.createdBy];
  }

  const text = `${sender.name}: ${preview(message.message)}`;
  const now = new Date();

  await Promise.all(
    recipientsExcept(recipients, sender._id).map(async (userId) => {
      const notification = await upsertReply(userId, ticket, text, now);
      await push(notification);
    })
  );
};

const notifyStatusChanged = async (ticket, from, actor) => {
  const to = ticket.status;
  const entries = [];

  const customerIsResolved = to === TICKET_STATUS.RESOLVED;
  const customerEntry = customerIsResolved
    ? entryFor(
        ticket.createdBy,
        ticket,
        NOTIFICATION_TYPE.TICKET_RESOLVED,
        `${ticket.ticketNumber} was resolved`,
        `${actor.name} marked your ticket as resolved. Please confirm that it is solved.`
      )
    : entryFor(
        ticket.createdBy,
        ticket,
        NOTIFICATION_TYPE.STATUS_CHANGED,
        `${ticket.ticketNumber} status changed`,
        `${readable(from)} -> ${readable(to)} (by ${actor.name})`
      );

  const agentEntry = ticket.assignedTo
    ? entryFor(
        ticket.assignedTo,
        ticket,
        NOTIFICATION_TYPE.STATUS_CHANGED,
        `${ticket.ticketNumber} status changed`,
        `${readable(from)} -> ${readable(to)} (by ${actor.name})`
      )
    : null;

  for (const entry of [customerEntry, agentEntry]) {
    if (entry && String(entry.userId) !== String(actor._id)) entries.push(entry);
  }
  await deliver(entries);
};

const SLA_CLOCK_LABELS = {
  [SLA_CLOCK.FIRST_RESPONSE]: { name: "First response", targetKey: "firstResponseMs" },
  [SLA_CLOCK.RESOLUTION]: { name: "Resolution", targetKey: "resolutionMs" },
};

const notifySlaAlert = async (ticket, clock, breached) => {
  const label = SLA_CLOCK_LABELS[clock];
  const target = formatDuration(getTargets(ticket.priority)[label.targetKey]);

  const recipients = recipientsExcept([ticket.assignedTo, ...(await adminIds())], null);

  const type = breached ? NOTIFICATION_TYPE.SLA_BREACHED : NOTIFICATION_TYPE.SLA_AT_RISK;
  const title = breached ? `SLA breached: ${ticket.ticketNumber}` : `SLA at risk: ${ticket.ticketNumber}`;
  const message = breached
    ? `${label.name} deadline has passed (target ${target}).`
    : `${label.name} deadline is close (target ${target}).`;

  await deliver(recipients.map((userId) => entryFor(userId, ticket, type, title, message)));
};

// A user who lost access to a ticket (it was reassigned to someone else) must not keep notifications about it:
// they contain previews of the conversation they can no longer open.
const removeTicketNotifications = async (userId, ticketId) => {
  const result = await Notification.deleteMany({ userId, ticketId });
  if (result.deletedCount > 0) {
    emitNotificationsUpdated(userId, await unreadCountFor(userId));
  }
};

// ------------------------------------------------------------------ reading and marking

const list = async (user, { page, limit, unread }) => {
  const filter = { userId: user._id };
  if (unread === true) filter.isRead = false;
  if (unread === false) filter.isRead = true;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ lastEventAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    unreadCountFor(user._id),
  ]);

  return {
    notifications,
    unreadCount,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};

const markRead = async (user, id) => {
  const filter = { _id: id, userId: user._id };

  let notification = await Notification.findOneAndUpdate(
    { ...filter, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );

  if (!notification) {
    // Already read (marking twice is fine) or not this user's notification.
    notification = await Notification.findOne(filter);
    if (!notification) {
      throw new AppError("Notification not found", 404);
    }
  }

  const unreadCount = await unreadCountFor(user._id);
  emitNotificationsUpdated(user._id, unreadCount);
  return { notification, unreadCount };
};

const markAllRead = async (user, { ticketId } = {}) => {
  const filter = { userId: user._id, isRead: false };
  if (ticketId) filter.ticketId = ticketId;

  const result = await Notification.updateMany(filter, { $set: { isRead: true, readAt: new Date() } });

  const unreadCount = await unreadCountFor(user._id);
  emitNotificationsUpdated(user._id, unreadCount);
  return { updated: result.modifiedCount, unreadCount };
};

module.exports = {
  notifyTicketCreated: bestEffort("ticket created", notifyTicketCreated),
  notifyTicketAssigned: bestEffort("ticket assigned", notifyTicketAssigned),
  notifyReply: bestEffort("reply", notifyReply),
  notifyStatusChanged: bestEffort("status changed", notifyStatusChanged),
  notifySlaAlert: bestEffort("sla alert", notifySlaAlert),
  removeTicketNotifications: bestEffort("remove ticket notifications", removeTicketNotifications),
  list,
  markRead,
  markAllRead,
};
