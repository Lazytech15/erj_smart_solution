import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, Users, BarChart3, Calendar, Shield, Zap,
  ArrowRight, Building2,
  ClipboardList, TimerReset, Globe2, Star, Menu, X,
  Laptop, Smartphone,
  Plus, Minus, MapPin, Wifi, ShieldCheck, TrendingUp,
} from 'lucide-react';

/* ─── Design tokens — light, white-card theme with indigo accents ──────── */
const C = {
  bg:         '#F5F5F8',
  bgSection:  '#ffffff',
  card:       '#ffffff',
  cardAlt:    '#F7F7FA',
  border:     'rgba(15,23,42,0.08)',
  borderSoft: 'rgba(15,23,42,0.06)',
  brand:      '#6366f1',
  brandDark:  '#4f46e5',
  brandLight: 'rgba(99,102,241,0.08)',
  brandLight2:'rgba(99,102,241,0.14)',
  ink:        '#0f172a',
  inkMid:     '#5b6472',
  inkLight:   '#98a2b3',
  nav:        'rgba(255,255,255,0.85)',
  navBorder:  'rgba(15,23,42,0.06)',
};

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];

/* ─── Static data (unchanged) ─────────────────────────────────────────── */
const FEATURES = [
  { icon: Clock,     title: 'Real-time attendance',        body: 'Clock-in, clock-out, and overtime tracked to the minute. No spreadsheets, no manual tallies.' },
  { icon: Calendar, title: 'Leave management',            body: 'Employees request leave in seconds. Managers approve in one click. Balances update automatically.' },
  { icon: BarChart3,title: 'Payroll-ready reports',       body: 'Headcount, absence rates, shift coverage — clean charts and CSV exports ready for payroll.' },
  { icon: Users,    title: 'Department & shift planning', body: 'Organize teams by department, assign rotating shifts, and spot coverage gaps before they happen.' },
  { icon: Shield,   title: 'Role-based access',           body: 'Admins see everything. Managers see their team. Employees see themselves. No data leaks.' },
  { icon: Globe2,   title: 'Works anywhere',              body: 'Browser-based and mobile-friendly. Your team can clock in from the office, a site, or home.' },
];

const STEPS = [
  { icon: Building2,     title: 'Set up your workspace',    desc: 'Add your company, create departments, and configure shifts. Takes about five minutes.' },
  { icon: Users,          title: 'Enroll your employees',    desc: 'Add employees one by one or in bulk. Each person gets a login and starts tracking immediately.' },
  { icon: ClipboardList, title: 'Let the system run',       desc: 'Employees clock in, request leave, and managers approve — all without chasing anyone.' },
  { icon: TimerReset,    title: 'Close payroll in minutes', desc: 'Pull a report at month-end with accurate hours, overtime, and absences. Done.' },
];

const TESTIMONIALS = [
  { quote: 'We cut our end-of-month payroll prep from a full day to under two hours.', name: 'Maria Santos', role: 'HR Manager · Retail chain, 180 employees' },
  { quote: 'No more chasing people on WhatsApp to confirm leave. The approvals flow just works.', name: 'James Okonkwo', role: 'Operations Lead · Logistics, 65 employees' },
  { quote: 'Finally a system our non-technical staff actually use without any training.', name: 'Priya Mehta', role: 'Admin Director · Healthcare group, 240 employees' },
];

const PLANS = [
  { name: 'Starter',    price: 150, seats: '25',         color: '#6366f1', badge: null },
  { name: 'Growth',     price: 250, seats: '200',        color: '#8b5cf6', badge: 'Most popular', originalPrice: 320, discount: '20% OFF' },
  { name: 'Enterprise', price: 400, seats: 'Unlimited', color: '#06b6d4', badge: null, originalPrice: 530, discount: '25% OFF' },
];

const PLATFORMS = [
  { icon: Wifi,       title: 'Web dashboard', desc: 'Full admin & HR console — any modern browser.' },
  { icon: Laptop,     title: 'Desktop app',   desc: 'Installable desktop build for the office front desk.' },
  { icon: Smartphone, title: 'Mobile app',    desc: 'iOS & Android app for clock-ins and approvals on the go.' },
];

const WHY_US = [
  { icon: Zap,         title: 'Real-Time Visibility',   body: 'See who is clocked in, late, or on leave the moment it happens — no end-of-day surprises.' },
  { icon: TrendingUp,  title: 'Data-Driven Decisions',   body: 'Turn attendance and leave data into clear trends managers can actually act on.' },
  { icon: ShieldCheck, title: 'Operational Confidence',  body: 'Role-based access and audit-ready logs keep every record accurate and accountable.' },
  { icon: MapPin,      title: 'Built to Scale',          body: 'From a single site to a multi-branch operation, the same system grows with your headcount.' },
];

const TRUSTED_BY = ['Northwind Retail', 'Solstice Logistics', 'Vantage Health Group', 'Harbor & Co.', 'Meridian Foods', 'Crestline Manufacturing'];

const FAQS = [
  { q: 'How secure is our employee data?', a: 'Every record is encrypted in transit and at rest, and access is scoped by role so managers only ever see their own team.' },
  { q: 'Can we integrate this with our current payroll tool?', a: 'Yes — reports export to CSV, and our team can help map fields to most common payroll systems during onboarding.' },
  { q: 'How does shift and department planning work?', a: 'You create departments and shift templates once; assigning employees to them takes seconds and coverage gaps show up automatically.' },
  { q: 'Can we customize the dashboard per department?', a: 'Admins can filter and save views per department, so managers only see the metrics relevant to their team.' },
  { q: 'Does it support mobile clock-ins for remote or field teams?', a: 'Yes — the mobile app supports clock-ins from any location, with optional geofencing for site-based teams.' },
  { q: 'What kind of support do we get after setup?', a: 'Every plan includes onboarding help and ongoing email support, with priority support on Growth and Enterprise.' },
];

/* ─── Scroll reveal hook ──────────────────────────────────────────────── */
function UseScrollReveal() {
  const domRef = useRef();
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('reveal-visible');
      });
    }, { threshold: 0.1 });
    if (domRef.current) observer.observe(domRef.current);
    return () => { if (domRef.current) observer.unobserve(domRef.current); };
  }, []);
  return domRef;
}

/* ─── Small building blocks ───────────────────────────────────────────── */
function Eyebrow({ children, center }) {
  return (
    <div style={{ display: 'inline-block', color: C.brand, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '4px 14px', borderRadius: 999, background: C.brandLight, border: `1px solid rgba(99,102,241,0.18)`, margin: center ? '0 auto' : 0 }}>
      {children}
    </div>
  );
}

function Bar({ h, color, delay = 0 }) {
  return <div className="grow-bar" style={{ width: '100%', height: `${h}%`, borderRadius: 4, background: color, alignSelf: 'flex-end', animationDelay: `${delay}ms` }} />;
}

/* ─── Count-up number, triggers once when scrolled into view ───────────── */
function CountUp({ value, suffix = '', prefix = '', decimals = 0, duration = 1100 }) {
  const ref = useRef();
  const [display, setDisplay] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = now => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(value * eased);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);
  return <span ref={ref}>{prefix}{display.toFixed(decimals)}{suffix}</span>;
}

/* ─── NavBar ───────────────────────────────────────────────────────────── */
function NavBar({ onLogin, onGetStarted }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleScroll = (e, id) => {
    e.preventDefault();
    setMenuOpen(false);
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navLinks = ['Features', 'Solutions', 'Pricing', 'FAQ'];

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50, background: C.nav, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.navBorder}`, boxShadow: scrolled ? '0 8px 24px rgba(15,23,42,0.06)' : 'none', transition: 'box-shadow 0.3s ease' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px)', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }} onClick={() => { setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.28)' }}>
            <img src="/logo.svg" alt="ERJ" style={{ width: 20, height: 20, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          </div>
          <div>
            <span style={{ color: C.ink, fontWeight: 800, fontSize: 'clamp(13px, 2vw, 15px)', letterSpacing: '-0.3px' }}>ERJ</span>
            <span style={{ color: C.brand, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 6 }}>Smart Solutions</span>
          </div>
        </div>

        <nav className="desktop-nav" style={{ display: 'flex', gap: 'clamp(18px, 3vw, 30px)', alignItems: 'center' }}>
          {navLinks.map(l => {
            const id = l.toLowerCase().replace(/ /g, '-');
            return (
              <a key={l} href={`#${id}`} onClick={e => handleScroll(e, id)} className="nav-link"
                style={{ position: 'relative', color: C.inkMid, fontSize: 13.5, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s', paddingBottom: 2 }}
                onMouseEnter={e => e.currentTarget.style.color = C.brand}
                onMouseLeave={e => e.currentTarget.style.color = C.inkMid}
              >{l}</a>
            );
          })}
        </nav>

        <div className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onLogin}
            style={{ background: 'none', border: `1px solid ${C.border}`, color: C.inkMid, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 16px', borderRadius: 10 }}
            onMouseEnter={e => { e.currentTarget.style.color = C.ink; e.currentTarget.style.borderColor = C.brand; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.inkMid; e.currentTarget.style.borderColor = C.border; }}
          >Log in</button>
          <button onClick={onGetStarted}
            style={{ background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 14px rgba(99,102,241,0.28)' }}
          >Sign up <ArrowRight size={13} /></button>
        </div>

        <button className="mobile-menu-btn" onClick={() => setMenuOpen(o => !o)}
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: C.ink, borderRadius: 8 }}
          aria-label="Toggle menu"
        >{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </div>

      {menuOpen && (
        <div className="mobile-menu" style={{ background: C.nav, backdropFilter: 'blur(20px)', borderTop: `1px solid ${C.navBorder}`, padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navLinks.map(l => {
            const id = l.toLowerCase().replace(/ /g, '-');
            return <a key={l} href={`#${id}`} onClick={e => handleScroll(e, id)} style={{ color: C.inkMid, fontSize: 15, textDecoration: 'none', fontWeight: 500, padding: '10px 4px', borderBottom: `1px solid ${C.navBorder}` }}>{l}</a>;
          })}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={() => { setMenuOpen(false); onLogin(); }} style={{ flex: 1, background: 'none', border: `1px solid ${C.border}`, color: C.inkMid, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '10px 0', borderRadius: 10 }}>Log in</button>
            <button onClick={() => { setMenuOpen(false); onGetStarted(); }} style={{ flex: 1, background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Sign up</button>
          </div>
        </div>
      )}
    </header>
  );
}

/* ─── Hero — tilted dashboard mockup with floating stat chips ─────────── */
function HeroMock() {
  const heatmap = [72, 40, 88, 55, 20, 95, 60, 30, 78, 45, 65, 25, 90, 50];
  const cardRef = useRef();
  const [tilt, setTilt] = useState({ x: 8, y: -10 });

  const handleMove = e => {
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: 8 - py * 10, y: -10 + px * 14 });
  };
  const handleLeave = () => setTilt({ x: 8, y: -10 });

  return (
    <div style={{ position: 'relative', perspective: 1400 }} onMouseMove={handleMove} onMouseLeave={handleLeave}>
      <div ref={cardRef} style={{
        position: 'relative',
        transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) rotateZ(1deg)`,
        transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1)',
        transformStyle: 'preserve-3d',
        background: C.card,
        borderRadius: 22,
        border: `1px solid ${C.border}`,
        boxShadow: '0 40px 90px -20px rgba(15,23,42,0.28), 0 10px 30px rgba(15,23,42,0.08)',
        padding: 'clamp(16px, 2.5vw, 26px)',
        maxWidth: 780,
        margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          {['#f87171', '#fbbf24', '#34d399'].map(c => <span key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.8 }} />)}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ color: C.inkLight, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Welcome back</div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
              {[{ v: '7h 42m', l: 'Avg. hours' }, { v: '48', l: 'On time' }, { v: '6', l: 'On leave' }].map(s => (
                <div key={s.l} style={{ background: C.cardAlt, borderRadius: 12, padding: '10px 14px', minWidth: 84 }}>
                  <div style={{ color: C.ink, fontWeight: 800, fontSize: 16 }}>{s.v}</div>
                  <div style={{ color: C.inkLight, fontSize: 10, marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ color: C.ink, fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              Work heatmap <span style={{ color: C.inkLight, fontWeight: 500 }}>· this week</span>
              <span className="live-dot" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
              {heatmap.map((v, i) => (
                <div key={i} className="heat-cell" style={{ height: 26, borderRadius: 6, background: C.brand, opacity: 0.15 + (v / 100) * 0.85, animationDelay: `${0.6 + i * 0.05}s` }} />
              ))}
            </div>
          </div>

          <div style={{ flex: '1 1 200px', background: C.cardAlt, borderRadius: 14, padding: 16 }}>
            <div style={{ color: C.inkLight, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total teams</div>
            <div style={{ color: C.ink, fontWeight: 800, fontSize: 22, marginBottom: 12 }}><CountUp value={930} /></div>
            <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
              {[{ w: 40, c: '#6366f1' }, { w: 22, c: '#22c55e' }, { w: 18, c: '#f59e0b' }, { w: 20, c: '#ec4899' }].map((s, i) => (
                <div key={i} style={{ width: `${s.w}%`, background: s.c }} />
              ))}
            </div>
            {[{ l: 'IT', v: 240, c: '#6366f1' }, { l: 'Marketing', v: 150, c: '#22c55e' }, { l: 'Finance', v: 145, c: '#f59e0b' }, { l: 'People Ops', v: 35, c: '#ec4899' }].map(row => (
              <div key={row.l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, padding: '5px 0' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.inkMid }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: row.c }} />{row.l}</span>
                <span style={{ color: C.ink, fontWeight: 700 }}>{row.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hero-float-chip" style={{ position: 'absolute', top: '8%', left: '-4%', background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: '0 16px 36px rgba(15,23,42,0.16)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(34,197,94,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={15} color="#22c55e" />
        </div>
        <div>
          <div style={{ color: C.ink, fontWeight: 700, fontSize: 12 }}>98% accuracy</div>
          <div style={{ color: C.inkLight, fontSize: 10 }}>Attendance logs</div>
        </div>
      </div>

      <div className="hero-float-chip" style={{ position: 'absolute', bottom: '6%', right: '-3%', background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: '0 16px 36px rgba(15,23,42,0.16)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: C.brandLight2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Calendar size={15} color={C.brand} />
        </div>
        <div>
          <div style={{ color: C.ink, fontWeight: 700, fontSize: 12 }}>Leave approved</div>
          <div style={{ color: C.inkLight, fontSize: 10 }}>Just now</div>
        </div>
      </div>
    </div>
  );
}

function Hero({ onGetStarted, onViewPricing }) {
  return (
    <section style={{ padding: 'clamp(48px, 8vw, 88px) clamp(16px, 4vw, 32px) clamp(64px, 9vw, 104px)', position: 'relative', overflow: 'hidden', background: C.bgSection }}>
      <div style={{ position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)', width: 'clamp(320px, 70vw, 900px)', height: 380, borderRadius: '50%', background: `radial-gradient(ellipse, ${C.brandLight} 0%, transparent 70%)`, pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1160, margin: '0 auto', position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(36px, 5vw, 56px)' }}>
          <div className="hero-stagger" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 999, background: C.brandLight, border: '1px solid rgba(99,102,241,0.18)', color: C.brand, fontSize: 12.5, fontWeight: 600, marginBottom: 22, animationDelay: '0.05s' }}>
            <Zap size={11} /> 14-day free trial · No credit card required
          </div>

          <h1 className="hero-stagger" style={{ fontSize: 'clamp(32px, 5.5vw, 60px)', fontWeight: 800, color: C.ink, lineHeight: 1.08, letterSpacing: '-1.2px', margin: '0 auto 18px', animationDelay: '0.16s' }}>
            Manage Attendance<br />
            <span style={{ background: `linear-gradient(135deg, ${C.brand}, #8b5cf6)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundSize: '200% 100%', animation: 'gradientShift 6s ease-in-out infinite' }}>Smarter and Faster</span>
          </h1>

          <p className="hero-stagger" style={{ fontSize: 'clamp(14px, 2vw, 17px)', color: C.inkMid, lineHeight: 1.65, maxWidth: 560, margin: '0 auto 30px', animationDelay: '0.27s' }}>
            Clock-ins, leave approvals, shift schedules, and payroll-ready reports — one system, on web, desktop, and mobile.
          </p>

          <div className="hero-stagger" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', animationDelay: '0.38s' }}>
            <button onClick={onGetStarted} className="btn-primary"
              style={{ background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(12px, 2vw, 15px) clamp(24px, 3.5vw, 34px)', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 26px rgba(99,102,241,0.28)' }}
            >Get started now <ArrowRight size={15} /></button>
            <button onClick={onViewPricing} className="btn-secondary"
              style={{ background: C.card, color: C.ink, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 30px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}
            >See pricing</button>
          </div>
        </div>

        <div className="hero-stagger" style={{ animationDelay: '0.5s' }}>
          <HeroMock />
        </div>

        <div className="hero-stagger" style={{ marginTop: 'clamp(56px, 7vw, 84px)', textAlign: 'center', animationDelay: '0.62s' }}>
          <div style={{ color: C.inkLight, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 22 }}>TRUSTED BY GROWING TEAMS ACROSS INDUSTRIES</div>
          <div className="marquee-mask">
            <div className="marquee-track">
              {[...TRUSTED_BY, ...TRUSTED_BY].map((name, i) => (
                <div key={i} className="logo-chip" style={{ padding: '10px 18px', borderRadius: 12, border: `1px solid ${C.border}`, color: C.inkMid, fontWeight: 700, fontSize: 13, background: C.card, whiteSpace: 'nowrap' }}>{name}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Why choose us ────────────────────────────────────────────────────── */
function WhyUs() {
  const revealRef = UseScrollReveal();
  return (
    <section style={{ padding: `clamp(56px, 8vw, 88px) clamp(16px, 4vw, 32px)`, background: C.bg }}>
      <div ref={revealRef} className="reveal-element" style={{ maxWidth: 1160, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(36px, 5vw, 56px)' }}>
          <Eyebrow center>Why choose us</Eyebrow>
          <h2 style={{ color: C.ink, fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.8px', marginTop: 12 }}>Why Modern HR Teams Choose Us</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 'clamp(20px, 3vw, 32px)' }}>
          {WHY_US.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="stagger-card" style={{ textAlign: 'left', animationDelay: `${i * 0.09}s` }}>
              <div className="icon-tile" style={{ width: 42, height: 42, borderRadius: 12, background: `${PALETTE[i]}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
                <Icon size={19} color={PALETTE[i]} />
              </div>
              <div style={{ color: C.ink, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{title}</div>
              <div style={{ color: C.inkMid, fontSize: 13, lineHeight: 1.6 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Feature widget mini-mockups ──────────────────────────────────────── */
function HeatmapCard() {
  const rows = [88, 40, 62, 95, 30, 55, 20];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ color: C.ink, fontWeight: 700, fontSize: 13 }}>Work heatmap</div>
        <div style={{ color: C.inkLight, fontSize: 10.5 }}>This week</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, height: 90, alignItems: 'end' }}>
        {rows.map((v, i) => <Bar key={i} h={v} color={C.brand} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} style={{ color: C.inkLight, fontSize: 9.5, flex: 1, textAlign: 'center' }}>{d}</span>)}
      </div>
    </div>
  );
}

function TeamListCard() {
  const people = [
    { name: 'Kevin Wong', dept: 'IT', last: '5 mins ago' },
    { name: 'Joan Doe', dept: 'Creative', last: '2 mins ago' },
    { name: 'Sarah Sochan', dept: 'Marketing', last: '15 mins ago' },
    { name: 'Samantha Wilson', dept: 'Creative', last: '1 hour ago' },
  ];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
      <div style={{ color: C.ink, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Talent directory</div>
      {people.map((p, i) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i ? `1px solid ${C.borderSoft}` : 'none' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: PALETTE[i % PALETTE.length], color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {p.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.ink, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
            <div style={{ color: C.inkLight, fontSize: 10.5 }}>{p.dept}</div>
          </div>
          <div style={{ color: C.inkLight, fontSize: 10, flexShrink: 0 }}>{p.last}</div>
        </div>
      ))}
    </div>
  );
}

function AllocationCard() {
  const rows = [{ l: 'IT', v: 240, c: '#6366f1' }, { l: 'Marketing', v: 150, c: '#22c55e' }, { l: 'Finance', v: 145, c: '#f59e0b' }, { l: 'People Ops', v: 35, c: '#ec4899' }];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ color: C.ink, fontWeight: 700, fontSize: 13 }}>Total teams</div>
        <div style={{ color: C.ink, fontWeight: 800, fontSize: 13 }}>930</div>
      </div>
      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
        {rows.map((r, i) => <div key={i} style={{ width: `${(r.v / 570) * 100}%`, background: r.c }} />)}
      </div>
      {rows.map(r => (
        <div key={r.l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, padding: '5px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.inkMid }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: r.c }} />{r.l}</span>
          <span style={{ color: C.ink, fontWeight: 700 }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

function ScheduleCard() {
  const items = [
    { t: 'Daily stand-up', time: '9:00 - 9:15 AM', c: '#6366f1' },
    { t: 'Client meeting', time: '11:00 - 12:00 PM', c: '#f59e0b' },
    { t: 'Weekly team review', time: '3:00 - 4:00 PM', c: '#22c55e' },
  ];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
      <div style={{ color: C.ink, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Priority scheduling</div>
      {items.map((it, i) => (
        <div key={it.t} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${C.borderSoft}` : 'none' }}>
          <div style={{ width: 3, borderRadius: 2, background: it.c, flexShrink: 0 }} />
          <div>
            <div style={{ color: C.ink, fontSize: 12, fontWeight: 600 }}>{it.t}</div>
            <div style={{ color: C.inkLight, fontSize: 10.5, marginTop: 2 }}>{it.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const FEATURE_BLOCKS = [
  { title: 'Visualized Productivity', desc: 'Monitor work rhythms from clock-in data. Identify peak hours and prevent burnout before it happens.', Mock: HeatmapCard },
  { title: 'Resource Allocation', desc: 'Track headcount and growth. Visualize department distribution across your whole workforce.', Mock: AllocationCard },
  { title: 'Talent Directory', desc: 'A centralized database of employees. Roles, department, and live attendance status, always up to date.', Mock: TeamListCard },
  { title: 'Priority-Driven Scheduling', desc: 'Keep your leadership team on track. Manage meetings, shifts, and daily operations in one place.', Mock: ScheduleCard },
];

function Features() {
  const revealRef = UseScrollReveal();
  return (
    <section id="features" style={{ padding: `clamp(64px, 9vw, 100px) clamp(16px, 4vw, 32px)`, background: C.bgSection }}>
      <div ref={revealRef} className="reveal-element" style={{ maxWidth: 1160, margin: '0 auto' }}>
        <div style={{ marginBottom: 'clamp(32px, 5vw, 52px)' }}>
          <Eyebrow>Features</Eyebrow>
          <h2 style={{ color: C.ink, fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.8px', marginTop: 12 }}>Everything you need<br />to lead effectively</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 'clamp(16px, 2.5vw, 24px)' }}>
          {FEATURE_BLOCKS.map(({ title, desc, Mock }, i) => (
            <div key={title} className="stagger-card hover-lift" style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 22, padding: 'clamp(20px, 2.5vw, 28px)', animationDelay: `${i * 0.1}s`, transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease, border-color 0.3s ease' }}>
              <div style={{ color: C.ink, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{title}</div>
              <div style={{ color: C.inkMid, fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>{desc}</div>
              <Mock />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How it works — workflow steps + integration diagram ─────────────── */
function FlowDiagram() {
  const top = [Calendar, Clock, Users, Shield];
  return (
    <div style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 22, padding: 'clamp(24px, 4vw, 48px) clamp(16px, 3vw, 32px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(28px, 4vw, 44px)' }}>
      <div style={{ display: 'flex', gap: 'clamp(16px, 4vw, 56px)', flexWrap: 'wrap', justifyContent: 'center' }}>
        {top.map((Icon, i) => (
          <div key={i} style={{ width: 46, height: 46, borderRadius: 13, background: C.card, border: `1px solid ${C.border}`, boxShadow: '0 6px 16px rgba(15,23,42,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={19} color={PALETTE[i % PALETTE.length]} />
          </div>
        ))}
      </div>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 28px rgba(99,102,241,0.32)' }}>
        <BarChart3 size={24} color="#fff" />
      </div>
      <div style={{ display: 'flex', gap: 'clamp(16px, 4vw, 56px)', flexWrap: 'wrap', justifyContent: 'center' }}>
        {[Building2, ClipboardList, Globe2].map((Icon, i) => (
          <div key={i} style={{ width: 46, height: 46, borderRadius: 13, background: C.card, border: `1px solid ${C.border}`, boxShadow: '0 6px 16px rgba(15,23,42,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={19} color={PALETTE[(i + 2) % PALETTE.length]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  const revealRef = UseScrollReveal();
  return (
    <section id="solutions" style={{ padding: `clamp(64px, 9vw, 100px) clamp(16px, 4vw, 32px)`, background: C.bg }}>
      <div ref={revealRef} className="reveal-element" style={{ maxWidth: 1160, margin: '0 auto' }}>
        <div style={{ marginBottom: 'clamp(32px, 5vw, 48px)' }}>
          <Eyebrow>How it works</Eyebrow>
          <h2 style={{ color: C.ink, fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.8px', marginTop: 12 }}>Transform Your<br />Workflow Instantly</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 'clamp(20px, 3vw, 32px)', marginBottom: 'clamp(36px, 5vw, 52px)' }}>
          {STEPS.slice(0, 3).map(({ icon: Icon, title, desc }, i) => (
            <div key={title}>
              <div style={{ color: C.ink, fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{title}</div>
              <div style={{ color: C.inkMid, fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{desc}</div>
              {i === 0 && <div style={{ width: 40, height: 3, borderRadius: 2, background: C.brand }} />}
            </div>
          ))}
        </div>

        <FlowDiagram />
      </div>
    </section>
  );
}

/* ─── Testimonials ─────────────────────────────────────────────────────── */
function Testimonials() {
  const revealRef = UseScrollReveal();
  return (
    <section style={{ padding: `clamp(64px, 9vw, 100px) clamp(16px, 4vw, 32px)`, background: C.bgSection }}>
      <div ref={revealRef} className="reveal-element" style={{ maxWidth: 1160, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(36px, 5vw, 52px)' }}>
          <Eyebrow center>Testimonials</Eyebrow>
          <h2 style={{ color: C.ink, fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.8px', marginTop: 12, marginBottom: 14 }}>Trusted by HR Teams<br />of All Sizes</h2>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {[...Array(5)].map((_, i) => <Star key={i} size={14} color="#f59e0b" fill="#f59e0b" />)}
            <span style={{ color: C.inkMid, fontSize: 13, fontWeight: 600 }}>4.8 · 900+ reviews</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 'clamp(16px, 2.5vw, 22px)' }}>
          {TESTIMONIALS.map(({ quote, name, role }, i) => (
            <div key={name} className="stagger-card hover-lift" style={{ background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 20, padding: 'clamp(20px, 2.5vw, 28px)', display: 'flex', flexDirection: 'column', gap: 18, animationDelay: `${i * 0.1}s`, transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease' }}>
              <p style={{ color: C.ink, fontSize: 14, lineHeight: 1.7, flex: 1 }}>{quote}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: PALETTE[i % PALETTE.length], color: '#fff', fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <div style={{ color: C.ink, fontSize: 13, fontWeight: 700 }}>{name}</div>
                  <div style={{ color: C.inkLight, fontSize: 11.5, marginTop: 1 }}>{role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ───────────────────────────────────────────────────────────────── */
function FAQ() {
  const revealRef = UseScrollReveal();
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" style={{ padding: `clamp(64px, 9vw, 100px) clamp(16px, 4vw, 32px)`, background: C.bg }}>
      <div ref={revealRef} className="reveal-element" style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) 1fr', gap: 'clamp(24px, 4vw, 48px)' }}>
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2 style={{ color: C.ink, fontSize: 'clamp(24px, 3.6vw, 32px)', fontWeight: 800, letterSpacing: '-0.7px', marginTop: 12 }}>Frequently<br />Asked Questions</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="stagger-card" style={{ background: C.card, border: `1px solid ${isOpen ? 'rgba(99,102,241,0.35)' : C.border}`, borderRadius: 14, overflow: 'hidden', animationDelay: `${i * 0.06}s`, transition: 'border-color 0.3s ease, box-shadow 0.3s ease', boxShadow: isOpen ? '0 8px 24px rgba(99,102,241,0.1)' : 'none' }}>
                <button onClick={() => setOpen(isOpen ? -1 : i)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, textAlign: 'left' }}
                >
                  <span style={{ color: C.ink, fontWeight: 600, fontSize: 13.5 }}>{f.q}</span>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: C.brandLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
                    {isOpen ? <Minus size={13} color={C.brand} /> : <Plus size={13} color={C.brand} />}
                  </span>
                </button>
                <div className="faq-panel" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '0 18px 18px', color: C.inkMid, fontSize: 13, lineHeight: 1.65 }}>{f.a}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ───────────────────────────────────────────────────────────── */
function Pricing({ onGetStarted }) {
  const revealRef = UseScrollReveal();
  return (
    <section id="pricing" style={{ padding: `clamp(64px, 9vw, 100px) clamp(16px, 4vw, 32px)`, background: C.bgSection }}>
      <div ref={revealRef} className="reveal-element" style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 5vw, 52px)' }}>
          <Eyebrow center>Pricing</Eyebrow>
          <h2 style={{ color: C.ink, fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.8px', marginTop: 12, marginBottom: 12 }}>Pay only for who you enroll</h2>
          <p style={{ color: C.inkMid, fontSize: 15 }}>Remove an employee, stop paying for them. No commitments you can't change.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 'clamp(16px, 2.5vw, 24px)', marginBottom: 'clamp(32px, 5vw, 48px)', alignItems: 'center' }}>
          {PLANS.map((p, i) => (
            <div key={p.name} className={`stagger-card ${p.badge ? 'plan-pop' : 'hover-lift'}`} style={{
              position: 'relative', background: C.card, border: p.badge ? `2px solid ${C.brand}` : `1px solid ${C.border}`,
              borderRadius: 22, padding: p.badge ? 'clamp(28px, 4vw, 40px) clamp(16px, 2.5vw, 28px)' : 'clamp(22px, 3vw, 34px) clamp(16px, 2.5vw, 28px)',
              textAlign: 'center', boxShadow: p.badge ? '0 14px 40px rgba(99,102,241,0.14)' : '0 4px 16px rgba(15,23,42,0.04)',
              animationDelay: `${i * 0.1}s`, transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease',
            }}>
              {p.badge && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: `linear-gradient(135deg, ${C.brand}, #8b5cf6)`, color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 999, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.badge}</div>
              )}
              <div style={{ color: C.ink, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{p.name}</div>
              {p.originalPrice && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: C.inkLight, fontSize: 12, textDecoration: 'line-through' }}>₱{p.originalPrice}</span>
                  <span style={{ background: p.color, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{p.discount}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3, margin: '12px 0' }}>
                <span style={{ color: C.brand, fontSize: 'clamp(28px, 4.5vw, 40px)', fontWeight: 800, letterSpacing: '-1px' }}>₱<CountUp value={p.price} duration={900} /></span>
                <span style={{ color: C.inkLight, fontSize: 12.5 }}>/emp/mo</span>
              </div>
              <div style={{ color: C.inkMid, fontSize: 12.5 }}>Up to {p.seats} employees</div>
              <div style={{ width: '100%', height: 2, background: `linear-gradient(90deg, ${C.brand}, #8b5cf6)`, borderRadius: 2, marginTop: 20, opacity: 0.35 }} />
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button onClick={onGetStarted}
            style={{ background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(12px, 2vw, 16px) clamp(24px, 3.5vw, 40px)', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 26px rgba(99,102,241,0.25)' }}
          >Start 14-day free trial <ArrowRight size={15} /></button>
          <p style={{ color: C.inkLight, fontSize: 12, marginTop: 14 }}>Full access during trial · No credit card · Cancel any time</p>
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA ─────────────────────────────────────────────────────────── */
function FinalCTA({ onGetStarted }) {
  return (
    <section style={{ padding: `clamp(64px, 10vw, 120px) clamp(16px, 4vw, 32px)`, background: C.bg, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: '-10%', width: 340, height: 340, borderRadius: '50%', background: `radial-gradient(circle, ${C.brandLight2} 0%, transparent 70%)` }} />
      <div style={{ position: 'absolute', bottom: 0, right: '-8%', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.10) 0%, transparent 70%)' }} />
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        <h2 style={{ color: C.ink, fontSize: 'clamp(26px, 4.2vw, 40px)', fontWeight: 800, letterSpacing: '-0.9px', marginBottom: 14 }}>Ready to Transform<br />Your Workforce?</h2>
        <p style={{ color: C.inkMid, fontSize: 15, marginBottom: 28 }}>Setting up takes minutes, and our team is ready to help you migrate your entire workforce.</p>
        <button onClick={onGetStarted}
          style={{ background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: '15px 36px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 28px rgba(99,102,241,0.3)' }}
        >Get started now <ArrowRight size={15} /></button>
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────────────── */
function Footer({ onLogin }) {
  const cols = [
    { title: 'Platform', links: ['Attendance', 'Leave Management', 'Reports', 'Shift Planning'] },
    { title: 'Resources', links: ['Help Center', 'Onboarding Guide', 'Request a Demo'] },
    { title: 'Company', links: ['About Us', 'Careers', 'Contact'] },
  ];
  return (
    <footer style={{ borderTop: `1px solid ${C.border}`, background: C.bgSection, padding: `clamp(40px, 6vw, 64px) clamp(16px, 4vw, 32px) clamp(20px, 3vw, 28px)` }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(28px, 5vw, 48px)', justifyContent: 'space-between', marginBottom: 'clamp(28px, 4vw, 44px)' }}>
          <div style={{ maxWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/logo.svg" alt="ERJ" style={{ width: 17, height: 17, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
              </div>
              <div>
                <span style={{ color: C.ink, fontWeight: 800, fontSize: 14 }}>ERJ</span>
                <span style={{ color: C.brand, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 6 }}>Smart Solutions</span>
              </div>
            </div>
            <p style={{ color: C.inkLight, fontSize: 12.5, lineHeight: 1.7 }}>Attendance, leave, and workforce reporting in one system your whole team will actually use.</p>
          </div>
          {cols.map(col => (
            <div key={col.title}>
              <div style={{ color: C.ink, fontWeight: 700, fontSize: 12.5, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{col.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(l => (
                  <a key={l} href="#" style={{ color: C.inkMid, fontSize: 13, textDecoration: 'none' }}
                    onMouseEnter={e => e.target.style.color = C.brand}
                    onMouseLeave={e => e.target.style.color = C.inkMid}
                  >{l}</a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${C.borderSoft}`, paddingTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ color: C.inkLight, fontSize: 12 }}>© {new Date().getFullYear()} ERJ Smart Solutions. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <a href="#" style={{ color: C.inkLight, fontSize: 12, textDecoration: 'none' }}>Privacy Policy</a>
            <a href="#" style={{ color: C.inkLight, fontSize: 12, textDecoration: 'none' }}>Terms of Service</a>
            <button onClick={onLogin} style={{ background: 'none', border: 'none', color: C.inkLight, fontSize: 12, cursor: 'pointer', padding: 0 }}>Sign in</button>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page container ───────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const goSignup = () => navigate('/pricing');
  const goLogin  = () => navigate('/login');

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        html { scroll-behavior: smooth; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .reveal-element {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .reveal-visible {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
        .hero-float-chip { animation: float 5s ease-in-out infinite; }
        .hero-float-chip:nth-of-type(2) { animation-delay: 1.2s; }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        /* Hero entrance stagger */
        .hero-stagger {
          opacity: 0;
          transform: translateY(18px);
          animation: heroIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes heroIn {
          to { opacity: 1; transform: translateY(0); }
        }

        /* Gradient text shimmer on the headline accent */
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        /* Generic card stagger-in on scroll (parent has .reveal-element, so this activates once visible) */
        .stagger-card {
          opacity: 0;
          transform: translateY(18px);
        }
        .reveal-visible .stagger-card {
          animation: heroIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Hover lift for cards */
        .hover-lift:hover {
          transform: translateY(-6px) !important;
          box-shadow: 0 20px 44px rgba(15,23,42,0.12) !important;
          border-color: rgba(99,102,241,0.35) !important;
        }
        .plan-pop:hover {
          transform: translateY(-8px) scale(1.015) !important;
          box-shadow: 0 24px 52px rgba(99,102,241,0.22) !important;
        }
        .icon-tile:hover { transform: scale(1.1) rotate(-4deg); }

        /* Buttons */
        .btn-primary { transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(99,102,241,0.36) !important; filter: brightness(1.04); }
        .btn-primary:active { transform: translateY(0); }
        .btn-secondary { transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease; }
        .btn-secondary:hover { transform: translateY(-2px); border-color: rgba(99,102,241,0.4) !important; background: rgba(99,102,241,0.04) !important; }

        /* Nav underline */
        .nav-link::after {
          content: '';
          position: absolute; left: 0; right: 100%; bottom: -3px; height: 2px;
          background: ${C.brand}; border-radius: 2px;
          transition: right 0.25s cubic-bezier(0.16,1,0.3,1);
        }
        .nav-link:hover::after { right: 0; }

        /* Marquee for trusted-by strip */
        .marquee-mask {
          overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
        }
        .marquee-track {
          display: flex;
          gap: clamp(10px, 2vw, 16px);
          width: max-content;
          animation: marquee 26s linear infinite;
        }
        .marquee-mask:hover .marquee-track { animation-play-state: paused; }
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .logo-chip { transition: transform 0.2s ease, border-color 0.2s ease, color 0.2s ease; }
        .logo-chip:hover { transform: translateY(-3px); border-color: rgba(99,102,241,0.35); color: ${C.ink}; }

        /* Hero mock heatmap + live dot */
        .heat-cell {
          transform: scaleY(0);
          transform-origin: bottom;
          animation: growUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes growUp {
          to { transform: scaleY(1); }
        }
        .grow-bar {
          transform: scaleY(0);
          transform-origin: bottom;
          animation: growUp 0.7s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        .live-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #22c55e; display: inline-block;
          box-shadow: 0 0 0 0 rgba(34,197,94,0.5);
          animation: pulseDot 2s ease-out infinite;
        }
        @keyframes pulseDot {
          0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
          70% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }

        /* FAQ smooth expand */
        .faq-panel {
          display: grid;
          transition: grid-template-rows 0.32s cubic-bezier(0.16,1,0.3,1);
        }

        @media (min-width: 640px) {
          .desktop-nav { display: flex !important; }
          .mobile-menu-btn { display: none !important; }
          .mobile-menu { display: none !important; }
        }
        @media (max-width: 639px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; align-items: center; justify-content: center; }
          .hero-float-chip { display: none !important; }
        }
        @media (max-width: 720px) {
          #faq > div { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <NavBar onLogin={goLogin} onGetStarted={goSignup} />
      <main>
        <Hero onGetStarted={goSignup} onViewPricing={goSignup} />
        <WhyUs />
        <Features />
        <HowItWorks />
        <Testimonials />
        <FAQ />
        <Pricing onGetStarted={goSignup} />
        <FinalCTA onGetStarted={goSignup} />
      </main>
      <Footer onLogin={goLogin} />
    </div>
  );
}