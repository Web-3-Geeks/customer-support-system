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
  },
  { timestamps: true }
);

ticketSchema.index({ createdBy: 1, createdAt: -1 });
ticketSchema.index({ assignedTo: 1, createdAt: -1 });
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ createdAt: -1 });

ticketSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Ticket", ticketSchema);
