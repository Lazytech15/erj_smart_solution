import { useState } from 'react';
import { Shield, Bell, Clock, Key, Globe, Save } from 'lucide-react';
import { SectionHeader, InputField, SelectField } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useSubscription } from '../context/SubscriptionContext';

const SECTION = ({ icon: Icon, title, children }) => (
  <div className="card p-5">
    <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-surface-100">
      <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
        <Icon size={15} className="text-brand-600" />
      </div>
      <p className="font-semibold text-sm text-ink-900">{title}</p>
    </div>
    <div className="space-y-4">{children}</div>
  </div>
);

const Toggle = ({ label, description, value, onChange }) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-sm font-medium text-ink-800">{label}</p>
      {description && <p className="text-xs text-ink-400 mt-0.5">{description}</p>}
    </div>
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors duration-200 shrink-0 mt-0.5 ${value ? 'bg-brand-600' : 'bg-surface-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-4' : ''}`} />
    </button>
  </div>
);

export default function SettingsPage() {
  const toast = useToast();
  const { subscription, updateSettings } = useSubscription();

  const saved = subscription?.settings || {};
  const [settings, setSettings] = useState({
    timezone: saved.timezone || 'Asia/Manila',
    dateFormat: saved.dateFormat || 'MMM d, yyyy',
    lateThreshold: saved.lateThreshold || '15',
    overtimeMin: saved.overtimeMin || '30',
    autoClockout: saved.autoClockout ?? true,
    requireReason: saved.requireReason ?? true,
    encryptPayloads: saved.encryptPayloads ?? true,
    emailNotifs: saved.emailNotifs ?? true,
    smsNotifs: saved.smsNotifs ?? false,
    biometricSync: saved.biometricSync ?? false,
    mobileClockIn: saved.mobileClockIn ?? true,
    geoFencing: saved.geoFencing ?? false,
    maxLeavePerMonth: saved.maxLeavePerMonth || '5',
  });

  const set = k => v => setSettings(p => ({ ...p, [k]: v }));

  function handleSave() {
    updateSettings(settings);
    toast('Settings saved', 'success');
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Settings & Configuration"
        description={`System configuration for ${subscription?.company?.name || 'your company'}`}
        actions={
          <button className="btn-primary btn-sm" onClick={handleSave}>
            <Save size={13} /> Save Changes
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SECTION icon={Globe} title="Company Settings">
          <div>
            <label className="label">Company Name</label>
            <input className="input" value={subscription?.company?.name || ''} readOnly />
          </div>
          <SelectField label="Timezone" value={settings.timezone} onChange={set('timezone')} options={[
            { value: 'Asia/Manila',    label: 'Asia/Manila (PHT, UTC+8)' },
            { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT, UTC+8)' },
            { value: 'Asia/Tokyo',     label: 'Asia/Tokyo (JST, UTC+9)' },
            { value: 'UTC',            label: 'UTC' },
          ]} />
          <SelectField label="Date Format" value={settings.dateFormat} onChange={set('dateFormat')} options={[
            { value: 'MMM d, yyyy',  label: 'Jun 10, 2026' },
            { value: 'MM/dd/yyyy',   label: '06/10/2026' },
            { value: 'dd/MM/yyyy',   label: '10/06/2026' },
            { value: 'yyyy-MM-dd',   label: '2026-06-10' },
          ]} />
        </SECTION>

        <SECTION icon={Clock} title="Attendance Rules">
          <InputField label="Late Threshold (minutes)" type="number" value={settings.lateThreshold} onChange={set('lateThreshold')} />
          <InputField label="Overtime Minimum (minutes)" type="number" value={settings.overtimeMin} onChange={set('overtimeMin')} />
          <InputField label="Max Leave Days per Month" type="number" value={settings.maxLeavePerMonth} onChange={set('maxLeavePerMonth')} />
          <Toggle label="Auto Clock-Out at Shift End" description="System automatically records clock-out if employee forgets"
            value={settings.autoClockout} onChange={set('autoClockout')} />
          <Toggle label="Require Reason for Manual Edits" description="Managers must provide a reason when editing records"
            value={settings.requireReason} onChange={set('requireReason')} />
        </SECTION>

        <SECTION icon={Shield} title="Security & Encryption">
          <Toggle label="Encrypt API Payloads" description="All API requests and responses are encrypted using AES-256-GCM"
            value={settings.encryptPayloads} onChange={set('encryptPayloads')} />
          <Toggle label="Biometric Device Sync" description="Sync attendance data from NFC/fingerprint hardware"
            value={settings.biometricSync} onChange={set('biometricSync')} />
          <Toggle label="Geo-Fencing" description="Restrict clock-ins to within company premises only"
            value={settings.geoFencing} onChange={set('geoFencing')} />
          <div>
            <label className="label">API Secret Key</label>
            <div className="flex gap-2">
              <input type="password" value="••••••••••••••••••••••••••••••" readOnly className="input font-mono" />
              <button className="btn-secondary btn-sm whitespace-nowrap" onClick={() => toast('Key regenerated — update your integrations!', 'warning')}>
                <Key size={12} /> Regenerate
              </button>
            </div>
          </div>
        </SECTION>

        <SECTION icon={Bell} title="Notifications">
          <Toggle label="Email Notifications" description="Send attendance summaries and alerts via email"
            value={settings.emailNotifs} onChange={set('emailNotifs')} />
          <Toggle label="SMS Notifications" description="Send critical alerts via SMS to managers"
            value={settings.smsNotifs} onChange={set('smsNotifs')} />
          <Toggle label="Mobile Clock-In" description="Allow employees to clock in using the mobile app"
            value={settings.mobileClockIn} onChange={set('mobileClockIn')} />
        </SECTION>
      </div>
    </div>
  );
}
