import { useEffect, useRef } from 'react';
import { findDraftsByPrefix } from '../utils/formDraft';

/**
 * Scans for an abandoned Add/Edit draft exactly once, on mount, and hands
 * it back to the page so it can reopen the right modal.
 *
 * This exists because "Add" forms can restore themselves the normal way
 * (useFormDraft's onRestore, since the Add modal is always mounted) — but
 * an "Edit" modal only mounts once a specific record has been picked, so
 * there's nothing to hand a draft to until the page itself has figured
 * out *which* record that draft belongs to. Every page that has an Edit-
 * style modal (Employee, Attendance, Leave, Shift) was re-implementing
 * this same prefix-scan-then-lookup dance; this hook is that logic,
 * written once.
 *
 * Draft keys are expected to look like `<prefix><id>`, where id is either
 * the literal string 'add' (an Add-form draft with no target record) or a
 * record id (an Edit-form draft for that record).
 *
 * @param {object} opts
 * @param {string} opts.prefix        shared prefix for this form's draft keys (see draftKeys.js)
 * @param {boolean} opts.ready        the record list this needs is loaded; the scan waits for this
 * @param {(id: string) => any} opts.findById   look up a record by the id encoded in the key; return falsy if not found
 * @param {(data: object) => boolean} [opts.onRestoreAdd]   called for an 'add'-slot draft; return true once restored (stops the scan)
 * @param {(target: any, data: object) => boolean} [opts.onRestoreEdit]  called for a found record's draft; return true once restored (stops the scan)
 */
export function useDraftRestoreOnMount({ prefix, ready, findById, onRestoreAdd, onRestoreEdit }) {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current || !ready) return;
    hasCheckedRef.current = true;

    for (const { key, data } of findDraftsByPrefix(prefix)) {
      const idPart = key.slice(prefix.length);
      if (idPart === 'add') {
        if (onRestoreAdd?.(data)) break;
      } else {
        const target = findById(idPart);
        if (target && onRestoreEdit?.(target, data)) break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, ready]);
}
