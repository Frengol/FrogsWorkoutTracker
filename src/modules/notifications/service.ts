import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getNotificationPreferences, writeAuditLog } from '@/src/shared/db/database';
import { NotificationTarget, isNotificationTarget, resolveNotificationTarget } from '@/src/shared/navigation/routes';

const CHANNEL_ID = 'frog-local';
const REMINDER_KIND = 'workout_reminder';
const REST_KIND = 'rest_timer';
const PR_KIND = 'pr_local';

let responseListener: Notifications.EventSubscription | null = null;
let initialized = false;

const parseReminderDays = (value: string | null) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as number[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getNotificationSnapshot = () => {
  const row = getNotificationPreferences();
  if (!row) {
    return null;
  }

  return {
    restTimerNotificationEnabled: row.rest_timer_enabled === 1,
    prNotificationEnabled: row.pr_enabled === 1,
    remindersEnabled: row.reminders_enabled === 1,
    reportsEnabled: row.reports_enabled === 1,
    reminderTimeLocal: row.reminder_time_local ?? '19:00',
    reminderDays: parseReminderDays(row.reminder_days_json),
  };
};

const ensurePermissions = async () => {
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
};

const ensureChannel = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Frogs Local',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#1C74F4',
  });
};

const parseReminderTime = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return {
    hour: Number.isFinite(hours) ? Math.max(0, Math.min(23, hours)) : 19,
    minute: Number.isFinite(minutes) ? Math.max(0, Math.min(59, minutes)) : 0,
  };
};

const getScheduledRequests = async () => Notifications.getAllScheduledNotificationsAsync();

const cancelByKind = async (kind: string) => {
  const scheduled = await getScheduledRequests();
  await Promise.all(
    scheduled
      .filter((request) => request.content.data?.kind === kind)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
};

export const initializeLocalNotifications = async () => {
  if (initialized) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  await ensureChannel();
  initialized = true;
};

export const registerNotificationResponseListener = () => {
  if (responseListener) {
    return () => undefined;
  }

  responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    const target = response.notification.request.content.data?.target;
    if (isNotificationTarget(target)) {
      router.push(resolveNotificationTarget(target));
    }
  });

  return () => {
    responseListener?.remove();
    responseListener = null;
  };
};

export const syncWorkoutReminderNotifications = async () => {
  await initializeLocalNotifications();
  await cancelByKind(REMINDER_KIND);

  const snapshot = getNotificationSnapshot();
  if (!snapshot?.remindersEnabled || snapshot.reminderDays.length === 0) {
    return 0;
  }

  const hasPermission = await ensurePermissions();
  if (!hasPermission) {
    return 0;
  }

  const { hour, minute } = parseReminderTime(snapshot.reminderTimeLocal);

  const scheduledIds = await Promise.all(
    snapshot.reminderDays.map((weekday) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Hora de treinar',
          body: 'Abra o Frogs e registre seu próximo treino.',
          data: {
            kind: REMINDER_KIND,
            target: { routeKey: 'workoutStart' } satisfies NotificationTarget,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
          channelId: CHANNEL_ID,
        },
      }),
    ),
  );

  writeAuditLog('notifications', REMINDER_KIND, 'reminders_synced', { scheduledIds, reminderDays: snapshot.reminderDays });
  return scheduledIds.length;
};

export const scheduleRestTimerNotification = async (
  seconds: number,
  target: NotificationTarget = { routeKey: 'workoutStart' },
) => {
  await initializeLocalNotifications();
  const snapshot = getNotificationSnapshot();
  if (!snapshot?.restTimerNotificationEnabled) {
    return null;
  }

  const hasPermission = await ensurePermissions();
  if (!hasPermission) {
    return null;
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Descanso encerrado',
      body: 'Volte para a próxima série no Frogs.',
      data: {
        kind: REST_KIND,
        target,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, seconds),
      channelId: CHANNEL_ID,
    },
  });

  return identifier;
};

export const cancelScheduledNotification = async (identifier: string | null | undefined) => {
  if (!identifier) {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(identifier);
};

export const sendPrNotification = async (
  message: string,
  target: NotificationTarget = { routeKey: 'progress' },
) => {
  await initializeLocalNotifications();
  const snapshot = getNotificationSnapshot();
  if (!snapshot?.prNotificationEnabled) {
    return null;
  }

  const hasPermission = await ensurePermissions();
  if (!hasPermission) {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Novo recorde no Frogs',
      body: message,
      data: {
        kind: PR_KIND,
        target,
      },
    },
    trigger: null,
  });
};
