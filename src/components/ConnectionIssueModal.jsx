import { RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Shown when a resume-time session check times out (see checkSessionOnResume
 * in utils/supabase.js). This used to force a logout, but a timed-out
 * connectivity check doesn't mean the session is actually invalid — it just
 * means we couldn't confirm it in time. Signing the person out was needless
 * and destructive (lost in-progress work, an extra login). Instead we tell
 * them plainly what happened and let a full page reload — which re-runs the
 * normal auth bootstrap — recover the connection.
 */
export default function ConnectionIssueModal() {
  const { connectionIssue } = useAuth();
  if (!connectionIssue) return null;

  // navigator.onLine is a real (if blunt) signal the browser exposes for
  // "is there any network path at all right now". If it's false, the cause
  // almost certainly isn't tab-inactivity/stale-connection recovery (what
  // the rest of this message describes) — it's that there's simply no
  // internet connection at all, which no amount of retrying inside the app
  // can fix. Saying so directly is far more useful than implying reloading
  // will help when it likely won't until connectivity itself is back.
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
            <RefreshCw size={22} className="text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {isOffline ? "You're offline" : 'Connection timed out'}
          </h2>
          <p className="text-sm text-slate-500">
            {isOffline
              ? "It looks like this device has no internet connection right now. Your session is still safe — reconnect, then reload the page to pick up where you left off."
              : "We couldn't reconnect after this tab was inactive for a while. Your session is still safe — just reload the page to pick up where you left off."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}
