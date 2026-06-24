import { useState } from 'react';
import { Eye, EyeOff, Check, X, Wand2, Copy, RefreshCw } from 'lucide-react';

/**
 * PasswordStrengthField
 * A reusable password input with live requirement checkers, strength bar,
 * and a "Suggest strong password" generator.
 *
 * Props:
 *   value          string    – controlled value
 *   onChange       fn        – called with new string
 *   error          string    – error message to display
 *   label          string    – field label (default: "Password")
 *   placeholder    string
 *   autoComplete   string
 *   className      string    – extra classes on the wrapper div
 *   variant        string    – 'default' | 'signup'
 *
 * Requirements enforced (also exported as `PASSWORD_REQUIREMENTS`):
 *   minLength (8), uppercase, lowercase, number, specialChar
 */

export const PASSWORD_REQUIREMENTS = [
  { key: 'minLength',    label: 'At least 8 characters',        test: pw => pw.length >= 8 },
  { key: 'uppercase',    label: 'One uppercase letter (A–Z)',    test: pw => /[A-Z]/.test(pw) },
  { key: 'lowercase',    label: 'One lowercase letter (a–z)',    test: pw => /[a-z]/.test(pw) },
  { key: 'number',       label: 'One number (0–9)',              test: pw => /[0-9]/.test(pw) },
  { key: 'specialChar',  label: 'One special character (!@#…)',  test: pw => /[^A-Za-z0-9]/.test(pw) },
];

export function getPasswordStrength(pw) {
  if (!pw) return 0;
  return PASSWORD_REQUIREMENTS.filter(r => r.test(pw)).length; // 0–5
}

export function isPasswordStrong(pw) {
  return PASSWORD_REQUIREMENTS.every(r => r.test(pw));
}

/** Generate a guaranteed-strong random password */
function generateStrongPassword() {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '!@#$%&*?';
  const all     = upper + lower + digits + special;

  const rand = (str) => str[Math.floor(Math.random() * str.length)];

  // Guarantee at least one of each required class
  const mandatory = [rand(upper), rand(lower), rand(digits), rand(special)];

  // Fill remaining chars (total length 14)
  const rest = Array.from({ length: 10 }, () => rand(all));

  // Shuffle all together
  const combined = [...mandatory, ...rest];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join('');
}

const STRENGTH_LABELS = ['', 'Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#3b82f6', '#22c55e'];

export default function PasswordStrengthField({
  value = '',
  onChange,
  error,
  label = 'Password',
  placeholder = 'Create a strong password',
  autoComplete = 'new-password',
  className = '',
  variant = 'default',
}) {
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [copied, setCopied] = useState(false);

  const strength = getPasswordStrength(value);
  const showChecklist = touched && value.length > 0;

  // ── Style helpers ──────────────────────────────────────────────
  const inputBase =
    variant === 'signup'
      ? 'w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-900 bg-slate-50 border outline-none transition-all focus:ring-2 focus:bg-white placeholder-slate-300'
      : 'input w-full';

  const borderColor = error
    ? (variant === 'signup' ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-danger-500')
    : variant === 'signup'
    ? 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
    : '';

  const labelEl = label && (
    <div className="flex items-center justify-between mb-1.5">
      {variant === 'signup'
        ? <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">{label} <span className="text-red-400">*</span></label>
        : <label className="label mb-0">{label} <span className="text-danger-500">*</span></label>
      }
      {/* Suggest password button */}
      <button
        type="button"
        onClick={() => {
          const pw = generateStrongPassword();
          setSuggestion(pw);
          setCopied(false);
        }}
        className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
        style={{ color: '#6366f1' }}
        onMouseEnter={e => e.currentTarget.style.color = '#4f46e5'}
        onMouseLeave={e => e.currentTarget.style.color = '#6366f1'}
      >
        <Wand2 size={11} />
        Suggest password
      </button>
    </div>
  );

  // ── Suggestion pill (shown until dismissed or used) ────────────
  const suggestionBanner = suggestion && (
    <div
      className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}
    >
      {/* Suggested password text */}
      <span
        className="flex-1 font-mono text-xs select-all truncate"
        style={{ color: '#4338ca', letterSpacing: '0.04em' }}
        title={suggestion}
      >
        {suggestion}
      </span>

      {/* Regenerate */}
      <button
        type="button"
        title="Generate another"
        onClick={() => { setSuggestion(generateStrongPassword()); setCopied(false); }}
        className="w-6 h-6 flex items-center justify-center rounded-lg shrink-0 transition-colors"
        style={{ color: '#6366f1' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.12)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <RefreshCw size={11} />
      </button>

      {/* Copy */}
      <button
        type="button"
        title={copied ? 'Copied!' : 'Copy to clipboard'}
        onClick={async () => {
          try { await navigator.clipboard.writeText(suggestion); } catch { /* ignore */ }
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="w-6 h-6 flex items-center justify-center rounded-lg shrink-0 transition-colors"
        style={{ color: copied ? '#22c55e' : '#6366f1' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.12)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {copied ? <Check size={11} strokeWidth={3} /> : <Copy size={11} />}
      </button>

      {/* Use this password */}
      <button
        type="button"
        onClick={() => {
          onChange(suggestion);
          setShow(true);      // reveal so user can see what was filled
          setTouched(true);
          setSuggestion('');  // dismiss banner
        }}
        className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white transition-all"
        style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 2px 6px rgba(99,102,241,0.3)' }}
      >
        Use
      </button>
    </div>
  );

  return (
    <div className={className}>
      {labelEl}

      {/* Input */}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={e => { onChange(e.target.value); setTouched(true); setSuggestion(''); }}
          onBlur={() => setTouched(true)}
          className={`${inputBase} ${borderColor} pr-10`}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: '#94a3b8' }}
          onMouseEnter={e => e.currentTarget.style.color = '#475569'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      {/* Suggestion banner */}
      {suggestionBanner}

      {/* Hard error */}
      {error && <p className={`mt-1 text-xs ${variant === 'signup' ? 'text-red-600' : 'text-danger-600'}`}>{error}</p>}

      {/* Strength bar + label */}
      {!error && value.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full transition-all duration-300"
                style={{ background: i <= strength ? STRENGTH_COLORS[strength] : '#e2e8f0' }}
              />
            ))}
          </div>
          <p className="text-[10px] font-semibold transition-colors" style={{ color: STRENGTH_COLORS[strength] }}>
            {STRENGTH_LABELS[strength]}
          </p>
        </div>
      )}

      {/* Requirement checklist */}
      {showChecklist && (
        <ul className="mt-2 space-y-1">
          {PASSWORD_REQUIREMENTS.map(req => {
            const ok = req.test(value);
            return (
              <li key={req.key} className="flex items-center gap-1.5 text-[11px] transition-colors"
                style={{ color: ok ? '#22c55e' : '#94a3b8' }}>
                <span
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all"
                  style={{ background: ok ? '#dcfce7' : '#f1f5f9' }}
                >
                  {ok
                    ? <Check size={8} strokeWidth={3} style={{ color: '#16a34a' }} />
                    : <X size={8} strokeWidth={3} style={{ color: '#cbd5e1' }} />
                  }
                </span>
                {req.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
