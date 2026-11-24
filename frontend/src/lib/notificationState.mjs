/**
 * Return notification rows with the selected notification marked as read.
 * The input array and rows are left unchanged so this can be used in a React
 * state setter without mutating the current state.
 */
export function markNotificationRead(notifications, notificationId, readAt) {
  return notifications.map((notification) => notification.id === notificationId
    ? { ...notification, read_at: notification.read_at ?? readAt }
    : notification);
}

export function countUnreadNotifications(notifications) {
  return notifications.reduce((count, notification) => count + (notification.read_at ? 0 : 1), 0);
}
