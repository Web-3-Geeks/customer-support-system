const mongoose = require("mongoose");
const {
  TICKET_STATUS,
  TICKET_PRIORITY,
  TICKET_CATEGORY,
} = require("../utils/ticketRules");

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
    },
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
      minlength: 3,
      maxlength: 150,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: 10,
      maxlength: 5000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    category: {
      type: String,
      enum: Object.values(TICKET_CATEGORY),
      default: TICKET_CATEGORY.GENERAL,
    },
    priority: {
      type: String,
      enum: Object.values(TICKET_PRIORITY),
      default: TICKET_PRIORITY.MEDIUM,
    },
    status: {
      type: String,
      enum: Object.values(TICKET_STATUS),
      default: TICKET_STATUS.OPEN,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },

    // SLA tracking (rules live in utils/slaRules.js). Deadlines are counted from creation.
    firstResponseDueAt: { type: Date, default: null },
    firstResponseWarnAt: { type: Date, default: null },
    firstResponseAt: { type: Date, default: null },
    // Fixed at the moment the milestone happens: true = in time, false = late, null = not happened yet.
    firstResponseMet: { type: Boolean, default: null },
    resolutionDueAt: { type: Date, default: null },
    resolutionWarnAt: { type: Date, default: null },
    resolutionMet: { type: Boolean, default: null },
    // When the background worker sent each alert, so every alert is sent only once per deadline.
    slaAlerts: {
      firstResponseAtRisk: { type: Date, default: null },
      firstResponseBreached: { type: Date, default: null },
      resolutionAtRisk: { type: Date, default: null },
      resolutionBreached: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// Every ticket list sorts by a field and then by _id (so pages never repeat or skip a ticket). An index can only
// serve that sort if _id is its last key; without it MongoDB reads every matching ticket and sorts them in memory.
// The list of one customer or one agent, the unassigned list (assignedTo: null) and the status filter:
ticketSchema.index({ createdBy: 1, createdAt: -1, _id: -1 });
ticketSchema.index({ assignedTo: 1, createdAt: -1, _id: -1 });
ticketSchema.index({ status: 1, createdAt: -1, _id: -1 });
// The admin's list of all tickets, in each of the three sort orders, and the date range filter:
ticketSchema.index({ createdAt: -1, _id: -1 });
ticketSchema.index({ updatedAt: -1, _id: -1 });
ticketSchema.index({ ticketNumber: 1, _id: 1 });
// Counts by status and priority.
ticketSchema.index({ status: 1, priority: 1 });
// Overdue and at-risk searches, the SLA worker and the analytics all look for tickets with a clock still running.
ticketSchema.index({ status: 1, firstResponseAt: 1, firstResponseDueAt: 1 });
ticketSchema.index({ status: 1, resolvedAt: 1, resolutionDueAt: 1 });

ticketSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Ticket", ticketSchema);
