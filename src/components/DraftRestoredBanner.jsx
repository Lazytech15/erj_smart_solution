import { RotateCcw } from 'lucide-react';

/**
 * "Restored unsaved details from before the page reloaded" banner, with a
 * Discard action — used inside every modal that persists a form draft
 * (Add/Edit Employee, Attendance, Leave, Shift, Department).
 *
 * @param {{ message?: string, onDiscard: () => void, className?: string }} props
 */
export default function DraftRestoredBanner({ message = 'Restored unsaved details from before the page reloaded.', onDiscard, className = '' }) {
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg bg-brand-50 border border-brand-100 text-xs text-brand-700 ${className}`}>
      <RotateCcw size={13} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onDiscard} className="font-semibold underline shrink-0 hover:text-brand-800">
        Discard
      </button>
    </div>
  );
}
