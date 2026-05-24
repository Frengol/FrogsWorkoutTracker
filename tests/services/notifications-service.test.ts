jest.mock('@/src/shared/db/database', () => ({
  getNotificationPreferences: jest.fn(),
  writeAuditLog: jest.fn(),
}));

import { router } from 'expo-router';
import { Platform } from 'react-native';

import {
  cancelScheduledNotification,
  initializeLocalNotifications,
  registerNotificationResponseListener,
  scheduleRestTimerNotification,
  sendRestTimerEndedNotification,
  sendPrNotification,
  syncWorkoutReminderNotifications,
} from '@/src/modules/notifications/service';
import { routes } from '@/src/shared/navigation/routes';
import { getNotificationPreferences, writeAuditLog } from '@/src/shared/db/database';

describe('notifications service', () => {
  const expectNotificationDataToBePrimitive = (data: Record<string, unknown>) => {
    Object.values(data).forEach((value) => {
      expect(['string', 'number', 'boolean']).toContain(typeof value);
    });
  };

  it('schedules weekly reminders based on local preferences', async () => {
    (getNotificationPreferences as jest.Mock).mockReturnValue({
      rest_timer_enabled: 1,
      pr_enabled: 1,
      reminders_enabled: 1,
      reports_enabled: 1,
      reminder_time_local: '18:45',
      reminder_days_json: '[2,4,6]',
    });

    const notifications = jest.requireMock('expo-notifications');

    await initializeLocalNotifications();
    const scheduled = await syncWorkoutReminderNotifications();

    expect(scheduled).toBe(3);
    expect(notifications.__getScheduledRequests()).toHaveLength(3);
    expect(notifications.__getScheduledRequests()[0].content.body).toBe(
      'Abra o Frogs, já está na hora do seu próximo treino!',
    );
    expect(notifications.__getScheduledRequests()[0].content.data).toEqual({
      kind: 'workout_reminder',
      target: JSON.stringify({ routeKey: 'workoutStart' }),
    });
    expectNotificationDataToBePrimitive(notifications.__getScheduledRequests()[0].content.data);
  });

  it('recovers from a broken native scheduled notification queue before syncing reminders', async () => {
    (getNotificationPreferences as jest.Mock).mockReturnValue({
      rest_timer_enabled: 1,
      pr_enabled: 1,
      reminders_enabled: 1,
      reports_enabled: 1,
      reminder_time_local: '08:15',
      reminder_days_json: '[2,4]',
    });

    const notifications = jest.requireMock('expo-notifications');
    notifications.__failNextScheduledRead();

    const scheduled = await syncWorkoutReminderNotifications();

    expect(scheduled).toBe(2);
    expect(notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(notifications.__getScheduledRequests().map((request: { trigger: { weekday: number } }) => request.trigger.weekday)).toEqual([
      2,
      4,
    ]);
  });

  it('normalizes reminder days and keeps syncing when one weekday fails', async () => {
    (getNotificationPreferences as jest.Mock).mockReturnValue({
      rest_timer_enabled: 1,
      pr_enabled: 1,
      reminders_enabled: 1,
      reports_enabled: 1,
      reminder_time_local: '18:45',
      reminder_days_json: '[4,2,2,0,8,"6",3.5]',
    });

    const notifications = jest.requireMock('expo-notifications');
    notifications.__failScheduleForWeekdays([4]);

    const scheduled = await syncWorkoutReminderNotifications();

    expect(scheduled).toBe(2);
    expect(notifications.__getScheduledRequests().map((request: { trigger: { weekday: number } }) => request.trigger.weekday)).toEqual([
      2,
      6,
    ]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      'notifications',
      'workout_reminder',
      'reminders_synced',
      expect.objectContaining({ reminderDays: [2, 4, 6], failedWeekdays: [4] }),
    );
  });

  it('rejects reminder sync only when every selected weekday fails', async () => {
    (getNotificationPreferences as jest.Mock).mockReturnValue({
      rest_timer_enabled: 1,
      pr_enabled: 1,
      reminders_enabled: 1,
      reports_enabled: 1,
      reminder_time_local: '18:45',
      reminder_days_json: '[2,4]',
    });

    const notifications = jest.requireMock('expo-notifications');
    notifications.__failScheduleForWeekdays([2, 4]);

    await expect(syncWorkoutReminderNotifications()).rejects.toThrow('Não foi possível agendar os lembretes.');
    expect(notifications.__getScheduledRequests()).toHaveLength(0);
  });

  it('respects notification toggles and deep-links responses', async () => {
    (getNotificationPreferences as jest.Mock).mockReturnValue({
      rest_timer_enabled: 1,
      pr_enabled: 1,
      reminders_enabled: 0,
      reports_enabled: 1,
      reminder_time_local: '19:00',
      reminder_days_json: '[]',
    });

    const notifications = jest.requireMock('expo-notifications');
    const cleanup = registerNotificationResponseListener();

    const restId = await scheduleRestTimerNotification(45, {
      routeKey: 'workoutLive',
      params: { workoutId: 'abc' },
    });
    const endedId = await sendRestTimerEndedNotification({
      routeKey: 'workoutLive',
      params: { workoutId: 'abc' },
    });
    const prId = await sendPrNotification('Novo recorde local', { routeKey: 'progress' });

    expect(restId).toBeTruthy();
    expect(endedId).toBeTruthy();
    expect(prId).toBeTruthy();
    expect(notifications.__getScheduledRequests()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.objectContaining({
            body: 'Volte para a próxima série no Frogs.',
            data: expect.objectContaining({
              kind: 'rest_timer',
              target: JSON.stringify({ routeKey: 'workoutLive', params: { workoutId: 'abc' } }),
            }),
          }),
        }),
        expect.objectContaining({
          content: expect.objectContaining({
            title: 'Descanso encerrado',
            body: 'Volte para a próxima série no Frogs.',
            data: expect.objectContaining({
              kind: 'rest_timer',
              target: JSON.stringify({ routeKey: 'workoutLive', params: { workoutId: 'abc' } }),
            }),
          }),
          trigger: null,
        }),
        expect.objectContaining({
          content: expect.objectContaining({
            title: 'Novo recorde no Frogs',
            data: expect.objectContaining({
              kind: 'pr_local',
              target: JSON.stringify({ routeKey: 'progress' }),
            }),
          }),
        }),
      ]),
    );
    notifications.__getScheduledRequests().forEach((request: { content: { data: Record<string, unknown> } }) => {
      expectNotificationDataToBePrimitive(request.content.data);
    });

    notifications.__emitResponse(JSON.stringify({ routeKey: 'workoutLive', params: { workoutId: 'abc' } }));
    expect(router.push).toHaveBeenCalledWith(routes.workout.live('abc'));

    notifications.__emitResponse({ routeKey: 'progress' });
    expect(router.push).toHaveBeenCalledWith(routes.progress());

    expect(router.push).toHaveBeenCalledTimes(2);
    notifications.__emitResponse('{"routeKey":"desconhecido"}');
    notifications.__emitResponse('{json quebrado');
    expect(router.push).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it('skips scheduling when toggles are off, permissions fail or the target is invalid', async () => {
    const notifications = jest.requireMock('expo-notifications');
    notifications.__setPermissionsGranted(false);

    (getNotificationPreferences as jest.Mock).mockReturnValue({
      rest_timer_enabled: 0,
      pr_enabled: 0,
      reminders_enabled: 1,
      reports_enabled: 1,
      reminder_time_local: '99:88',
      reminder_days_json: 'not-json',
    });

    expect(await syncWorkoutReminderNotifications()).toBe(0);
    expect(await scheduleRestTimerNotification(10)).toBeNull();
    expect(await sendRestTimerEndedNotification()).toBeNull();
    expect(await sendPrNotification('PR local')).toBeNull();

    const cleanup = registerNotificationResponseListener();
    notifications.__emitResponse({ routeKey: 'desconhecido' });
    expect(router.push).not.toHaveBeenCalled();
    cleanup();
  });

  it('avoids duplicate initialization and can cancel scheduled notifications safely', async () => {
    const notifications = jest.requireMock('expo-notifications');

    (getNotificationPreferences as jest.Mock).mockReturnValue({
      rest_timer_enabled: 1,
      pr_enabled: 1,
      reminders_enabled: 0,
      reports_enabled: 1,
      reminder_time_local: '19:00',
      reminder_days_json: '[]',
    });

    await initializeLocalNotifications();
    await initializeLocalNotifications();
    await cancelScheduledNotification(null);
    await cancelScheduledNotification('notification-1');

    expect(notifications.setNotificationHandler.mock.calls.length).toBeLessThanOrEqual(1);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');

    const cleanup = registerNotificationResponseListener();
    const noopCleanup = registerNotificationResponseListener();
    expect(typeof noopCleanup).toBe('function');
    cleanup();
  });

  it('requests permission when needed, configures the Android channel and uses default reminder time parsing', async () => {
    const notifications = jest.requireMock('expo-notifications');
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    notifications.__resetMockNotifications();

    let freshService!: typeof import('@/src/modules/notifications/service');
    jest.isolateModules(() => {
      freshService = require('@/src/modules/notifications/service');
    });

    notifications.getPermissionsAsync.mockResolvedValueOnce({ granted: false });
    notifications.requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
    (getNotificationPreferences as jest.Mock).mockReturnValue({
      rest_timer_enabled: 1,
      pr_enabled: 1,
      reminders_enabled: 1,
      reports_enabled: 1,
      reminder_time_local: 'ab:cd',
      reminder_days_json: '[1]',
    });

    await freshService.initializeLocalNotifications();
    const handler = notifications.setNotificationHandler.mock.calls[0][0];
    expect(await handler.handleNotification()).toEqual({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    });

    const scheduled = await freshService.syncWorkoutReminderNotifications();

    expect(scheduled).toBe(1);
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'frog-local',
      expect.objectContaining({ name: 'Frogs Local' }),
    );
    expect(notifications.__getScheduledRequests()[0].trigger).toEqual(
      expect.objectContaining({
        weekday: 1,
        hour: 19,
        minute: 0,
        channelId: 'frog-local',
      }),
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      'notifications',
      'workout_reminder',
      'reminders_synced',
      expect.objectContaining({ reminderDays: [1] }),
    );

    Object.defineProperty(Platform, 'OS', { value: originalOs });
  });

  it('returns null or zero when notification preferences are missing', async () => {
    (getNotificationPreferences as jest.Mock).mockReturnValue(null);

    await expect(syncWorkoutReminderNotifications()).resolves.toBe(0);
    await expect(scheduleRestTimerNotification(30)).resolves.toBeNull();
    await expect(sendRestTimerEndedNotification()).resolves.toBeNull();
    await expect(sendPrNotification('PR local')).resolves.toBeNull();
  });

  it('parses invalid reminder payloads and cancels only matching kinds', async () => {
    const notifications = jest.requireMock('expo-notifications');

    await notifications.scheduleNotificationAsync({
      content: { data: { kind: 'workout_reminder' } },
      trigger: null,
    });
    await notifications.scheduleNotificationAsync({
      content: { data: { kind: 'rest_timer' } },
      trigger: null,
    });

    (getNotificationPreferences as jest.Mock).mockReturnValue({
      rest_timer_enabled: 1,
      pr_enabled: 1,
      reminders_enabled: 1,
      reports_enabled: 1,
      reminder_time_local: '18:10',
      reminder_days_json: '{"invalid":true}',
    });

    const scheduled = await syncWorkoutReminderNotifications();

    expect(scheduled).toBe(0);
    expect(notifications.__getScheduledRequests()).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({
          data: expect.objectContaining({ kind: 'rest_timer' }),
        }),
      }),
    ]);
  });
});
