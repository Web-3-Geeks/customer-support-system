const express = require("express");
const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../controllers/notification.controller");
const { protect } = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
  listNotificationsSchema,
  markReadSchema,
  markAllReadSchema,
} = require("../validators/notification.validator");

const router = express.Router();

// Every notification belongs to one user, and every query in the service is limited to the logged-in user.
router.use(protect);

router.get("/", validate(listNotificationsSchema), listNotifications);
router.patch("/read-all", validate(markAllReadSchema), markAllNotificationsRead);
router.patch("/:id/read", validate(markReadSchema), markNotificationRead);

module.exports = router;
