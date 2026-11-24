export type NotificationStateItem = {
  id: number;
  read_at: string | null;
  [key: string]: unknown;
};

export function markNotificationRead<T extends NotificationStateItem>(
  notifications: T[],
  notificationId: number,
  readAt: string,
): T[];

export function countUnreadNotifications(notifications: NotificationStateItem[]): number;
