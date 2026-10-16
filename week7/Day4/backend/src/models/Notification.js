const mongoose = require("mongoose");
const { NOTIFICATION_TYPE, NOTIFICATION_RETENTION_DAYS } = require("../utils/notificationRules");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPE),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    // Several replies in one ticket share one unread notification; this counts them.
    count: {
      type: Number,
      default: 1,
      min: 1,
    },
    // When something last happened to this notification. The list is ordered by it, and so is the retention.
    lastEventAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The notification list and the unread count of one user.
notificationSchema.index({ userId: 1, lastEventAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, lastEventAt: -1 });

// At most one unread reply notification per user and ticket. This is what lets concurrent replies
// be merged safely with a single upsert instead of creating duplicates.
notificationSchema.index(
  { userId: 1, ticketId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { isRead: false, type: NOTIFICATION_TYPE.NEW_REPLY },
  }
);

// Old notifications clean themselves up.
notificationSchema.index(
  { lastEventAt: 1 },
  { expireAfterSeconds: NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 }
);

notificationSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Notification", notificationSchema);
