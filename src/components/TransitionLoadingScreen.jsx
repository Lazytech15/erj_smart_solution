import React, { useEffect, useLayoutEffect, useRef } from "react";

const keyframes = `
  @keyframes tls-fadein {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes tls-dotPulse {
    0%, 100% { opacity: 0.3; transform: scale(0.9); }
    50%       { opacity: 1;   transform: scale(1.3); }
  }
`;

const styles = {
  root: {
    position: "fixed",
    inset: 0,
    background: "#F3F4F4",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    animation: "tls-fadein 0.18s ease",
  },
  inner: {
    width: 560,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  labelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 14,
  },
  label: {
    fontSize: 15,
    color: "#7B8490",
    letterSpacing: "0.3px",
  },
  pct: {
    fontSize: 15,
    fontWeight: 600,
    color: "#2563EB",
    fontVariantNumeric: "tabular-nums",
  },
  barTrack: {
    width: "100%",
    height: 6,
    background: "#E2E4E7",
    borderRadius: 99,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    width: "0%",
    background: "linear-gradient(90deg, #1D4ED8, #2563EB, #3B82F6)",
    borderRadius: 99,
  },
  dots: {
    display: "flex",
    gap: 9,
    marginTop: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#2563EB",
    animation: "tls-dotPulse 1.2s ease-in-out infinite",
  },
};

/**
 * Stage definitions: [minProgress, maxProgress, label]
 * The bar animates freely through stages until it hits WAIT_AT.
 * Once `promise` resolves it races to 100% and fires onComplete.
 */
const STAGES = [
  [0,  30, "Signing you in…"],
  [30, 60, "Loading your workspace…"],
  [60, 85, "Almost there…"],
  [85, 100, "Ready!"],
];

/**
 * The bar will animate freely up to this point, then pause and wait
 * for the `promise` prop to resolve before continuing to 100%.
 */
const WAIT_AT = 70;

const getStageLabel = (p) =>
  STAGES.find(([min, max]) => p >= min && p < max)?.[2] ?? "Ready!";

/**
 * TransitionLoadingScreen
 *
 * Props:
 *   label      – initial status text (overridden by stage labels as progress advances)
 *   promise    – optional Promise to wait for before the bar completes.
 *                The bar animates freely to WAIT_AT%, then pauses until the
 *                promise resolves, then races to 100% and calls onComplete.
 *                Without a promise the bar runs straight through to 100%.
 *   onComplete – called after the bar reaches 100% and a short pause elapses.
 */
export default function TransitionLoadingScreen({ label = "Loading…", promise, onComplete }) {
  const fillRef     = useRef(null);
  const pctRef      = useRef(null);
  const labelRef    = useRef(null);
  const rafRef      = useRef(null);
  const timerRef    = useRef(null);
  const doneRef     = useRef(false);
  const progressRef = useRef(0);
  // True once the promise has resolved (or if no promise was given)
  const readyRef    = useRef(!promise);

  // useLayoutEffect keeps these refs current before any RAF tick reads them
  const onCompleteRef = useRef(onComplete);
  useLayoutEffect(() => { onCompleteRef.current = onComplete; });

  const promiseRef = useRef(promise);
  useLayoutEffect(() => { promiseRef.current = promise; });

  useEffect(() => {
    // Reset — handles React StrictMode double-invoke
    doneRef.current   = false;
    progressRef.current = 0;
    readyRef.current  = !promiseRef.current;

    // Watch the promise and flip readyRef when it settles
    if (promiseRef.current) {
      promiseRef.current
        .then(() => { readyRef.current = true; })
        .catch(() => { readyRef.current = true; }); // still proceed on error
    }

    const tick = () => {
      if (doneRef.current) return;

      const p = progressRef.current;

      // Determine speed:
      // - Before WAIT_AT: animate freely (slowing as we approach the hold point)
      // - At/past WAIT_AT and waiting: creep very slowly (shows progress, not stuck)
      // - Once ready: race to 100%
      let speed;
      if (readyRef.current) {
        speed = p < 95 ? 1.2 : 0.5; // fast finish once data is ready
      } else if (p >= WAIT_AT) {
        speed = 0.04; // barely moving — visually "waiting" without freezing
      } else {
        speed = p < 40 ? 0.7 : p < 60 ? 0.45 : 0.25;
      }

      progressRef.current = Math.min(100, p + speed);
      const rounded = Math.floor(progressRef.current);

      if (fillRef.current)  fillRef.current.style.width  = progressRef.current.toFixed(2) + "%";
      if (pctRef.current)   pctRef.current.textContent   = rounded + "%";
      if (labelRef.current) labelRef.current.textContent = getStageLabel(rounded);

      if (progressRef.current >= 100) {
        doneRef.current = true;
        if (fillRef.current)  fillRef.current.style.width  = "100%";
        if (pctRef.current)   pctRef.current.textContent   = "100%";
        if (labelRef.current) labelRef.current.textContent = "Done!";
        timerRef.current = setTimeout(() => {
          onCompleteRef.current?.();
        }, 420);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timerRef.current);
      doneRef.current = true;
    };
  }, []);

  return (
    <>
      <style>{keyframes}</style>
      <div style={styles.root}>
        <div style={styles.inner}>
          <div style={styles.labelRow}>
            <span ref={labelRef} style={styles.label}>{label}</span>
            <span ref={pctRef}   style={styles.pct}>0%</span>
          </div>
          <div style={styles.barTrack}>
            <div ref={fillRef} style={styles.barFill} />
          </div>
          <div style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ ...styles.dot, animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}