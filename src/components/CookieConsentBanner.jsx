import { useEffect, useState } from 'react';
import { Cookie, X } from 'lucide-react';
import { CONSENT_COOKIE, LAST_EMAIL_COOKIE, hasConsentDecision, setCookie, deleteCookie } from '../utils/cookies';
import { getCookieConsent, setCookieConsent } from '../utils/db';
import { useAuth } from '../context/AuthContext';
import LegalModal from './LegalModal';

/**
 * Bottom-of-screen cookie/terms consent banner, shown once per browser
 * until the person makes a choice (persisted for a year via a cookie —
 * intentionally a cookie, not localStorage, since that's the signal this
 * banner itself is asking permission for).
 *
 * Accepting unlocks small convenience features gated on
 * hasAcceptedCookies() (see utils/cookies.js) — e.g. LoginPage prefilling
 * the last-used email so returning users don't have to retype it.
 * Declining still lets the app work normally; it just skips those
 * convenience features and doesn't write anything beyond this one
 * "declined" record.
 *
 * For logged-in users, the choice is also mirrored to their account row
 * (accounts.cookie_consent) so that clearing browser storage doesn't
 * reset it back to "not yet chosen" — on next load, if no local cookie
 * is found but the account has a saved decision, that decision is
 * restored into a fresh cookie instead of re-showing the banner.
 */
export default function CookieConsentBanner() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [legalModal, setLegalModal] = useState(null); // 'terms' | 'privacy' | 'cookies' | null

  useEffect(() => {
    let cancelled = false;

    async function resolveConsent() {
      if (hasConsentDecision()) {
        setVisible(false);
        return;
      }
      // No local cookie — if logged in, check whether we already have a
      // saved decision on the account before showing the banner again.
      if (user?.id) {
        const saved = await getCookieConsent(user.id);
        if (cancelled) return;
        if (saved === 'accepted' || saved === 'declined') {
          setCookie(CONSENT_COOKIE, saved);
          setVisible(false);
          return;
        }
      }
      setVisible(true);
    }

    resolveConsent();
    return () => { cancelled = true; };
  }, [user?.id]);

  function accept() {
    setCookie(CONSENT_COOKIE, 'accepted');
    setVisible(false);
    if (user?.id) setCookieConsent(user.id, 'accepted');
  }

  function decline() {
    setCookie(CONSENT_COOKIE, 'declined');
    // Respect the choice retroactively — don't leave a previously-saved
    // email sitting in a cookie once the person has said no.
    deleteCookie(LAST_EMAIL_COOKIE);
    setVisible(false);
    if (user?.id) setCookieConsent(user.id, 'declined');
  }

  if (!visible) return null;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-[9998] p-3 sm:p-4"
        role="dialog"
        aria-live="polite"
        aria-label="Cookie consent"
      >
        <div
          className="mx-auto max-w-3xl rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
          style={{ background: '#ffffff', border: '1px solid rgba(15,23,42,0.08)' }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(99,102,241,0.1)' }}>
            <Cookie size={18} className="text-indigo-600" />
          </div>

          <p className="text-sm text-slate-600 leading-relaxed flex-1">
            We use essential cookies to keep you signed in securely, and (only if you accept) a small
            convenience cookie to remember your last-used email so sign-in is faster next time. By
            clicking "Accept", you agree to our{' '}
            <button onClick={() => setLegalModal('terms')} className="text-indigo-600 font-semibold hover:underline">
              Terms of Service
            </button>{' '}and{' '}
            <button onClick={() => setLegalModal('privacy')} className="text-indigo-600 font-semibold hover:underline">
              Privacy Policy
            </button>. See our{' '}
            <button onClick={() => setLegalModal('cookies')} className="text-indigo-600 font-semibold hover:underline">
              Cookie Policy
            </button>{' '}for details.
          </p>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              onClick={decline}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Decline
            </button>
            <button
              onClick={accept}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}
            >
              Accept
            </button>
            <button
              onClick={decline}
              aria-label="Dismiss"
              className="p-1.5 rounded-full text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors sm:hidden"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {legalModal && <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />}
    </>
  );
}
