import { Capacitor } from "@capacitor/core";
import type { MorningNotificationSettings, WeekDetail } from "@/lib/smart-paper-types";

const MORNING_NOTIFICATION_KEY = "smart-paper.local.morning-notification";
const MORNING_NOTIFICATION_ID = 8001;

export type NotificationSyncResult = "scheduled" | "disabled" | "web" | "denied";

export function getMorningNotificationSettings(): MorningNotificationSettings {
  if (typeof window === "undefined") {
    return { enabled: false, time: "08:00" };
  }
  const raw = window.localStorage.getItem(MORNING_NOTIFICATION_KEY);
  if (!raw) return { enabled: false, time: "08:00" };
  try {
    const parsed = JSON.parse(raw) as Partial<MorningNotificationSettings>;
    return {
      enabled: parsed.enabled === true,
      time:
        typeof parsed.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.time)
          ? parsed.time
          : "08:00",
    };
  } catch {
    return { enabled: false, time: "08:00" };
  }
}

export function saveMorningNotificationSettings(
  settings: MorningNotificationSettings,
): MorningNotificationSettings {
  const normalized = {
    enabled: settings.enabled,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time) ? settings.time : "08:00",
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MORNING_NOTIFICATION_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

function nextNotificationDate(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function notificationBody(week: WeekDetail | null, targetDate: Date, fallback: string): string {
  const isoDate = localIsoDate(targetDate);
  const day = week?.days.find((item) => item.date === isoDate);
  const entries = day?.schedule_entries ?? [];
  if (entries.length === 0) return fallback;
  return entries
    .slice(0, 4)
    .map((entry) => `${entry.start_time} ${entry.title}`)
    .join(" • ");
}

let notificationSyncChain: Promise<NotificationSyncResult | void> = Promise.resolve();

export function syncMorningPlanNotification(
  week: WeekDetail | null,
  copy: { title: string; fallbackBody: string },
  requestPermission = true,
): Promise<NotificationSyncResult> {
  const result = notificationSyncChain.then(() => performNotificationSync(week, copy, requestPermission));
  notificationSyncChain = result.catch(() => {});
  return result;
}

async function performNotificationSync(
  week: WeekDetail | null,
  copy: { title: string; fallbackBody: string },
  requestPermission: boolean,
): Promise<NotificationSyncResult> {
  const settings = getMorningNotificationSettings();
  if (!Capacitor.isNativePlatform()) return "web";

  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.cancel({ notifications: [{ id: MORNING_NOTIFICATION_ID }] });

  if (!settings.enabled) return "disabled";

  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted" && !requestPermission) return "denied";
  const displayPermission =
    permission.display === "granted"
      ? permission
      : await LocalNotifications.requestPermissions();
  if (displayPermission.display !== "granted") return "denied";

  // Settings may change while a permission/native call is pending.
  const latestSettings = getMorningNotificationSettings();
  if (!latestSettings.enabled) return "disabled";
  const at = nextNotificationDate(latestSettings.time);
  if (process.env.NEXT_PUBLIC_DATA_MODE === "local") {
    const start = new Date(at);
    start.setDate(start.getDate() - (start.getDay() + 1) % 7);
    const { getLocalWeek } = await import("@/lib/local-store");
    week = await getLocalWeek(localIsoDate(start));
  }
  if (!getMorningNotificationSettings().enabled) return "disabled";
  await LocalNotifications.schedule({
    notifications: [
      {
        id: MORNING_NOTIFICATION_ID,
        title: copy.title,
        body: notificationBody(week, at, copy.fallbackBody),
        schedule: { at },
      },
    ],
  });
  return "scheduled";
}

let plannerNotificationTimer: ReturnType<typeof setTimeout> | undefined;
let plannerNotificationPending: { week: WeekDetail; copy: { title: string; fallbackBody: string } } | null = null;
let plannerNotificationRunning = false;

/** Coalesce Planner writes independently from persistence, without permission prompts. */
export function queuePlannerNotification(week: WeekDetail, copy: { title: string; fallbackBody: string }): void {
  plannerNotificationPending = { week, copy };
  clearTimeout(plannerNotificationTimer);
  plannerNotificationTimer = setTimeout(() => void drainPlannerNotification(), 1200);
}

async function drainPlannerNotification(): Promise<void> {
  if (plannerNotificationRunning || !plannerNotificationPending) return;
  plannerNotificationRunning = true;
  const pending = plannerNotificationPending;
  plannerNotificationPending = null;
  try {
    await syncMorningPlanNotification(pending.week, pending.copy, false);
  } catch {
    // Notification availability must not turn a successful planner write into failure.
  } finally {
    plannerNotificationRunning = false;
    if (plannerNotificationPending) {
      clearTimeout(plannerNotificationTimer);
      plannerNotificationTimer = setTimeout(() => void drainPlannerNotification(), 1200);
    }
  }
}
