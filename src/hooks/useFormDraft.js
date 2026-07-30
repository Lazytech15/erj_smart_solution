import { useEffect, useRef } from 'react';
import { saveDraft, loadDraft, clearDraft } from '../utils/formDraft';

const SAVE_DEBOUNCE_MS = 400;

/**
 * Wires a form's in-progress state up to localStorage-backed draft
 * persistence, so it survives an accidental page reload / tab discard.
 *
 * - Once, on mount: looks for a saved draft and — if present, not stale,
 *   and "meaningful" — calls `onOpen()` (if provided) and then hands the
 *   draft to `onRestore(draft)` so the caller can repopulate its own state.
 * - On every change to `data` thereafter: debounced-saves it, skipping
 *   writes while `isMeaningful(data)` says the form is still empty so we
 *   never persist (or restore) a blank draft.
 *
 * This hook never clears the draft on its own — call the returned `clear()`
 * once the form has actually been submitted successfully.
 *
 * `onOpen` exists specifically for "Add" modals: they're always mounted
 * (there's no record yet to key an Edit modal off of), so they start with
 * `open=false` and rely on something to flip that back to `true` if a
 * draft is restored. Passing the modal's own re-open callback as `onOpen`
 * means that step lives here, in one place, instead of being re-typed
 * (and potentially forgotten) inside every modal's own `onRestore` body —
 * that's exactly the bug that shipped in the Attendance and Leave modals.
 * Edit modals don't need it: they only mount once a target record is
 * already picked, so passing `onOpen` for those is unnecessary.
 *
 * @param {string} key                        storage key, unique per form (and per user, if relevant)
 * @param {object} data                       current form data to keep persisted
 * @param {object} [options]
 * @param {number} [options.ttlMs]            drafts older than this are ignored (default 24h, see formDraft.js)
 * @param {(data) => boolean} [options.isMeaningful]  return false to skip saving/restoring an "empty" draft
 * @param {() => void} [options.onOpen]        called once, before onRestore, if a draft is being restored — wire this to the modal's "open" setter for always-mounted Add modals
 * @param {(draft) => void} [options.onRestore]        called once with the restored draft data, if any
 * @returns {{ clear: () => void }}
 */
export function useFormDraft(key, data, { ttlMs, isMeaningful, onOpen, onRestore } = {}) {
  const hasCheckedRestoreRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const isMeaningfulRef = useRef(isMeaningful);
  isMeaningfulRef.current = isMeaningful;

  // Check for a restorable draft exactly once, on mount.
  useEffect(() => {
    if (hasCheckedRestoreRef.current) return;
    hasCheckedRestoreRef.current = true;
    const draft = loadDraft(key, ttlMs);
    if (draft && (!isMeaningfulRef.current || isMeaningfulRef.current(draft))) {
      onOpenRef.current?.();
      onRestoreRef.current?.(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Debounced save whenever `data` changes.
  const timerRef = useRef(null);
  const serialized = JSON.stringify(data);
  useEffect(() => {
    if (isMeaningful && !isMeaningful(data)) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveDraft(key, data), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, serialized]);

  return { clear: () => clearDraft(key) };
}
