import test from "node:test";
import assert from "node:assert/strict";
import { countUnreadNotifications, markNotificationRead } from "../src/lib/notificationState.mjs";

test("marking a notification as read updates its state and unread badge count", () => {
  const notifications = [
    { id: 4, message: "Inquiry accepted", read_at: null },
    { id: 5, message: "Inquiry resolved", read_at: "2026-11-25T08:00:00.000Z" },
  ];

  const updated = markNotificationRead(notifications, 4, "2026-11-25T09:00:00.000Z");

  assert.equal(updated[0].read_at, "2026-11-25T09:00:00.000Z");
  assert.equal(countUnreadNotifications(updated), 0);
  assert.equal(notifications[0].read_at, null, "the previous React state remains unchanged");
});
