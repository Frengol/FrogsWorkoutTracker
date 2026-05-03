jest.mock('@/src/shared/db/database', () => ({
  database: {
    execSync: jest.fn(),
    runSync: jest.fn(),
  },
  getAppUser: jest.fn(),
  getNotificationPreferences: jest.fn(),
  getUserPreferences: jest.fn(),
  initializeDatabase: jest.fn(),
  writeAuditLog: jest.fn(),
}));

import {
  bootstrapIdentity,
  completeOnboarding,
  getIdentitySnapshot,
  saveLocalProfileSettings,
  updatePreferences,
  updateProfile,
} from '@/src/modules/identity/service';
import {
  database,
  getAppUser,
  getNotificationPreferences,
  getUserPreferences,
  initializeDatabase,
  writeAuditLog,
} from '@/src/shared/db/database';
import { createLocalProfileSettingsInput } from '@/tests/fixtures/factories';

describe('identity service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAppUser as jest.Mock).mockReturnValue({
      id: 'user-1',
      display_name: 'Frog Athlete',
      onboarding_completed: 1,
      unit_system: 'metric',
      experience_level: 'intermediate',
    });
    (getUserPreferences as jest.Mock).mockReturnValue({
      id: 'prefs-1',
      default_rest_seconds: 90,
      keep_awake: 1,
      haptics_enabled: 1,
      show_rpe: 1,
      show_previous_values: 1,
      rest_overlay_enabled: 0,
      week_starts_on: 1,
    });
    (getNotificationPreferences as jest.Mock).mockReturnValue({
      id: 'notif-1',
      rest_timer_enabled: 1,
      pr_enabled: 1,
      reminders_enabled: 1,
      reports_enabled: 1,
      reminder_time_local: '19:00',
      reminder_days_json: '[2,4,6]',
    });
  });

  it('bootstraps the database and returns the mapped snapshot', () => {
    const snapshot = bootstrapIdentity();

    expect(initializeDatabase).toHaveBeenCalled();
    expect(snapshot.user?.id).toBe('user-1');
  });

  it('maps the current identity snapshot from local rows', () => {
    const snapshot = getIdentitySnapshot();

    expect(initializeDatabase).toHaveBeenCalledTimes(1);
    expect(snapshot.user?.displayName).toBe('Frog Athlete');
    expect(snapshot.preferences?.defaultRestSeconds).toBe(90);
    expect(snapshot.preferences?.restOverlayEnabled).toBe(false);
    expect(snapshot.notifications?.reminderDays).toEqual([2, 4, 6]);
  });

  it('maps null rows and notification fallbacks safely', () => {
    (getAppUser as jest.Mock).mockReturnValue(null);
    (getUserPreferences as jest.Mock).mockReturnValue(null);
    (getNotificationPreferences as jest.Mock).mockReturnValue({
      id: 'notif-1',
      rest_timer_enabled: 0,
      pr_enabled: 0,
      reminders_enabled: 0,
      reports_enabled: 0,
      reminder_time_local: null,
      reminder_days_json: null,
    });

    const snapshot = getIdentitySnapshot();

    expect(snapshot.user).toBeNull();
    expect(snapshot.preferences).toBeNull();
    expect(snapshot.notifications).toEqual({
      restTimerNotificationEnabled: false,
      prNotificationEnabled: false,
      remindersEnabled: false,
      reportsEnabled: false,
      reminderTimeLocal: '19:00',
      reminderDays: [],
    });
  });

  it('maps notification state when the row is missing and preserves non-null optional workout fields', () => {
    (getNotificationPreferences as jest.Mock).mockReturnValue(null);

    const snapshot = getIdentitySnapshot();

    expect(snapshot.user).toEqual(
      expect.objectContaining({
        unitSystem: 'metric',
        experienceLevel: 'intermediate',
      }),
    );
    expect(snapshot.preferences).toEqual(
      expect.objectContaining({
        weekStartsOn: 1,
      }),
    );
    expect(snapshot.notifications).toBeNull();
  });

  it('completes onboarding with a fallback display name and ignores missing user', () => {
    (getAppUser as jest.Mock).mockReturnValueOnce(null);

    completeOnboarding('Ana');
    expect(database.runSync).not.toHaveBeenCalled();

    completeOnboarding('   ');

    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE users SET display_name = ?, onboarding_completed = 1, updated_at = ? WHERE id = ?',
      'Frog Athlete',
      expect.any(String),
      'user-1',
    );
    expect(writeAuditLog).toHaveBeenCalledWith('user', 'user-1', 'onboarding_completed', {
      displayName: 'Frog Athlete',
    });
  });

  it('updates the profile and preferences with fallbacks and clamps', () => {
    updateProfile({ displayName: '  ', experienceLevel: 'advanced' });
    updatePreferences({
      defaultRestSeconds: 5,
      keepAwake: false,
      hapticsEnabled: false,
      showRpe: false,
      showPreviousValues: false,
      restOverlayEnabled: false,
    });

    expect(database.runSync).toHaveBeenNthCalledWith(
      1,
      'UPDATE users SET display_name = ?, experience_level = ?, updated_at = ? WHERE id = ?',
      'Frog Athlete',
      'advanced',
      expect.any(String),
      'user-1',
    );
    expect(database.runSync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE user_preferences'),
      15,
      0,
      0,
      0,
      0,
      0,
      expect.any(String),
      'prefs-1',
    );
  });

  it('updates the profile with an explicit name and stores enabled preference flags', () => {
    updateProfile({ displayName: 'Ana', experienceLevel: 'beginner' });
    updatePreferences({
      defaultRestSeconds: 120,
      keepAwake: true,
      hapticsEnabled: true,
      showRpe: true,
      showPreviousValues: true,
      restOverlayEnabled: true,
    });

    expect(database.runSync).toHaveBeenNthCalledWith(
      1,
      'UPDATE users SET display_name = ?, experience_level = ?, updated_at = ? WHERE id = ?',
      'Ana',
      'beginner',
      expect.any(String),
      'user-1',
    );
    expect(database.runSync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE user_preferences'),
      120,
      1,
      1,
      1,
      1,
      1,
      expect.any(String),
      'prefs-1',
    );
  });

  it('ignores profile and preference updates when identity rows are missing', () => {
    (getAppUser as jest.Mock).mockReturnValue(null);
    (getUserPreferences as jest.Mock).mockReturnValue(null);

    updateProfile({ displayName: 'Ana', experienceLevel: 'beginner' });
    updatePreferences({
      defaultRestSeconds: 60,
      keepAwake: true,
      hapticsEnabled: true,
      showRpe: true,
      showPreviousValues: true,
      restOverlayEnabled: false,
    });

    expect(database.runSync).not.toHaveBeenCalled();
  });

  it('persists validated local settings inside a transaction', () => {
    saveLocalProfileSettings(
      createLocalProfileSettingsInput({
        displayName: 'Ana Local',
        reminderDays: [1, 3, 5],
      }),
    );

    expect(database.execSync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE TRANSACTION');
    expect(database.runSync).toHaveBeenCalledTimes(3);
    expect(database.execSync).toHaveBeenLastCalledWith('COMMIT');
    expect(writeAuditLog).toHaveBeenCalledWith(
      'identity',
      'user-1',
      'local_settings_saved',
      expect.objectContaining({
        displayName: 'Ana Local',
        reminderDays: [1, 3, 5],
      }),
    );
  });

  it('throws when local settings are saved without initialized identity rows', () => {
    (getNotificationPreferences as jest.Mock).mockReturnValue(null);

    expect(() => saveLocalProfileSettings(createLocalProfileSettingsInput())).toThrow(
      'Identity not initialized',
    );
  });

  it('throws when users or preferences are missing before saving local settings', () => {
    (getAppUser as jest.Mock).mockReturnValue(null);
    expect(() => saveLocalProfileSettings(createLocalProfileSettingsInput())).toThrow('Identity not initialized');

    (getAppUser as jest.Mock).mockReturnValue({
      id: 'user-1',
      display_name: 'Frog Athlete',
      onboarding_completed: 1,
      unit_system: 'metric',
      experience_level: 'intermediate',
    });
    (getUserPreferences as jest.Mock).mockReturnValue(null);
    expect(() => saveLocalProfileSettings(createLocalProfileSettingsInput())).toThrow('Identity not initialized');
  });

  it('persists disabled notification flags and blank reminder times as null', () => {
    saveLocalProfileSettings(
      createLocalProfileSettingsInput({
        keepAwake: false,
        hapticsEnabled: false,
        showRpe: false,
        showPreviousValues: false,
        restTimerNotificationEnabled: false,
        prNotificationEnabled: false,
        remindersEnabled: false,
        reportsEnabled: false,
        reminderTimeLocal: '',
        reminderDays: [],
      }),
    );

    expect(database.runSync).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE notification_preferences'),
      0,
      0,
      0,
      0,
      null,
      JSON.stringify([]),
      expect.any(String),
      'notif-1',
    );
  });

  it('rolls back the transaction when saving local settings fails', () => {
    (database.runSync as jest.Mock)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('db failed');
      });

    expect(() => saveLocalProfileSettings(createLocalProfileSettingsInput())).toThrow('db failed');
    expect(database.execSync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE TRANSACTION');
    expect(database.execSync).toHaveBeenNthCalledWith(2, 'ROLLBACK');
  });
});
