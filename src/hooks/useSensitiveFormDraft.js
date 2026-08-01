import { useEffect, useRef } from 'react';
import { saveSensitiveDraft, saveSensitiveDraftSync, loadSensitiveDraft, clearSensitiveDraft } from '../utils/sensitiveDraft';

// Short debounce, not the 400ms used for the plain (localStorage) draft —
// this data only needs to survive a reload, and the field values are tiny,
// so there's no real cost to saving eagerly. The debounce still exists to
// avoid re-encrypting on every single keystroke.
const SAVE_DEBOUNCE_MS = 150;

/**
 * Sensitive-field counterpart to useFormDraft (see hooks/useFormDraft.js).
 * Same shape, but persists to encrypted sessionStorage instead of plain
 * localStorage — see utils/sensitiveDraft.js for why.
 *
 * Also flushes immediately (bypassing the debounce) when the tab is
 * hidden or about to unload — reloading a page fires `pagehide` /
 * `visibilitychange` BEFORE the debounce timer would otherwise fire, so
 * without this a reload that happens right after typing (well within the
 * debounce window) would race the save and lose the last keystrokes.
 *
 * @param {string} key
 * @param {object} data          plain string fields to persist (password, card number, etc.)
 * @param {object} [options]
 * @param {(data) => boolean} [options.isMeaningful]
 * @param {(draft) => void} [options.onRestore]  called once with decrypted draft, if any
 */
export function useSensitiveFormDraft(key, data, { isMeaningful, onRestore } = {}) {
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const isMeaningfulRef = useRef(isMeaningful);
  isMeaningfulRef.current = isMeaningful;

  // No "have we already checked" latch here on purpose. In dev,
  // React.StrictMode mounts every effect twice: the first run's cleanup
  // marks its own promise `cancelled` before the (async, decrypt-requiring)
  // load resolves, and — if a latch blocked the second run from starting
  // a fresh load — the restore would be silently dropped forever. Letting
  // the effect start a new load on every real invocation is cheap and
  // idempotent; the `cancelled` flag below still guarantees onRestore only
  // fires for the most recent, non-torn-down run.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadSensitiveDraft(key);
      const meaningful = isMeaningfulRef.current;
      if (!cancelled && draft && (!meaningful || meaningful(draft))) {
        onRestoreRef.current?.(draft);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const timerRef = useRef(null);
  const latestRef = useRef({ key, data, isMeaningful });
  latestRef.current = { key, data, isMeaningful };
  const serialized = JSON.stringify(data);

  useEffect(() => {
    if (isMeaningful && !isMeaningful(data)) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { saveSensitiveDraft(key, data); }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, serialized]);

  // Immediate flush right before the tab hides/reloads/closes, so a fast
  // reload can never race the debounce above.
  useEffect(() => {
    function flush() {
      const { key: k, data: d, isMeaningful: im } = latestRef.current;
      if (im && !im(d)) return;
      clearTimeout(timerRef.current);
      saveSensitiveDraftSync(k, d);
    }
    function onVisibility() {
      if (document.hidden) flush();
    }
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { clear: () => clearSensitiveDraft(key) };
}
