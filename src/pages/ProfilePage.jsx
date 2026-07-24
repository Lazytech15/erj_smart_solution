import { useState, useRef, useEffect, useCallback } from 'react';
import { User, Save, KeyRound, Upload, X as XIcon, ShieldCheck, ShieldOff, Copy, Check, Loader2 } from 'lucide-react';
import { SectionHeader, InputField, Avatar, Spinner, Modal } from '../components/ui';
import PasswordStrengthField, { isPasswordStrong } from '../components/PasswordStrengthField';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { putAccount } from '../utils/db';
import { supabase } from '../utils/supabase';

const FALLBACK_AVATAR_COLOR = '#4f46e5';

/* ── convertToWebP: browser-side downscale/compress, mirrors the employee
 *  photo upload flow elsewhere in the app so avatars follow the same
 *  storage conventions (webp, capped dimensions). ── */
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
      }, 'image/webp', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

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

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();

  // ── Profile details / avatar ──────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [name, setName] = useState(user?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarError, setAvatarError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const dirty = name.trim() !== (user?.name || '') || avatarFile !== null || avatarUrl !== (user?.avatarUrl || null);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setAvatarError('Please select an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { setAvatarError('Image must be under 8 MB.'); return; }
    setAvatarError('');
    try {
      const webp = await convertToWebP(file, 512);
      setAvatarFile(webp);
      setAvatarUrl(URL.createObjectURL(webp));
    } catch {
      setAvatarError('Could not process image. Try another file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleRemoveAvatar() {
    setAvatarFile(null);
    setAvatarUrl(null);
    setAvatarError('');
  }

  async function handleSaveProfile() {
    if (!name.trim()) { toast('Name cannot be empty', 'error'); return; }
    setSavingProfile(true);
    try {
      let finalAvatarUrl = avatarUrl;

      // Upload the new avatar to Supabase Storage if one was picked.
      if (avatarFile) {
        const path = `avatars/${user.id}_${Date.now()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true, contentType: 'image/webp' });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        finalAvatarUrl = data.publicUrl;
      }

      await putAccount({
        id: user.id,
        email: user.email,
        role: user.role,
        name: name.trim(),
        employeeId: user.employeeId,
        subscriptionId: user.subscriptionId,
        avatarUrl: finalAvatarUrl || null,
      });
      await refreshProfile();
      setAvatarFile(null);
      setAvatarUrl(finalAvatarUrl || null);
      toast('Profile updated', 'success');
    } catch (err) {
      toast(err.message || 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Change password (same policy as account creation) ────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  async function handleChangePassword() {
    setPasswordError('');
    if (!currentPassword) { setPasswordError('Enter your current password.'); return; }
    if (!isPasswordStrong(newPassword)) { setPasswordError('Password does not meet all requirements below.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    if (newPassword === currentPassword) { setPasswordError('New password must be different from your current password.'); return; }

    setSavingPassword(true);
    try {
      // Re-authenticate with the current password before rotating it —
      // Supabase's updateUser() will happily change the password for an
      // already-authenticated session without this, so we verify identity
      // explicitly first.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) throw new Error('Current password is incorrect.');

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast('Password changed', 'success');
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password.');
    } finally {
      setSavingPassword(false);
    }
  }

  // ── Two-factor authentication (Supabase Auth native TOTP MFA) ────────
  const [factors, setFactors] = useState(null);        // null = loading
  const [mfaBusy, setMfaBusy] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollData, setEnrollData] = useState(null);   // { factorId, qrCode, secret }
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  const loadFactors = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      setFactors((data?.totp || []).filter(f => f.status === 'verified'));
    } catch {
      setFactors([]);
    }
  }, []);

  useEffect(() => { loadFactors(); }, [loadFactors]);

  const twoFactorEnabled = !!factors?.length;

  async function handleStartEnroll() {
    setEnrollError('');
    setEnrollCode('');
    setMfaBusy(true);
    try {
      // A previous attempt that failed verification (or was abandoned via a
      // page refresh instead of "Cancel") can leave an *unverified* TOTP
      // factor behind. Supabase rejects a new enroll() with a 422 ("factor
      // with the friendly name already exists") until that's cleared, so
      // sweep it first — verified factors are left untouched.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const stale = (existing?.totp || []).filter(f => f.status !== 'verified');
      for (const f of stale) {
        await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `authenticator-${Date.now()}`,
      });
      if (error) throw error;
      setEnrollData({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setEnrollOpen(true);
    } catch (err) {
      toast(err.message || 'Could not start 2FA setup.', 'error');
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleConfirmEnroll() {
    if (!/^\d{6}$/.test(enrollCode)) { setEnrollError('Enter the 6-digit code from your authenticator app.'); return; }
    setMfaBusy(true);
    setEnrollError('');
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollData.factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollData.factorId,
        challengeId: challenge.id,
        code: enrollCode,
      });
      if (verifyError) {
        throw new Error(
          "That code didn't verify. Make sure your device's clock is correct and try the newest code from your app."
        );
      }

      await putAccount({
        id: user.id, email: user.email, role: user.role, name: user.name,
        employeeId: user.employeeId, subscriptionId: user.subscriptionId,
        twoFactorEnabled: true,
      });
      await refreshProfile();
      await loadFactors();

      setEnrollOpen(false);
      setEnrollData(null);
      toast('Two-factor authentication enabled', 'success');
    } catch (err) {
      setEnrollError(err.message || 'Invalid code. Please try again.');
    } finally {
      setMfaBusy(false);
    }
  }

  function handleCancelEnroll() {
    // Best-effort cleanup of the unverified factor so it doesn't linger.
    if (enrollData?.factorId) {
      supabase.auth.mfa.unenroll({ factorId: enrollData.factorId }).catch(() => {});
    }
    setEnrollOpen(false);
    setEnrollData(null);
    setEnrollCode('');
    setEnrollError('');
  }

  async function handleDisable2FA() {
    setMfaBusy(true);
    try {
      for (const f of factors) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
        if (error) throw error;
      }
      await putAccount({
        id: user.id, email: user.email, role: user.role, name: user.name,
        employeeId: user.employeeId, subscriptionId: user.subscriptionId,
        twoFactorEnabled: false,
      });
      await refreshProfile();
      await loadFactors();
      setDisableOpen(false);
      toast('Two-factor authentication turned off', 'success');
    } catch (err) {
      toast(err.message || 'Could not disable 2FA.', 'error');
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="My Profile"
        description="Manage how your account looks and how you sign in."
      />

      <SECTION icon={User} title="Profile details">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {avatarUrl ? (
              <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-surface-200 bg-surface-50">
                <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity rounded-full"
                  title="Remove photo"
                >
                  <XIcon size={14} className="text-white" />
                </button>
              </div>
            ) : (
              <Avatar name={name || user?.name} color={FALLBACK_AVATAR_COLOR} size="xl" />
            )}
          </div>
          <div className="flex-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-surface-300 text-xs font-semibold text-ink-600 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
            >
              <Upload size={13} />
              {avatarUrl ? 'Change photo' : 'Upload photo'}
            </button>
            <p className="text-[10px] text-ink-400 mt-1">JPG, PNG, or WebP · max 8 MB</p>
            {avatarError && <p className="text-xs text-danger-600 mt-1">{avatarError}</p>}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <InputField label="Display name" value={name} onChange={setName} placeholder="Your name" />
        <InputField label="Email" value={user?.email || ''} onChange={() => {}} disabled />
        <InputField label="Role" value={user?.role || ''} onChange={() => {}} disabled />

        <div className="flex justify-end pt-1">
          <button
            onClick={handleSaveProfile}
            disabled={!dirty || savingProfile}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
          >
            {savingProfile ? <Spinner size={14} /> : <Save size={14} />}
            Save changes
          </button>
        </div>
      </SECTION>

      <SECTION icon={KeyRound} title="Change password">
        {passwordError && (
          <p className="text-xs text-red-500 -mt-1">{passwordError}</p>
        )}
        <InputField label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} placeholder="Enter your current password" />
        <PasswordStrengthField
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          placeholder="Create a strong password"
        />
        <InputField label="Confirm new password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter new password" />
        <div className="flex justify-end pt-1">
          <button
            onClick={handleChangePassword}
            disabled={!currentPassword || !newPassword || !confirmPassword || savingPassword}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
          >
            {savingPassword ? <Spinner size={14} /> : <KeyRound size={14} />}
            Update password
          </button>
        </div>
      </SECTION>

      <SECTION icon={ShieldCheck} title="Two-factor authentication">
        {factors === null ? (
          <div className="flex items-center gap-2 text-sm text-ink-400"><Spinner size={14} /> Checking status…</div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink-800">
                {twoFactorEnabled ? 'Extra protection is on' : 'Add an extra layer of protection'}
              </p>
              <p className="text-xs text-ink-400 mt-0.5">
                {twoFactorEnabled
                  ? 'A 6-digit code from your authenticator app is required at sign-in, in addition to your password.'
                  : 'Require a code from an authenticator app (Google Authenticator, Authy, 1Password, etc.) in addition to your password when signing in.'}
              </p>
            </div>
            {twoFactorEnabled ? (
              <button
                onClick={() => setDisableOpen(true)}
                disabled={mfaBusy}
                className="btn-secondary flex items-center gap-2 px-3 py-2 text-xs shrink-0 disabled:opacity-50"
              >
                <ShieldOff size={13} /> Turn off
              </button>
            ) : (
              <button
                onClick={handleStartEnroll}
                disabled={mfaBusy}
                className="btn-primary flex items-center gap-2 px-3 py-2 text-xs shrink-0 disabled:opacity-50"
              >
                {mfaBusy ? <Spinner size={13} /> : <ShieldCheck size={13} />} Turn on
              </button>
            )}
          </div>
        )}
      </SECTION>

      {/* ── Enroll modal: scan QR + confirm code ── */}
      <Modal
        open={enrollOpen}
        onClose={handleCancelEnroll}
        title="Set up two-factor authentication"
        footer={
          <>
            <button className="btn-secondary" onClick={handleCancelEnroll} disabled={mfaBusy}>Cancel</button>
            <button className="btn-primary flex items-center gap-2" onClick={handleConfirmEnroll} disabled={mfaBusy}>
              {mfaBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Verify & enable
            </button>
          </>
        }
      >
        {enrollData && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              Scan this QR code with your authenticator app, then enter the 6-digit code it generates.
            </p>
            <div className="flex justify-center">
              <div className="p-3 bg-white border border-surface-200 rounded-xl">
                <img src={enrollData.qrCode} alt="2FA QR code" className="w-40 h-40" />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1">Can't scan? Enter this key manually</p>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-50 border border-surface-200">
                <span className="flex-1 font-mono text-xs text-ink-700 truncate select-all">{enrollData.secret}</span>
                <button
                  type="button"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(enrollData.secret); } catch { /* ignore */ }
                    setCopiedSecret(true);
                    setTimeout(() => setCopiedSecret(false), 2000);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50 shrink-0"
                >
                  {copiedSecret ? <Check size={12} strokeWidth={3} /> : <Copy size={12} />}
                </button>
              </div>
            </div>
            <InputField
              label="6-digit code"
              value={enrollCode}
              onChange={v => setEnrollCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              error={enrollError}
            />
          </div>
        )}
      </Modal>

      {/* ── Disable confirmation modal ── */}
      <Modal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Turn off two-factor authentication?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDisableOpen(false)} disabled={mfaBusy}>Cancel</button>
            <button className="btn-danger flex items-center gap-2" onClick={handleDisable2FA} disabled={mfaBusy}>
              {mfaBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
              Turn off
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          Your account will only require your password to sign in. You can re-enable two-factor authentication at any time.
        </p>
      </Modal>
    </div>
  );
}
