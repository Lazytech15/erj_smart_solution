import React, { useEffect, useRef } from "react";

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
    // NO CSS transition — RAF writes width directly every frame.
    // A CSS transition fights RAF and causes stuttering / snap-back.
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

export default function TransitionLoadingScreen({ label = "Loading…", onComplete }) {
  const fillRef       = useRef(null);
  const pctRef        = useRef(null);
  const labelRef      = useRef(null);
  const rafRef        = useRef(null);
  const doneRef       = useRef(false);
  const progressRef   = useRef(0);
  // Store onComplete in a ref so the effect never needs it as a dependency.
  // An inline arrow passed from the parent is a new reference every render,
  // which would restart the effect (and reset progress) on every re-render.
  const onCompleteRef = useRef(onComplete);

  const stages = [
    [0,  30, label],
    [30, 65, "Setting up your workspace…"],
    [65, 90, "Almost there…"],
    [90, 100, "Ready!"],
  ];

  const getStageLabel = (p) =>
    stages.find(([min, max]) => p >= min && p < max)?.[2] ?? "Ready!";

  useEffect(() => {
    // Keep the ref current if the parent swaps the callback (rare but safe)
    onCompleteRef.current = onComplete;
  });

  // Empty dep array → runs exactly once on mount, never restarts
  useEffect(() => {
    // Reset in case React StrictMode unmounted + remounted this component
    doneRef.current = false;
    progressRef.current = 0;

    const tick = () => {
      if (doneRef.current) return;

      const p = progressRef.current;
      const speed = p < 50 ? 0.7 : p < 80 ? 0.45 : p < 95 ? 0.2 : 0.08;
      progressRef.current = Math.min(100, p + speed);

      const rounded = Math.floor(progressRef.current);

      if (fillRef.current)  fillRef.current.style.width  = progressRef.current.toFixed(2) + "%";
      if (pctRef.current)   pctRef.current.textContent   = rounded + "%";
      if (labelRef.current) labelRef.current.textContent = getStageLabel(rounded);

      if (progressRef.current >= 100) {
        doneRef.current = true;
        if (fillRef.current) fillRef.current.style.width = "100%";
        if (pctRef.current)  pctRef.current.textContent  = "100%";
        setTimeout(() => { if (onCompleteRef.current) onCompleteRef.current(); }, 420);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      doneRef.current = true;
    };
  }, []); // <-- intentionally empty: animation must run once, start to finish

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
