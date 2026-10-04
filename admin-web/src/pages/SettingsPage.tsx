import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { SettingsSection } from '../components/SettingsSection';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { useAuth } from '../auth/AuthProvider';
import { useNotifications } from '../notifications/NotificationsProvider';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeProvider';

function SettingsToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-toggle-copy">
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <label className={`loyalty-toggle settings-toggle${checked ? ' loyalty-toggle--on' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
        <span className="loyalty-toggle-track" aria-hidden />
        <span className="loyalty-toggle-label">{checked ? 'On' : 'Off'}</span>
      </label>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const { darkMode, setDarkMode } = useTheme();
  const {
    notificationsEnabled,
    soundEnabled,
    prefsLoading,
    prefsSaving,
    updateNotificationPrefs,
  } = useNotifications();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const onNotifToggle = useCallback(
    (enabled: boolean) => {
      void updateNotificationPrefs({
        notifications_enabled: enabled,
        notification_sound_enabled: enabled ? soundEnabled : false,
      });
    },
    [soundEnabled, updateNotificationPrefs]
  );

  const onSoundToggle = useCallback(
    (enabled: boolean) => {
      void updateNotificationPrefs({ notification_sound_enabled: enabled });
    },
    [updateNotificationPrefs]
  );

  useEffect(() => {
    setPasswordError(null);
    setPasswordSuccess(null);
  }, [currentPassword, newPassword, confirmPassword]);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!user?.email) {
      setPasswordError('Missing account email.');
      return;
    }
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password do not match.');
      return;
    }

    setPasswordSaving(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) {
      setPasswordError('Current password is incorrect.');
      setPasswordSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setPasswordError(updateError.message);
      setPasswordSaving(false);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSuccess('Password updated successfully.');
    setPasswordSaving(false);
  }

  return (
    <div className="settings-page">
      <ModulePageHeader
        title="Settings"
        subtitle="Manage notifications, account security, appearance, and help."
      />

      <SettingsSection
        title="Notification settings"
        subtitle="Pop-ups and sound for new orders and activity"
        defaultOpen
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
      >
        {prefsLoading ? <p className="muted-block">Loading preferences…</p> : null}
        <SettingsToggle
          label="Receive notifications"
          description="Show pop-ups when new orders, deliveries, and other store activity arrive."
          checked={notificationsEnabled}
          disabled={prefsLoading || prefsSaving}
          onChange={onNotifToggle}
        />
        <div className="settings-divider" />
        <SettingsToggle
          label="Notification sound"
          description="Play a sound when a new notification appears in the admin panel."
          checked={soundEnabled}
          disabled={!notificationsEnabled || prefsLoading || prefsSaving}
          onChange={onSoundToggle}
        />
        {prefsSaving ? <p className="muted-block settings-saving-hint">Saving…</p> : null}
      </SettingsSection>

      <SettingsSection
        title="Account settings"
        subtitle="Change your login password"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        }
      >
        <p className="muted-block settings-account-email">
          Signed in as <strong>{user?.email ?? '—'}</strong>
        </p>
        {passwordError ? <p className="error-text module-alert">{passwordError}</p> : null}
        {passwordSuccess ? <p className="success-text module-alert">{passwordSuccess}</p> : null}
        <form className="settings-password-form" onSubmit={(e) => void onChangePassword(e)}>
          <div className="field">
            <label htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="Enter new password (min. 6 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={passwordSaving}>
            {passwordSaving ? 'Updating…' : 'Change password'}
          </button>
        </form>
      </SettingsSection>

      <SettingsSection
        title="Help"
        subtitle="Quick guide for using the admin panel"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9.5 9a2.5 2.5 0 015 1c0 2-2.5 1.8-2.5 3.5M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        }
      >
        <ul className="loyalty-help-list settings-help-list">
          <li>
            <strong>Dashboard</strong> — View today&apos;s sales, pending orders, expenses, and net income.
          </li>
          <li>
            <strong>POS</strong> — Record walk-in sales. Online orders appear on the Dashboard and in Sales.
          </li>
          <li>
            <strong>Inventory</strong> — Add products, stock levels, and loyalty-eligible items.
          </li>
          <li>
            <strong>Loyalty points</strong> — Enable the program and verify customer voucher codes.
          </li>
          <li>
            <strong>Expenses</strong> — Log water, electric, salaries, gas allowance, and other costs for net income.
          </li>
          <li>
            <strong>Staff management</strong> — Approve or manage seller accounts linked to your store.
          </li>
          <li>
            <strong>Notifications</strong> — Use the bell icon (top-right) to see order and activity alerts.
          </li>
          <li>
            <strong>Laundry dashboard</strong> — See today&apos;s net income and recent POS transactions when using Laundry mode.
          </li>
          <li>
            <strong>Switch business</strong> — Use the sidebar button to switch between Water Refilling and Laundry.
          </li>
        </ul>
      </SettingsSection>

      <SettingsSection
        title="Dark mode"
        subtitle="Toggle dark theme for the entire admin panel"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M21 14.5A8.5 8.5 0 1114.5 3a6.5 6.5 0 006.5 11.5z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        }
      >
        <SettingsToggle
          label="Dark theme"
          description="Apply a dark color scheme across all admin pages, forms, tables, and modals."
          checked={darkMode}
          onChange={setDarkMode}
        />
      </SettingsSection>
    </div>
  );
}
