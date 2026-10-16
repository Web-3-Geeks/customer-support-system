const notificationService = require("../services/notification.service");

const listNotifications = async (req, res) => {
  const { notifications, unreadCount, pagination } = await notificationService.list(
    req.user,
    req.validated.query
  );
  res.status(200).json({
    success: true,
    results: notifications.length,
    unreadCount,
    pagination,
    data: { notifications },
  });
};

const markNotificationRead = async (req, res) => {
  const { notification, unreadCount } = await notificationService.markRead(req.user, req.params.id);
  res.status(200).json({ success: true, unreadCount, data: { notification } });
};

const markAllNotificationsRead = async (req, res) => {
  const { updated, unreadCount } = await notificationService.markAllRead(req.user, req.body);
  res.status(200).json({ success: true, updated, unreadCount });
};

module.exports = { listNotifications, markNotificationRead, markAllNotificationsRead };
