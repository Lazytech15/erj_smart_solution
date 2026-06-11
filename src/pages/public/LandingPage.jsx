import { useNavigate } from 'react-router-dom';
import {
  Clock, Users, BarChart3, Calendar, Shield, Zap,
  ArrowRight, CheckCircle, ChevronRight, Building2,
  ClipboardList, TimerReset, Globe2, Star
} from 'lucide-react';

/* ─── Design tokens — ERJ palette ────────────────────────────── */
const C = {
  bg:        '#0b0e1a',          // near-black with navy tint
  bgCard:    '#111844',          // navy card — palette #111844
  bgCardHov: '#162050',
  border:    'rgba(75,86,148,0.25)',   // from #4B5694 at low opacity
  borderHov: 'rgba(75,86,148,0.55)',
  brand:     '#4B5694',          // palette #4B5694
  brandMid:  '#7288AE',          // palette #7288AE
  brandDark: '#3a4480',
  brandGlow: 'rgba(75,86,148,0.18)',
  accent:    '#EAE0CF',          // palette #EAE0CF — warm cream accent
  white:     '#ffffff',
  gray1:     '#d8dce8',
  gray2:     '#7288AE',          // reuse mid-blue as secondary text
  gray3:     '#4B5694',          // muted blue
  nav:       'rgba(11,14,26,0.88)',
};

/* ─── Static data ─────────────────────────────────────────────── */
const FEATURES = [
  { icon: Clock,        title: 'Real-time attendance',        body: 'Clock-in, clock-out, and overtime tracked to the minute. No spreadsheets, no manual tallies.' },
  { icon: Calendar,     title: 'Leave management',            body: 'Employees request leave in seconds. Managers approve in one click. Balances update automatically.' },
  { icon: BarChart3,    title: 'Payroll-ready reports',       body: 'Headcount, absence rates, shift coverage — clean charts and CSV exports ready for payroll.' },
  { icon: Users,        title: 'Department & shift planning', body: 'Organize teams by department, assign rotating shifts, and spot coverage gaps before they happen.' },
  { icon: Shield,       title: 'Role-based access',           body: 'Admins see everything. Managers see their team. Employees see themselves. No data leaks.' },
  { icon: Globe2,       title: 'Works anywhere',              body: 'Browser-based and mobile-friendly. Your team can clock in from the office, a site, or home.' },
];

const STEPS = [
  { icon: Building2,     title: 'Set up your workspace',    desc: 'Add your company, create departments, and configure shifts. Takes about five minutes.' },
  { icon: Users,         title: 'Enroll your employees',    desc: 'Add employees one by one or in bulk. Each person gets a login and starts tracking immediately.' },
  { icon: ClipboardList, title: 'Let the system run',       desc: 'Employees clock in, request leave, and managers approve — all without chasing anyone.' },
  { icon: TimerReset,    title: 'Close payroll in minutes', desc: 'Pull a report at month-end with accurate hours, overtime, and absences. Done.' },
];

const TESTIMONIALS = [
  { quote: 'We cut our end-of-month payroll prep from a full day to under two hours.', name: 'Maria Santos', role: 'HR Manager · Retail chain, 180 employees' },
  { quote: 'No more chasing people on WhatsApp to confirm leave. The approvals flow just works.', name: 'James Okonkwo', role: 'Operations Lead · Logistics, 65 employees' },
  { quote: 'Finally a system our non-technical staff actually use without any training.', name: 'Priya Mehta', role: 'Admin Director · Healthcare group, 240 employees' },
];

const PLANS = [
  { name: 'Starter',    price: 3, seats: '25',        color: '#4B5694', badge: null },
  { name: 'Growth',     price: 5, seats: '200',       color: '#7288AE', badge: 'Most popular' },
  { name: 'Enterprise', price: 8, seats: 'Unlimited', color: '#EAE0CF', badge: null },
];

/* ─── Components ──────────────────────────────────────────────── */

function NavBar({ onLogin, onGetStarted }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: C.nav,
      backdropFilter: 'blur(16px)',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px)', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.svg" alt="ERJ" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div>
            <span style={{ color: C.white, fontWeight: 800, fontSize: 'clamp(14px, 2vw, 16px)', letterSpacing: '-0.3px' }}>ERJ</span>
            <span style={{ color: C.accent, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 6 }}>Smart Solutions</span>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', gap: 'clamp(16px, 3vw, 32px)', alignItems: 'center' }}>
          {['Features', 'How it works', 'Pricing'].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g, '-')}`}
              style={{ color: C.gray2, fontSize: 'clamp(12px, 1.5vw, 14px)', textDecoration: 'none', fontWeight: 500 }}
              onMouseEnter={e => e.target.style.color = C.white}
              onMouseLeave={e => e.target.style.color = C.gray2}
            >{l}</a>
          ))}
        </nav>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onLogin}
            style={{ background: 'none', border: 'none', color: C.gray2, fontSize: 'clamp(12px, 1.5vw, 13px)', fontWeight: 500, cursor: 'pointer', padding: '6px 10px', borderRadius: 8 }}
            onMouseEnter={e => e.target.style.color = C.white}
            onMouseLeave={e => e.target.style.color = C.gray2}
          >Sign in</button>
          <button onClick={onGetStarted}
            style={{ background: C.brand, color: C.white, border: 'none', borderRadius: 10, padding: 'clamp(7px, 1vw, 9px) clamp(14px, 2vw, 20px)', fontSize: 'clamp(12px, 1.5vw, 13px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={e => e.currentTarget.style.background = C.brandDark}
            onMouseLeave={e => e.currentTarget.style.background = C.brand}
          >Get started <ArrowRight size={13} /></button>
        </div>
      </div>
    </header>
  );
}

function Hero({ onGetStarted, onViewPricing }) {
  return (
    <section style={{ textAlign: 'center', padding: 'clamp(64px, 10vw, 112px) clamp(16px, 4vw, 32px) clamp(48px, 8vw, 80px)', position: 'relative', overflow: 'hidden' }}>
      {/* Glow */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 'clamp(400px, 70vw, 800px)', height: 'clamp(250px, 40vw, 500px)', borderRadius: '50%',
        background: `radial-gradient(ellipse, rgba(75,86,148,0.22) 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Badge */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 999, background: C.brandGlow, border: `1px solid rgba(75,86,148,0.35)`, color: C.accent, fontSize: 'clamp(11px, 1.5vw, 13px)', fontWeight: 600, marginBottom: 'clamp(20px, 3vw, 32px)' }}>
        <Zap size={11} /> 14-day free trial · No credit card required
      </div>

      {/* Headline */}
      <h1 style={{ fontSize: 'clamp(40px, 6.5vw, 72px)', fontWeight: 800, color: C.white, lineHeight: 1.08, letterSpacing: '-2px', maxWidth: 800, margin: '0 auto clamp(16px, 2.5vw, 24px)' }}>
        Attendance tracking your{' '}
        <span style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.brandMid})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          whole team
        </span>{' '}
        will actually use
      </h1>

      {/* Subhead */}
      <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: C.gray2, lineHeight: 1.7, maxWidth: 560, margin: `0 auto clamp(32px, 5vw, 48px)` }}>
        Clock-ins, leave approvals, shift schedules, and payroll-ready reports — in one system that takes minutes to set up per employee.
      </p>

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 'clamp(48px, 7vw, 72px)' }}>
        <button onClick={onGetStarted}
          style={{ background: C.brand, color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(12px, 2vw, 16px) clamp(20px, 3vw, 32px)', fontSize: 'clamp(14px, 1.8vw, 16px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 40px rgba(75,86,148,0.4)' }}
          onMouseEnter={e => e.currentTarget.style.background = C.brandDark}
          onMouseLeave={e => e.currentTarget.style.background = C.brand}
        >Start free trial <ArrowRight size={16} /></button>
        <button onClick={onViewPricing}
          style={{ background: 'transparent', color: C.gray1, border: `1px solid ${C.border}`, borderRadius: 12, padding: 'clamp(12px, 2vw, 16px) clamp(18px, 2.5vw, 28px)', fontSize: 'clamp(14px, 1.8vw, 16px)', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHov; e.currentTarget.style.color = C.white; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.gray1; }}
        >See pricing <ChevronRight size={15} /></button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, maxWidth: 'min(760px, 90vw)', margin: '0 auto', background: C.border, borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {[
          { v: '98%', l: 'attendance accuracy' },
          { v: '<2 min', l: 'setup per employee' },
          { v: '14 days', l: 'free trial' },
          { v: '$3/mo', l: 'per employee, to start' },
        ].map(({ v, l }) => (
          <div key={l} style={{ background: C.bgCard, padding: 'clamp(14px, 2.5vw, 24px) clamp(10px, 1.5vw, 16px)', textAlign: 'center' }}>
            <div style={{ color: C.accent, fontSize: 'clamp(18px, 2.5vw, 24px)', fontWeight: 800, letterSpacing: '-0.5px' }}>{v}</div>
            <div style={{ color: C.gray3, fontSize: 'clamp(10px, 1.2vw, 12px)', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductPreview() {
  const rows = [
    { name: 'Ana Rivera',  dept: 'Engineering', status: 'Present',  time: '08:02', sc: { color: '#6ee7b7', bg: 'rgba(110,231,183,0.12)' } },
    { name: 'Ben Kwon',    dept: 'Sales',        status: 'Late',     time: '09:41', sc: { color: '#fcd34d', bg: 'rgba(252,211,77,0.12)'  } },
    { name: 'Chloe Tan',   dept: 'Design',       status: 'On leave', time: '—',    sc: { color: '#93c5fd', bg: 'rgba(147,197,253,0.12)' } },
    { name: 'David Osei',  dept: 'Engineering',  status: 'Present',  time: '07:58', sc: { color: '#6ee7b7', bg: 'rgba(110,231,183,0.12)' } },
    { name: 'Elena Park',  dept: 'HR',           status: 'Present',  time: '08:15', sc: { color: '#6ee7b7', bg: 'rgba(110,231,183,0.12)' } },
  ];

  return (
    <section style={{ padding: `0 clamp(16px, 4vw, 32px) clamp(60px, 9vw, 96px)` }}>
      <div style={{ maxWidth: 900, margin: '0 auto', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }}>
        {/* Chrome bar */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />)}
          <span style={{ marginLeft: 12, color: C.gray3, fontSize: 11, fontFamily: 'monospace' }}>ERJ · Dashboard</span>
        </div>

        <div style={{ padding: 'clamp(16px, 3vw, 28px) clamp(16px, 3vw, 28px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'clamp(14px, 2vw, 20px)', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ color: C.white, fontWeight: 700, fontSize: 'clamp(13px, 1.8vw, 15px)' }}>Today's attendance</div>
              <div style={{ color: C.gray3, fontSize: 12, marginTop: 3 }}>Wednesday, Jun 10 · 47 employees</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ l: 'Present', v: 41, c: '#6ee7b7' }, { l: 'Absent', v: 3, c: '#fca5a5' }, { l: 'Leave', v: 3, c: '#93c5fd' }].map(s => (
                <div key={s.l} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 'clamp(6px,1vw,10px) clamp(10px,1.5vw,14px)', textAlign: 'center', minWidth: 52 }}>
                  <div style={{ color: s.c, fontWeight: 800, fontSize: 'clamp(14px, 2vw, 18px)' }}>{s.v}</div>
                  <div style={{ color: C.gray3, fontSize: 10, marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Employee', 'Department', 'Status', 'Clock-in'].map(h => (
                  <th key={h} style={{ textAlign: 'left', color: C.gray3, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', paddingBottom: 10, paddingRight: 16 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} style={{ borderBottom: i < rows.length - 1 ? `1px solid rgba(75,86,148,0.1)` : 'none' }}>
                  <td style={{ padding: 'clamp(8px,1.2vw,12px) 16px clamp(8px,1.2vw,12px) 0', color: C.gray1, fontSize: 'clamp(11px,1.4vw,13px)', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: 'clamp(8px,1.2vw,12px) 16px clamp(8px,1.2vw,12px) 0', color: C.gray3, fontSize: 'clamp(11px,1.4vw,13px)' }}>{r.dept}</td>
                  <td style={{ padding: 'clamp(8px,1.2vw,12px) 16px clamp(8px,1.2vw,12px) 0' }}>
                    <span style={{ background: r.sc.bg, color: r.sc.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>{r.status}</span>
                  </td>
                  <td style={{ padding: 'clamp(8px,1.2vw,12px) 0', color: C.gray2, fontSize: 12, fontFamily: 'monospace' }}>{r.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" style={{ padding: `clamp(56px, 9vw, 96px) clamp(16px, 4vw, 32px)`, borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(36px, 6vw, 60px)' }}>
          <div style={{ color: C.accent, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>What's included</div>
          <h2 style={{ color: C.white, fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.8px', marginBottom: 12 }}>Everything a growing team needs</h2>
          <p style={{ color: C.gray2, fontSize: 'clamp(14px, 1.8vw, 17px)', lineHeight: 1.6, maxWidth: 500, margin: '0 auto' }}>From the first clock-in to the end-of-month report, ERJ Smart Solutions covers the full HR operations cycle.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 'clamp(12px, 2vw, 18px)' }}>
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title}
              style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 'clamp(18px, 2.5vw, 28px)', cursor: 'default', transition: 'border-color 0.15s, background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHov; e.currentTarget.style.background = C.bgCardHov; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bgCard; }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.brandGlow, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: `1px solid rgba(75,86,148,0.3)` }}>
                <Icon size={17} color={C.brandMid} />
              </div>
              <div style={{ color: C.white, fontWeight: 700, fontSize: 'clamp(13px, 1.5vw, 15px)', marginBottom: 8 }}>{title}</div>
              <div style={{ color: C.gray2, fontSize: 'clamp(12px, 1.3vw, 13px)', lineHeight: 1.65 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: `clamp(56px, 9vw, 96px) clamp(16px, 4vw, 32px)`, borderTop: `1px solid ${C.border}`, background: 'rgba(75,86,148,0.04)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(36px, 6vw, 60px)' }}>
          <div style={{ color: C.accent, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>How it works</div>
          <h2 style={{ color: C.white, fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.8px' }}>Up and running in an afternoon</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 'clamp(20px, 3vw, 28px)' }}>
          {STEPS.map(({ icon: Icon, title, desc }, i) => (
            <div key={title} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ position: 'relative', width: 44, height: 44, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={17} color={C.brandMid} />
                  <div style={{ position: 'absolute', top: -9, right: -9, width: 22, height: 22, borderRadius: '50%', background: C.brand, color: C.accent, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                </div>
                <div style={{ color: C.white, fontWeight: 700, fontSize: 'clamp(13px, 1.5vw, 15px)', lineHeight: 1.3 }}>{title}</div>
              </div>
              <div style={{ color: C.gray2, fontSize: 'clamp(12px, 1.3vw, 13px)', lineHeight: 1.65, paddingLeft: 56 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section style={{ padding: `clamp(56px, 9vw, 96px) clamp(16px, 4vw, 32px)`, borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 5vw, 52px)' }}>
          <div style={{ color: C.accent, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Customers</div>
          <h2 style={{ color: C.white, fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.8px' }}>Trusted by HR teams of all sizes</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 'clamp(12px, 2vw, 18px)' }}>
          {TESTIMONIALS.map(({ quote, name, role }) => (
            <div key={name} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 'clamp(18px, 2.5vw, 28px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 2 }}>
                {[...Array(5)].map((_, i) => <Star key={i} size={13} color="#EAE0CF" fill="#EAE0CF" />)}
              </div>
              <p style={{ color: C.gray1, fontSize: 'clamp(13px, 1.4vw, 14px)', lineHeight: 1.7, flex: 1 }}>"{quote}"</p>
              <div>
                <div style={{ color: C.white, fontSize: 13, fontWeight: 700 }}>{name}</div>
                <div style={{ color: C.gray3, fontSize: 11, marginTop: 3 }}>{role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing({ onGetStarted }) {
  return (
    <section id="pricing" style={{ padding: `clamp(56px, 9vw, 96px) clamp(16px, 4vw, 32px)`, borderTop: `1px solid ${C.border}`, background: 'rgba(75,86,148,0.04)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 5vw, 52px)' }}>
          <div style={{ color: C.accent, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Pricing</div>
          <h2 style={{ color: C.white, fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.8px', marginBottom: 12 }}>Pay only for who you enroll</h2>
          <p style={{ color: C.gray2, fontSize: 'clamp(14px, 1.8vw, 16px)' }}>Remove an employee, stop paying for them. No commitments you can't change.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 'clamp(12px, 2vw, 18px)', marginBottom: 'clamp(24px, 4vw, 40px)' }}>
          {PLANS.map(p => (
            <div key={p.name} style={{ position: 'relative', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 'clamp(20px, 3vw, 32px) clamp(16px, 2.5vw, 28px)', textAlign: 'center' }}>
              {p.badge && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: p.color, color: '#111844', fontSize: 10, fontWeight: 800, padding: '3px 12px', borderRadius: 999 }}>{p.badge}</div>
              )}
              <div style={{ color: C.white, fontWeight: 700, fontSize: 'clamp(14px, 1.8vw, 17px)', marginBottom: 4 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3, margin: '14px 0 8px' }}>
                <span style={{ color: C.accent, fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 800 }}>${p.price}</span>
                <span style={{ color: C.gray3, fontSize: 12 }}>/emp/mo</span>
              </div>
              <div style={{ color: C.gray3, fontSize: 12 }}>Up to {p.seats} employees</div>
              <div style={{ width: '100%', height: 2, background: p.color, borderRadius: 2, marginTop: 20, opacity: 0.6 }} />
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button onClick={onGetStarted}
            style={{ background: C.brand, color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(12px, 2vw, 16px) clamp(24px, 3vw, 36px)', fontSize: 'clamp(14px, 1.8vw, 16px)', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 40px rgba(75,86,148,0.35)' }}
            onMouseEnter={e => e.currentTarget.style.background = C.brandDark}
            onMouseLeave={e => e.currentTarget.style.background = C.brand}
          >Start 14-day free trial <ArrowRight size={15} /></button>
          <p style={{ color: C.gray3, fontSize: 12, marginTop: 12 }}>Full access during trial · No credit card · Cancel any time</p>
        </div>
      </div>
    </section>
  );
}

function Footer({ onLogin }) {
  return (
    <footer style={{ borderTop: `1px solid ${C.border}`, padding: `clamp(24px, 4vw, 40px) clamp(16px, 4vw, 32px)` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.svg" alt="ERJ" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <div>
            <span style={{ color: C.white, fontWeight: 800, fontSize: 14 }}>ERJ</span>
            <span style={{ color: C.accent, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 6 }}>Smart Solutions</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <span style={{ color: C.gray3, fontSize: 12 }}>© {new Date().getFullYear()} ERJ Smart Solutions</span>
          {['Features', 'Pricing'].map(l => (
            <a key={l} href={`#${l.toLowerCase()}`} style={{ color: C.gray3, fontSize: 12, textDecoration: 'none' }}
              onMouseEnter={e => e.target.style.color = C.white}
              onMouseLeave={e => e.target.style.color = C.gray3}
            >{l}</a>
          ))}
          <button onClick={onLogin} style={{ background: 'none', border: 'none', color: C.gray3, fontSize: 12, cursor: 'pointer', padding: 0 }}
            onMouseEnter={e => e.target.style.color = C.white}
            onMouseLeave={e => e.target.style.color = C.gray3}
          >Sign in</button>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ────────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const goSignup = () => navigate('/pricing');
  const goLogin  = () => navigate('/login');

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <NavBar onLogin={goLogin} onGetStarted={goSignup} />
      <main>
        <Hero onGetStarted={goSignup} onViewPricing={goSignup} />
        <ProductPreview />
        <Features />
        <HowItWorks />
        <Testimonials />
        <Pricing onGetStarted={goSignup} />
      </main>
      <Footer onLogin={goLogin} />
    </div>
  );
}
