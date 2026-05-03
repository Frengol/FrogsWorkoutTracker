import { z } from 'zod';

import {
  database,
  getAppUser,
  getNotificationPreferences,
  getUserPreferences,
  initializeDatabase,
  writeAuditLog,
} from '@/src/shared/db/database';
import { nowIso } from '@/src/shared/utils/date';

const experienceLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
const unitSystemSchema = z.enum(['metric', 'imperial']);
const reminderTimeSchema = z.string().trim().regex(/^\d{2}:\d{2}$/).or(z.literal(''));

const profileSettingsSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  experienceLevel: experienceLevelSchema,
  unitSystem: unitSystemSchema,
  defaultRestSeconds: z.number().int().min(15).max(600),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  keepAwake: z.boolean(),
  hapticsEnabled: z.boolean(),
  showRpe: z.boolean(),
  showPreviousValues: z.boolean(),
  restOverlayEnabled: z.boolean(),
  restTimerNotificationEnabled: z.boolean(),
  prNotificationEnabled: z.boolean(),
  remindersEnabled: z.boolean(),
  reportsEnabled: z.boolean(),
  reminderTimeLocal: reminderTimeSchema,
  reminderDays: z.array(z.number().int().min(1).max(7)).max(7),
});

export const bootstrapIdentity = () => {
  initializeDatabase();
  return getIdentitySnapshot();
};

export const getIdentitySnapshot = () => {
  initializeDatabase();

  const user = getAppUser();
  const preferences = getUserPreferences();
  const notifications = getNotificationPreferences();

  return {
    user: user
      ? {
          id: user.id,
          displayName: user.display_name,
          onboardingCompleted: user.onboarding_completed === 1,
          unitSystem: user.unit_system as 'metric' | 'imperial',
          experienceLevel: user.experience_level as 'beginner' | 'intermediate' | 'advanced',
        }
      : null,
    preferences: preferences
      ? {
          defaultRestSeconds: preferences.default_rest_seconds,
          keepAwake: preferences.keep_awake === 1,
          hapticsEnabled: preferences.haptics_enabled === 1,
          showRpe: preferences.show_rpe === 1,
          showPreviousValues: preferences.show_previous_values === 1,
          restOverlayEnabled: preferences.rest_overlay_enabled === 1,
          weekStartsOn: preferences.week_starts_on,
        }
      : null,
    notifications: notifications
      ? {
          restTimerNotificationEnabled: notifications.rest_timer_enabled === 1,
          prNotificationEnabled: notifications.pr_enabled === 1,
          remindersEnabled: notifications.reminders_enabled === 1,
          reportsEnabled: notifications.reports_enabled === 1,
          reminderTimeLocal: notifications.reminder_time_local ?? '19:00',
          reminderDays: notifications.reminder_days_json
            ? ((JSON.parse(notifications.reminder_days_json) as number[]) ?? [])
            : [],
        }
      : null,
  };
};

export const completeOnboarding = (displayName: string) => {
  const user = getAppUser();
  if (!user) {
    return;
  }

  database.runSync(
    'UPDATE users SET display_name = ?, onboarding_completed = 1, updated_at = ? WHERE id = ?',
    displayName.trim() || 'Frog Athlete',
    nowIso(),
    user.id,
  );
  writeAuditLog('user', user.id, 'onboarding_completed', {
    displayName: displayName.trim() || 'Frog Athlete',
  });
};

export const updateProfile = ({
  displayName,
  experienceLevel,
}: {
  displayName: string;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
}) => {
  const user = getAppUser();
  if (!user) {
    return;
  }

  database.runSync(
    'UPDATE users SET display_name = ?, experience_level = ?, updated_at = ? WHERE id = ?',
    displayName.trim() || user.display_name,
    experienceLevel,
    nowIso(),
    user.id,
  );

  writeAuditLog('user', user.id, 'profile_updated', {
    displayName: displayName.trim() || user.display_name,
    experienceLevel,
  });
};

export const updatePreferences = ({
  defaultRestSeconds,
  keepAwake,
  hapticsEnabled,
  showRpe,
  showPreviousValues,
  restOverlayEnabled,
}: {
  defaultRestSeconds: number;
  keepAwake: boolean;
  hapticsEnabled: boolean;
  showRpe: boolean;
  showPreviousValues: boolean;
  restOverlayEnabled: boolean;
}) => {
  const preferences = getUserPreferences();
  if (!preferences) {
    return;
  }

  database.runSync(
    `
      UPDATE user_preferences
      SET default_rest_seconds = ?, keep_awake = ?, haptics_enabled = ?, show_rpe = ?, show_previous_values = ?, rest_overlay_enabled = ?, updated_at = ?
      WHERE id = ?
    `,
    Math.max(15, defaultRestSeconds),
    keepAwake ? 1 : 0,
    hapticsEnabled ? 1 : 0,
    showRpe ? 1 : 0,
    showPreviousValues ? 1 : 0,
    restOverlayEnabled ? 1 : 0,
    nowIso(),
    preferences.id,
  );

  writeAuditLog('user_preferences', preferences.id, 'preferences_updated', {
    defaultRestSeconds,
    keepAwake,
    hapticsEnabled,
    showRpe,
    showPreviousValues,
    restOverlayEnabled,
  });
};

export const saveLocalProfileSettings = (input: z.input<typeof profileSettingsSchema>) => {
  const parsed = profileSettingsSchema.parse(input);
  const user = getAppUser();
  const preferences = getUserPreferences();
  const notifications = getNotificationPreferences();

  if (!user || !preferences || !notifications) {
    throw new Error('Identity not initialized');
  }

  const timestamp = nowIso();

  database.execSync('BEGIN IMMEDIATE TRANSACTION');

  try {
    database.runSync(
      `
        UPDATE users
        SET display_name = ?, experience_level = ?, unit_system = ?, updated_at = ?
        WHERE id = ?
      `,
      parsed.displayName,
      parsed.experienceLevel,
      parsed.unitSystem,
      timestamp,
      user.id,
    );

    database.runSync(
      `
        UPDATE user_preferences
        SET default_rest_seconds = ?, keep_awake = ?, haptics_enabled = ?, show_rpe = ?, show_previous_values = ?, rest_overlay_enabled = ?, week_starts_on = ?, updated_at = ?
        WHERE id = ?
      `,
      parsed.defaultRestSeconds,
      parsed.keepAwake ? 1 : 0,
      parsed.hapticsEnabled ? 1 : 0,
      parsed.showRpe ? 1 : 0,
      parsed.showPreviousValues ? 1 : 0,
      parsed.restOverlayEnabled ? 1 : 0,
      parsed.weekStartsOn,
      timestamp,
      preferences.id,
    );

    database.runSync(
      `
        UPDATE notification_preferences
        SET rest_timer_enabled = ?, pr_enabled = ?, reminders_enabled = ?, reports_enabled = ?, reminder_time_local = ?, reminder_days_json = ?, updated_at = ?
        WHERE id = ?
      `,
      parsed.restTimerNotificationEnabled ? 1 : 0,
      parsed.prNotificationEnabled ? 1 : 0,
      parsed.remindersEnabled ? 1 : 0,
      parsed.reportsEnabled ? 1 : 0,
      parsed.reminderTimeLocal || null,
      JSON.stringify(parsed.reminderDays),
      timestamp,
      notifications.id,
    );

    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  writeAuditLog('identity', user.id, 'local_settings_saved', parsed);
};
