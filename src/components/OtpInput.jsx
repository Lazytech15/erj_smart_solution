import { useRef, useEffect } from 'react';

/**
 * Six-box (configurable) one-time-code input.
 *
 * - Each digit lives in its own box, typing auto-advances to the next box.
 * - Backspace on an empty box moves focus back and clears the previous box.
 * - Arrow keys move focus left/right without altering the value.
 * - Pasting a full code (from anywhere — clipboard, password manager,
 *   autofill suggestion) into ANY box fills every box at once, strips
 *   non-digits, and focuses the first empty box (or the last one if the
 *   paste completely fills the code).
 *
 * `value`/`onChange` behave like a normal controlled input — `value` is a
 * plain string of digits (e.g. "48213") and `onChange` receives the same.
 */
export default function OtpInput({
  length = 6,
  value = '',
  onChange,
  onComplete,
  error = false,
  disabled = false,
  autoFocus = false,
}) {
  const inputsRef = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus) inputsRef.current[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDigitAt(index, char) {
    const next = digits.slice();
    next[index] = char;
    const joined = next.join('').slice(0, length);
    onChange?.(joined);
    if (joined.length === length) onComplete?.(joined);
    return joined;
  }

  function handleChange(index, e) {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      setDigitAt(index, '');
      return;
    }
    if (raw.length > 1) {
      // Fast typing / autofill hitting a single box with multiple chars —
      // treat it the same as a paste.
      distribute(raw, index);
      return;
    }
    setDigitAt(index, raw);
    if (index < length - 1) inputsRef.current[index + 1]?.focus();
  }

  function distribute(rawDigits, startIndex = 0) {
    const clean = rawDigits.replace(/\D/g, '').slice(0, length - startIndex);
    if (!clean) return;
    const next = digits.slice();
    for (let i = 0; i < clean.length; i++) next[startIndex + i] = clean[i];
    const joined = next.join('').slice(0, length);
    onChange?.(joined);
    if (joined.length === length) onComplete?.(joined);
    const nextEmpty = next.findIndex(d => !d);
    const focusIndex = nextEmpty === -1 ? length - 1 : Math.min(nextEmpty, length - 1);
    requestAnimationFrame(() => inputsRef.current[focusIndex]?.focus());
  }

  function handlePaste(index, e) {
    const pasted = e.clipboardData?.getData('text') ?? '';
    if (!/\d/.test(pasted)) return;
    e.preventDefault();
    distribute(pasted, 0); // a pasted code always fills from the start
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigitAt(index, '');
      } else if (index > 0) {
        setDigitAt(index - 1, '');
        inputsRef.current[index - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => (inputsRef.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length /* allow autofill/paste to land on any single box */}
          value={d}
          disabled={disabled}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={e => handlePaste(i, e)}
          onFocus={e => e.target.select()}
          className="w-10 h-12 sm:w-11 sm:h-13 text-center text-lg font-bold rounded-lg outline-none transition-all bg-white"
          style={{
            border: `1.5px solid ${error ? '#fca5a5' : d ? '#a5b4fc' : '#e2e8f0'}`,
            color: '#1e293b',
            fontFamily: "'Open Sans', system-ui, sans-serif",
          }}
          onFocusCapture={e => {
            e.target.style.borderColor = '#6366f1';
            e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)';
          }}
          onBlurCapture={e => {
            e.target.style.borderColor = error ? '#fca5a5' : d ? '#a5b4fc' : '#e2e8f0';
            e.target.style.boxShadow = 'none';
          }}
        />
      ))}
    </div>
  );
}
