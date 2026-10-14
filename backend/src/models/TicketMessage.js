const mongoose = require("mongoose");
const { MESSAGE_TYPE, MESSAGE_MAX_LENGTH } = require("../utils/messageRules");

const ticketMessageSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      minlength: 1,
      maxlength: MESSAGE_MAX_LENGTH,
    },
    messageType: {
      type: String,
      enum: Object.values(MESSAGE_TYPE),
      default: MESSAGE_TYPE.TEXT,
    },
    editedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Conversation history: one ticket's messages in time order, newest-first pagination.
ticketMessageSchema.index({ ticketId: 1, _id: -1 });

ticketMessageSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("TicketMessage", ticketMessageSchema);
