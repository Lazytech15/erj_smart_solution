import { useState, useRef } from 'react';
import { Shield, Bell, Clock, Key, Globe, Save, Mail, MessageSquare, Lock, ArrowUpRight, Zap, Upload, X as XIcon, Image as ImageIcon } from 'lucide-react';
import { SectionHeader, InputField, SelectField, Modal } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useSubscription, PLANS } from '../context/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';

/* ── convertToWebP: browser-side downscale/compress, mirrors the avatar/
 *  employee-photo upload flow elsewhere in the app. ── */
async function convertToWebP(file, maxSizePx = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSizePx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('WebP conversion failed')); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
      }, 'image/webp', 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

const PLAN_ORDER = ['free_trial', 'starter', 'growth', 'enterprise'];

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

const Toggle = ({ label, description, value, onChange, disabled }) => (
  <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
    <div>
      <p className="text-sm font-medium text-ink-800">{label}</p>
      {description && <p className="text-xs text-ink-400 mt-0.5">{description}</p>}
    </div>
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors duration-200 shrink-0 mt-0.5 ${
        disabled ? 'cursor-not-allowed bg-surface-200' : value ? 'bg-brand-600' : 'bg-surface-300'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value && !disabled ? 'translate-x-4' : ''}`} />
    </button>
  </div>
);

/** Inline locked row shown when a feature requires a higher plan */
const LockedRow = ({ label, description, requiredPlan, onUpgrade }) => {
  const plan = PLANS.find(p => p.id === requiredPlan);
  return (
    <div className="flex items-start justify-between gap-4 opacity-60">
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-ink-800">{label}</p>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
            style={{ backgroundColor: plan?.color || '#888' }}
          >
            {plan?.name}
          </span>
        </div>
        {description && <p className="text-xs text-ink-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={onUpgrade}
        className="flex items-center gap-1 text-[11px] font-semibold shrink-0 mt-0.5 px-2 py-1 rounded-lg border border-surface-300 text-ink-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
      >
        <Lock size={10} /> Upgrade <ArrowUpRight size={10} />
      </button>
    </div>
  );
};

export default function SettingsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { subscription, currentPlan, updateSettings } = useSubscription();

  const planId    = subscription?.planId ?? 'free_trial';
  const planIndex = PLAN_ORDER.indexOf(planId);
  const hasGrowth      = planId === 'free_trial' || planIndex >= PLAN_ORDER.indexOf('growth');
  const hasEnterprise  = planIndex >= PLAN_ORDER.indexOf('enterprise');
  const hasEmailNotifs = currentPlan?.limits?.emailNotifs === true;
  const hasSmsNotifs   = currentPlan?.limits?.sms === true;

  const saved = subscription?.settings || {};
  const [settings, setSettings] = useState({
    timezone:        saved.timezone        || 'Asia/Manila',
    dateFormat:      saved.dateFormat      || 'MMM d, yyyy',
    lateThreshold:   saved.lateThreshold   || '15',
    overtimeMin:     saved.overtimeMin     || '30',
    autoClockout:    saved.autoClockout    ?? true,
    requireReason:   saved.requireReason   ?? true,
    encryptPayloads: saved.encryptPayloads ?? true,
    emailNotifs:     saved.emailNotifs     ?? true,
    smsNotifs:       saved.smsNotifs       ?? false,
    biometricSync:   saved.biometricSync   ?? false,
    mobileClockIn:   saved.mobileClockIn   ?? true,
    geoFencing:      saved.geoFencing      ?? false,
    maxLeavePerMonth:saved.maxLeavePerMonth|| '5',
    companyLogoUrl:  saved.companyLogoUrl  || null,
  });

  const set = k => v => setSettings(p => ({ ...p, [k]: v }));

  // ── Company logo upload ───────────────────────────────────────────────
  const logoInputRef = useRef(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setLogoError('Please select an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { setLogoError('Image must be under 8 MB.'); return; }
    if (!subscription?.subscriptionId) { setLogoError('No company found for this account.'); return; }

    setLogoError('');
    setLogoUploading(true);
    try {
      const webp = await convertToWebP(file, 512);
      const path = `company-logos/${subscription.subscriptionId}_${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(path, webp, { upsert: true, contentType: 'image/webp' });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('company-logos').getPublicUrl(path);
      set('companyLogoUrl')(data.publicUrl);
      toast('Logo uploaded — click "Save Changes" to apply it.', 'info');
    } catch (err) {
      setLogoError(err.message || 'Upload failed.');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  function handleRemoveLogo() {
    set('companyLogoUrl')(null);
    setLogoError('');
  }

  // Confirmation modal state for enabling notifications
  const [notifConfirm, setNotifConfirm] = useState(null); // { type: 'email'|'sms' }

  function requestEnableNotif(type) {
    const key = type === 'email' ? 'emailNotifs' : 'smsNotifs';
    if (settings[key]) {
      set(key)(false);
    } else {
      setNotifConfirm({ type });
    }
  }

  function confirmEnableNotif() {
    const key = notifConfirm.type === 'email' ? 'emailNotifs' : 'smsNotifs';
    set(key)(true);
    setNotifConfirm(null);
    toast(
      notifConfirm.type === 'email'
        ? 'Email notifications enabled. Remember to save your settings.'
        : 'SMS notifications enabled. Carrier charges may apply.',
      'info'
    );
  }

  async function handleSave() {
    try {
      await updateSettings(settings);
      toast('Settings saved', 'success');
    } catch (err) {
      // Previously fire-and-forget: a failed/timed-out write (e.g. a stale
      // connection after the tab sat idle) surfaced only as an unhandled
      // promise rejection in the console, while the UI still claimed
      // "Settings saved" and nothing was actually persisted.
      toast(err.message || 'Could not save settings — please try again.', 'error');
    }
  }

  const goUpgrade = () => navigate('/app/subscription');

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Settings & Configuration"
        description={`System configuration for ${subscription?.company?.name || 'your company'}`}
        actions={
          <div className="flex items-center gap-2">
            {currentPlan && (
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
                style={{ backgroundColor: currentPlan.color }}
              >
                {currentPlan.name} Plan
              </span>
            )}
            <button className="btn-primary btn-sm" onClick={handleSave}>
              <Save size={13} /> Save Changes
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Company Settings ─────────────────────────────── */}
        <SECTION icon={Globe} title="Company Settings">
          <div>
            <label className="label">Company Logo</label>
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {settings.companyLogoUrl ? (
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-surface-200 bg-white flex items-center justify-center">
                    <img src={settings.companyLogoUrl} alt="Company logo" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
                      title="Remove logo"
                    >
                      <XIcon size={14} className="text-white" />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl border-2 border-dashed border-surface-300 bg-surface-50 flex items-center justify-center">
                    <ImageIcon size={18} className="text-ink-300" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-surface-300 text-xs font-semibold text-ink-600 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-all disabled:opacity-50"
                >
                  <Upload size={13} />
                  {logoUploading ? 'Uploading…' : settings.companyLogoUrl ? 'Change logo' : 'Upload logo'}
                </button>
                <p className="text-[10px] text-ink-400 mt-1">Shown in the sidebar · JPG, PNG, or WebP · max 8 MB</p>
                {logoError && <p className="text-xs text-danger-600 mt-1">{logoError}</p>}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>
          </div>
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
            { value: 'MMM d, yyyy', label: 'Jun 10, 2026' },
            { value: 'MM/dd/yyyy',  label: '06/10/2026' },
            { value: 'dd/MM/yyyy',  label: '10/06/2026' },
            { value: 'yyyy-MM-dd',  label: '2026-06-10' },
          ]} />
        </SECTION>

        {/* ── Attendance Rules ─────────────────────────────── */}
        <SECTION icon={Clock} title="Attendance Rules">
          <InputField label="Late Threshold (minutes)" type="number" value={settings.lateThreshold} onChange={set('lateThreshold')} />
          <div>
            <InputField label="Overtime Minimum (minutes)" type="number" value={settings.overtimeMin} onChange={set('overtimeMin')} />
            <p className="text-[10px] text-ink-400 mt-1">
              Minutes worked past an employee's assigned shift end before it's flagged as overtime.
            </p>
          </div>
          <InputField label="Max Leave Days per Month" type="number" value={settings.maxLeavePerMonth} onChange={set('maxLeavePerMonth')} />
          <Toggle label="Auto Clock-Out at Shift End" description="System automatically records clock-out if employee forgets"
            value={settings.autoClockout} onChange={set('autoClockout')} />
          <Toggle label="Require Reason for Manual Edits" description="Managers must provide a reason when editing records"
            value={settings.requireReason} onChange={set('requireReason')} />
        </SECTION>

        {/* ── Security & Encryption ─────────────────────────── */}
        <SECTION icon={Shield} title="Security & Encryption">
          {/* Encrypt API Payloads — Enterprise only */}
          {hasEnterprise ? (
            <Toggle
              label="Encrypt API Payloads"
              description="All API requests and responses are encrypted using AES-256-GCM"
              value={settings.encryptPayloads}
              onChange={set('encryptPayloads')}
            />
          ) : (
            <LockedRow
              label="Encrypt API Payloads"
              description="All API requests and responses are encrypted using AES-256-GCM"
              requiredPlan="enterprise"
              onUpgrade={goUpgrade}
            />
          )}

          {/* Biometric Sync — Enterprise only */}
          {hasEnterprise ? (
            <Toggle
              label="Biometric Device Sync"
              description="Sync attendance data from NFC/fingerprint hardware"
              value={settings.biometricSync}
              onChange={set('biometricSync')}
            />
          ) : (
            <LockedRow
              label="Biometric Device Sync"
              description="Sync attendance data from NFC/fingerprint hardware"
              requiredPlan="enterprise"
              onUpgrade={goUpgrade}
            />
          )}

          {/* Geo-Fencing — Growth+ */}
          {hasGrowth ? (
            <Toggle
              label="Geo-Fencing"
              description="Restrict clock-ins to within company premises only"
              value={settings.geoFencing}
              onChange={set('geoFencing')}
            />
          ) : (
            <LockedRow
              label="Geo-Fencing"
              description="Restrict clock-ins to within company premises only"
              requiredPlan="growth"
              onUpgrade={goUpgrade}
            />
          )}

          {/* API Secret Key — Enterprise only */}
          <div className={hasEnterprise ? '' : 'opacity-50'}>
            <label className="label flex items-center gap-1.5">
              API Secret Key
              {!hasEnterprise && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
                  style={{ backgroundColor: PLANS.find(p => p.id === 'enterprise')?.color }}
                >
                  Enterprise
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={hasEnterprise ? '••••••••••••••••••••••••••••••' : '——————————'}
                readOnly
                disabled={!hasEnterprise}
                className="input font-mono"
              />
              <button
                className="btn-secondary btn-sm whitespace-nowrap"
                disabled={!hasEnterprise}
                onClick={() => hasEnterprise && toast('Key regenerated — update your integrations!', 'warning')}
              >
                <Key size={12} /> Regenerate
              </button>
            </div>
            {!hasEnterprise && (
              <p className="text-xs text-ink-400 mt-1.5 flex items-center gap-1">
                <Lock size={10} />
                API access requires the Enterprise plan.{' '}
                <button onClick={goUpgrade} className="text-brand-600 hover:underline font-medium inline-flex items-center gap-0.5">
                  Upgrade <ArrowUpRight size={10} />
                </button>
              </p>
            )}
          </div>
        </SECTION>

        {/* ── Notifications ─────────────────────────────────── */}
        <SECTION icon={Bell} title="Notifications">
          {/* Email — Starter+ only */}
          {hasEmailNotifs ? (
            <Toggle
              label="Email Notifications"
              description="Send attendance summaries and alerts via email"
              value={settings.emailNotifs}
              onChange={() => requestEnableNotif('email')}
            />
          ) : (
            <LockedRow
              label="Email Notifications"
              description="Send attendance summaries and alerts via email"
              requiredPlan="starter"
              onUpgrade={goUpgrade}
            />
          )}

          {/* SMS — Growth+ */}
          {hasSmsNotifs ? (
            <Toggle
              label="SMS Notifications"
              description="Send critical alerts via SMS to managers"
              value={settings.smsNotifs}
              onChange={() => requestEnableNotif('sms')}
            />
          ) : (
            <LockedRow
              label="SMS Notifications"
              description="Send critical alerts via SMS to managers"
              requiredPlan="growth"
              onUpgrade={goUpgrade}
            />
          )}

          {currentPlan?.limits?.mobileApp ? (
            <Toggle
              label="Mobile Clock-In"
              description="Allow employees to clock in using the mobile app"
              value={settings.mobileClockIn}
              onChange={set('mobileClockIn')}
            />
          ) : (
            <LockedRow
              label="Mobile Clock-In"
              description="Allow employees to clock in using the mobile app"
              requiredPlan="starter"
              onUpgrade={goUpgrade}
            />
          )}
        </SECTION>
      </div>

      {/* ── Plan upgrade nudge (for non-enterprise) ───────── */}
      {!hasEnterprise && (
        <div className="card p-4 flex items-center justify-between gap-4 border border-dashed border-brand-200 bg-brand-50/40">
          <div>
            <p className="text-sm font-semibold text-ink-800">Unlock more settings</p>
            <p className="text-xs text-ink-400 mt-0.5">
              {hasGrowth
                ? 'Upgrade to Enterprise to unlock API access, biometric sync, and payload encryption.'
                : 'Upgrade to Growth or Enterprise to unlock geo-fencing, SMS alerts, biometric sync, and API access.'}
            </p>
          </div>
          <button onClick={goUpgrade} className="btn-primary btn-sm shrink-0">
            <Zap size={13} /> Upgrade Plan
          </button>
        </div>
      )}

      {/* ── Notification confirmation modal ───────────────── */}
      {notifConfirm && (
        <Modal
          open={!!notifConfirm}
          onClose={() => setNotifConfirm(null)}
          title={notifConfirm.type === 'email' ? 'Enable Email Notifications' : 'Enable SMS Notifications'}
          width="max-w-sm"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setNotifConfirm(null)}>Cancel</button>
              <button className="btn-primary" onClick={confirmEnableNotif}>
                {notifConfirm.type === 'email' ? <Mail size={13} /> : <MessageSquare size={13} />}
                Confirm & Enable
              </button>
            </>
          }
        >
          <div className="space-y-3">
            {notifConfirm.type === 'email' ? (
              <>
                <p className="text-sm text-ink-700">
                  Enabling email notifications will send the following to managers and admins:
                </p>
                <ul className="space-y-1.5 text-sm text-ink-600">
                  {['Daily attendance summaries', 'Late clock-in alerts', 'Leave request updates', 'Shift change notifications'].map(item => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-success-500">✓</span> {item}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-400 pt-1">Emails are sent to the account email on file. No extra charge.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-700">
                  Enabling SMS notifications will send critical alerts to registered manager phone numbers:
                </p>
                <ul className="space-y-1.5 text-sm text-ink-600">
                  {['Missed clock-in alerts', 'Overtime threshold warnings', 'Urgent leave approvals'].map(item => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-success-500">✓</span> {item}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-warning-600 bg-warning-50 rounded-lg px-3 py-2">
                  ⚠ Standard carrier SMS charges may apply depending on your plan.
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}