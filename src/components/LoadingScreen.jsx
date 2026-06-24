import React, { useEffect, useRef } from "react";

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
    padding: "0 24px",
  },
  logoWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 20,
    marginBottom: 56,
  },
  logoIcon: {
    // clamp: min 80px, preferred 15vw, max 120px
    width: "clamp(80px, 15vw, 120px)",
    height: "clamp(80px, 15vw, 120px)",
    borderRadius: "clamp(18px, 3vw, 28px)",
    overflow: "hidden",
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 4px 24px rgba(37,99,235,0.10), 0 1px 4px rgba(0,0,0,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "logoBreath 2.8s ease-in-out infinite",
    flexShrink: 0,
  },
  logoImg: {
    width: "83%",
    height: "83%",
    objectFit: "contain",
  },
  brand: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
  },
  brandName: {
    // clamp: min 20px, preferred 5vw, max 30px
    fontSize: "clamp(20px, 5vw, 30px)",
    fontWeight: 700,
    letterSpacing: "-0.4px",
    color: "#1A1A2E",
    textAlign: "center",
  },
  brandSub: {
    // clamp: min 11px, preferred 2.5vw, max 14px
    fontSize: "clamp(11px, 2.5vw, 14px)",
    fontWeight: 400,
    letterSpacing: "3px",
    textTransform: "uppercase",
    color: "#7B8490",
    textAlign: "center",
  },
  divider: {
    width: 1,
    height: 44,
    background: "#D1D5DB",
    margin: "4px 0 28px",
  },
  progressWrap: {
    // max 520px, full width with 24px side padding accounted for by root
    width: "min(520px, 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  barTrack: {
    width: "100%",
    height: 6,
    background: "#E2E4E7",
    borderRadius: 99,
    overflow: "hidden",
    position: "relative",
  },
  barFill: {
    height: "100%",
    width: "0%",
    background: "linear-gradient(90deg, #1D4ED8, #2563EB, #3B82F6)",
    borderRadius: 99,
    boxShadow: "0 0 10px rgba(37,99,235,0.4)",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  statusText: {
    fontSize: "clamp(12px, 2.5vw, 14px)",
    color: "#7B8490",
    letterSpacing: "0.3px",
  },
  pct: {
    fontSize: "clamp(12px, 2.5vw, 14px)",
    fontWeight: 600,
    color: "#2563EB",
    fontVariantNumeric: "tabular-nums",
  },
  dots: {
    display: "flex",
    gap: 9,
    marginTop: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#CBD1D9",
    animation: "dotPulse 1.4s ease-in-out infinite",
  },
};

const keyframes = `
  @keyframes logoBreath {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.88; transform: scale(0.97); }
  }
  @keyframes dotPulse {
    0%, 100% { background: #CBD1D9; transform: scale(1); }
    50%       { background: #2563EB; transform: scale(1.35); }
  }

  /* Extra-small screens: tighten vertical spacing */
  @media (max-height: 500px) {
    .ls-logoWrap  { margin-bottom: 24px !important; gap: 12px !important; }
    .ls-divider   { height: 28px !important; margin: 2px 0 16px !important; }
  }
`;

/**
 * LoadingScreen
 *
 * Props:
 *   label      – fallback status text shown before the stage messages kick in
 *   onComplete – called once the bar reaches 100% and a short pause elapses
 */
export default function LoadingScreen({ label = "Initializing...", onComplete }) {
  const fillRef       = useRef(null);
  const pctRef        = useRef(null);
  const statusRef     = useRef(null);
  const rafRef        = useRef(null);
  const doneRef       = useRef(false);
  const progressRef   = useRef(2);
  const onCompleteRef = useRef(onComplete);

  const stages = [
    [0,  20, "Initializing..."],
    [20, 45, "Loading modules..."],
    [45, 70, "Connecting services..."],
    [70, 90, "Preparing workspace..."],
    [90, 99, "Almost ready..."],
    [99, 100, "Done!"],
  ];

  const getStatus = (p) =>
    stages.find(([min, max]) => p >= min && p < max)?.[2] ?? "Done!";

  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    doneRef.current = false;
    progressRef.current = 2;

    const tick = () => {
      if (doneRef.current) return;

      const p = progressRef.current;
      const speed = p < 70 ? 0.5 : p < 90 ? 0.3 : 0.15;
      progressRef.current = Math.min(100, p + speed);

      const rounded = Math.floor(progressRef.current);
      if (fillRef.current)   fillRef.current.style.width = progressRef.current.toFixed(2) + "%";
      if (pctRef.current)    pctRef.current.textContent  = rounded + "%";
      if (statusRef.current) statusRef.current.textContent = getStatus(rounded);

      if (progressRef.current >= 100) {
        doneRef.current = true;
        if (fillRef.current) fillRef.current.style.width = "100%";
        if (pctRef.current)  pctRef.current.textContent  = "100%";
        setTimeout(() => { if (onCompleteRef.current) onCompleteRef.current(); }, 450);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      doneRef.current = true;
    };
  }, []);

  return (
    <>
      <style>{keyframes}</style>
      <div style={styles.root}>
        <div className="ls-logoWrap" style={styles.logoWrap}>
          <div style={styles.logoIcon}>
            <img src="/logo.svg" alt="ERJ Smart Solution" style={styles.logoImg} />
          </div>
          <div style={styles.brand}>
            <span style={styles.brandName}>ERJ Smart Solution</span>
            <span style={styles.brandSub}>Enterprise Systems</span>
          </div>
        </div>

        <div className="ls-divider" style={styles.divider} />

        <div style={styles.progressWrap}>
          <div style={styles.barTrack}>
            <div ref={fillRef} style={styles.barFill} />
          </div>
          <div style={styles.statusRow}>
            <span ref={statusRef} style={styles.statusText}>{label}</span>
            <span ref={pctRef} style={styles.pct}>0%</span>
          </div>
          <div style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ ...styles.dot, animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
