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
const ONBOARDING_DEFAULT_REST_SECONDS = 90;

const profileSettingsSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  experienceLevel: experienceLevelSchema,
  unitSystem: unitSystemSchema,
  defaultRestSeconds: z.number().int().min(15).max(600),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  keepAwake: z.boolean(),
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
          restOverlayEnabled: preferences.rest_overlay_enabled === 1,
          weekStartsOn: preferences.week_starts_on,
          autoBackupEnabled: preferences.auto_backup_enabled === 1,
          autoBackupLastUpdatedAt: preferences.auto_backup_last_exported_at,
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

const normalizeOnboardingRestSeconds = (value: number) => {
  if (!Number.isFinite(value)) {
    return ONBOARDING_DEFAULT_REST_SECONDS;
  }

  return Math.min(600, Math.max(15, Math.trunc(value)));
};

export const completeOnboarding = ({
  displayName,
  unitSystem,
  weekStartsOn,
  defaultRestSeconds,
}: {
  displayName: string;
  unitSystem: 'metric' | 'imperial';
  weekStartsOn: 0 | 1;
  defaultRestSeconds: number;
}) => {
  const user = getAppUser();
  const preferences = getUserPreferences();
  if (!user || !preferences) {
    return;
  }

  const parsedDisplayName = displayName.trim() || 'Frog Athlete';
  const parsedDefaultRestSeconds = normalizeOnboardingRestSeconds(defaultRestSeconds);
  const timestamp = nowIso();

  database.execSync('BEGIN IMMEDIATE TRANSACTION');

  try {
    database.runSync(
      `
        UPDATE users
        SET display_name = ?, unit_system = ?, onboarding_completed = 1, updated_at = ?
        WHERE id = ?
      `,
      parsedDisplayName,
      unitSystem,
      timestamp,
      user.id,
    );
    database.runSync(
      `
        UPDATE user_preferences
        SET default_rest_seconds = ?, week_starts_on = ?, updated_at = ?
        WHERE id = ?
      `,
      parsedDefaultRestSeconds,
      weekStartsOn,
      timestamp,
      preferences.id,
    );
    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  writeAuditLog('user', user.id, 'onboarding_completed', {
    displayName: parsedDisplayName,
    unitSystem,
    weekStartsOn,
    defaultRestSeconds: parsedDefaultRestSeconds,
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
  restOverlayEnabled,
}: {
  defaultRestSeconds: number;
  keepAwake: boolean;
  restOverlayEnabled: boolean;
}) => {
  const preferences = getUserPreferences();
  if (!preferences) {
    return;
  }

  database.runSync(
    `
      UPDATE user_preferences
      SET default_rest_seconds = ?, keep_awake = ?, rest_overlay_enabled = ?, updated_at = ?
      WHERE id = ?
    `,
    Math.max(15, defaultRestSeconds),
    keepAwake ? 1 : 0,
    restOverlayEnabled ? 1 : 0,
    nowIso(),
    preferences.id,
  );

  writeAuditLog('user_preferences', preferences.id, 'preferences_updated', {
    defaultRestSeconds,
    keepAwake,
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
        SET default_rest_seconds = ?, keep_awake = ?, rest_overlay_enabled = ?, week_starts_on = ?, updated_at = ?
        WHERE id = ?
      `,
      parsed.defaultRestSeconds,
      parsed.keepAwake ? 1 : 0,
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
