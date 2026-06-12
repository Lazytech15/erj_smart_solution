import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, Users, BarChart3, Calendar, Shield, Zap,
  ArrowRight, CheckCircle, Building2,
  ClipboardList, TimerReset, Globe2, Star, ArrowLeft
} from 'lucide-react';

/* ─── Design tokens — white/light theme with indigo cards ──────── */
const C = {
  bg:         '#F3F4F4',
  bgSection:  '#ffffff',
  bgCard:     '#1e1b4b',           // indigo-900 card
  bgCardHov:  '#252265',           // slightly lighter indigo on hover
  bgCardAlt:  '#16144a',           // deeper for variety
  border:     'rgba(30,27,75,0.12)',
  borderHov:  'rgba(99,102,241,0.5)',
  brand:      '#6366f1',           // indigo-500
  brandDark:  '#4f46e5',           // indigo-600
  brandLight: 'rgba(99,102,241,0.12)',
  accent:     '#a5b4fc',           // indigo-300 — on dark cards
  accentWarm: '#818cf8',           // indigo-400
  white:      '#ffffff',
  ink:        '#0f172a',           // near-black for light bg text
  inkMid:     '#475569',           // slate-600 for light bg subtext
  inkLight:   '#94a3b8',           // slate-400 for muted light bg text
  // on-card text
  cardText:   '#ffffff',
  cardSub:    'rgba(255,255,255,0.65)',
  cardMuted:  'rgba(255,255,255,0.4)',
  // nav
  nav:        'rgba(255,255,255,0.92)',
  navBorder:  'rgba(30,27,75,0.08)',
};

/* ─── Static data ─────────────────────────────────────────────── */
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

/* ─── Custom Reusable Scroll Reveal Hook ──────────────────────── */
function UseScrollReveal() {
  const domRef = useRef();
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-visible');
        }
      });
    }, { threshold: 0.1 });
    
    if (domRef.current) observer.observe(domRef.current);
    return () => { if (domRef.current) observer.unobserve(domRef.current); };
  }, []);
  return domRef;
}

/* ─── Components ──────────────────────────────────────────────── */

function NavBar({ onLogin, onGetStarted }) {
  const handleScroll = (e, id) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: C.nav,
      backdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${C.navBorder}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px)', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logo and Nav links grouped left to balance layout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(20px, 4vw, 40px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
              <img src="/logo.svg" alt="ERJ" style={{ width: 20, height: 20, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
            </div>
            <div>
              <span style={{ color: C.ink, fontWeight: 800, fontSize: 'clamp(13px, 2vw, 15px)', letterSpacing: '-0.3px' }}>ERJ</span>
              <span style={{ color: C.brand, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 6 }}>Smart Solutions</span>
            </div>
          </div>

          <nav style={{ display: 'flex', gap: 'clamp(16px, 3vw, 24px)', alignItems: 'center' }}>
            {['Features', 'How it works', 'Pricing'].map(l => {
              const targetId = l.toLowerCase().replace(/ /g, '-');
              return (
                <a key={l} href={`#${targetId}`}
                  onClick={(e) => handleScroll(e, targetId)}
                  style={{ color: C.inkMid, fontSize: 'clamp(12px, 1.5vw, 14px)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
                  onMouseEnter={e => e.target.style.color = C.brand}
                  onMouseLeave={e => e.target.style.color = C.inkMid}
                >{l}</a>
              );
            })}
          </nav>
        </div>

        {/* Actions split cleanly to the right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onLogin}
            style={{ background: 'none', border: `1px solid ${C.border}`, color: C.inkMid, fontSize: 'clamp(12px, 1.5vw, 13px)', fontWeight: 600, cursor: 'pointer', padding: '7px 16px', borderRadius: 10, transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
            onMouseEnter={e => { e.currentTarget.style.color = C.ink; e.currentTarget.style.borderColor = C.brand; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.inkMid; e.currentTarget.style.borderColor = C.border; }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={e => e.currentTarget.style.transform = 'none'}
          >Sign in</button>
          <button onClick={onGetStarted}
            style={{ background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, color: '#fff', border: 'none', borderRadius: 10, padding: 'clamp(7px, 1vw, 9px) clamp(14px, 2vw, 20px)', fontSize: 'clamp(12px, 1.5vw, 13px)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 14px rgba(99,102,241,0.28)', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.38)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.28)'; }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={e => e.currentTarget.style.transform = 'translateY(-1px)'}
          >Get started <ArrowRight size={13} style={{ transition: 'transform 0.2s' }} /></button>
        </div>
      </div>
    </header>
  );
}

function Hero({ onGetStarted, onViewPricing }) {
  return (
    <section style={{ textAlign: 'center', padding: 'clamp(48px, 8vw, 88px) clamp(16px, 4vw, 32px) clamp(48px, 8vw, 80px)', position: 'relative', overflow: 'hidden', background: C.bgSection }}>
      {/* Cohesive top brand line animation hook */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.brand}, #8b5cf6, ${C.brand})` }} />
      <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 'clamp(400px, 70vw, 700px)', height: 300, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="reveal-visible" style={{ animation: 'fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 999, background: 'rgba(99,102,241,0.06)', border: `1px solid rgba(99,102,241,0.15)`, color: C.brand, fontSize: 'clamp(11px, 1.5vw, 13px)', fontWeight: 600, marginBottom: '20px' }}>
          <Zap size={11} /> 14-day free trial · No credit card required
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 'clamp(36px, 5.5vw, 62px)', fontWeight: 800, color: C.ink, lineHeight: 1.1, letterSpacing: '-1.5px', maxWidth: 840, margin: '0 auto 20px' }}>
          Attendance tracking your{' '}
          <span style={{ background: `linear-gradient(135deg, ${C.brand}, #8b5cf6)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            whole team
          </span>{' '}
          will actually use
        </h1>

        {/* Subhead with conversion copy fix */}
        <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: C.inkMid, lineHeight: 1.65, maxWidth: 580, margin: `0 auto 36px` }}>
          Clock-ins, leave approvals, shift schedules, and payroll-ready reports — in one system that takes minutes to set up for your entire team.
          </p>

        {/* Clear Action Hierarchy CTAs */}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={onGetStarted}
            style={{ background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(12px, 2vw, 15px) clamp(28px, 3.5vw, 36px)', fontSize: 'clamp(14px, 1.8vw, 15px)', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(99,102,241,0.25)', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(99,102,241,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.25)'; }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          >Start free trial <ArrowRight size={15} /></button>
          
          <button onClick={onViewPricing}
            style={{ background: 'transparent', color: C.inkMid, border: 'none', borderRadius: 12, padding: '12px 20px', fontSize: 'clamp(14px, 1.8vw, 15px)', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = C.brand; e.currentTarget.children[0].style.transform = 'translateX(3px)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.inkMid; e.currentTarget.children[0].style.transform = 'none'; }}
          >See pricing <span style={{ transition: 'transform 0.2s', display: 'inline-block' }}>→</span></button>
        </div>

        {/* High-contrast metrics bar with improved internal vertical padding */}
        <div style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'clamp(20px, 4vw, 44px)', marginTop: 'clamp(44px, 6vw, 60px)', padding: 'clamp(24px, 3.5vw, 32px) clamp(24px, 5vw, 56px)', borderRadius: 24, background: C.bgCard, boxShadow: '0 12px 40px rgba(30,27,75,0.16)' }}>
          {[
            { v: '98%',  l: 'attendance accuracy' },
            { v: '<2 min', l: 'setup time' },
            { v: '14 days',l: 'free trial' },
            { v: '₱150/mo',l: 'starting price' },
          ].map(({ v, l }) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ color: C.accent,尊貴: '800', fontWeight: 800, fontSize: 'clamp(18px, 2.5vw, 26px)', letterSpacing: '-0.5px' }}>{v}</div>
              <div style={{ color: C.cardMuted, fontSize: 'clamp(10px, 1.2vw, 12px)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const revealRef = UseScrollReveal();
  return (
    <section id="features" style={{ padding: `clamp(64px, 9vw, 96px) clamp(16px, 4vw, 32px)`, background: C.bg }}>
      <div ref={revealRef} className="reveal-element" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 5vw, 52px)' }}>
          <div style={{ display: 'inline-block', color: C.brand, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '4px 14px', borderRadius: 999, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>Features</div>
          <h2 style={{ color: C.ink, fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.8px', marginTop: 12 }}>Everything your HR team needs</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(290px, 100%), 1fr))', gap: 'clamp(14px, 2vw, 20px)' }}>
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title}
              style={{ background: C.bgCard, border: `1px solid rgba(99,102,241,0.15)`, borderRadius: 20, padding: 'clamp(24px, 2.5vw, 32px)', transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s, background-color 0.2s', boxShadow: '0 4px 16px rgba(30,27,75,0.04)' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgCardHov; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 16px 36px rgba(30,27,75,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.bgCard; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(30,27,75,0.04)'; }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Icon size={20} color={C.accent} />
              </div>
              <div style={{ color: C.cardText, fontWeight: 700, fontSize: 'clamp(14px, 1.5vw, 16px)', marginBottom: 8 }}>{title}</div>
              <div style={{ color: C.cardSub, fontSize: 'clamp(12px, 1.3vw, 13.5px)', lineHeight: 1.65 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const revealRef = UseScrollReveal();
  return (
    <section id="how-it-works" style={{ padding: `clamp(64px, 9vw, 96px) clamp(16px, 4vw, 32px)`, background: C.bgSection }}>
      <div ref={revealRef} className="reveal-element" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 5vw, 52px)' }}>
          <div style={{ display: 'inline-block', color: C.brand, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '4px 14px', borderRadius: 999, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>How it works</div>
          <h2 style={{ color: C.ink, fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.8px', marginTop: 12 }}>Up and running in minutes</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 'clamp(14px, 2vw, 20px)' }}>
          {STEPS.map(({ icon: Icon, title, desc }, i) => (
            <div key={title} style={{ background: C.bgCard, border: `1px solid rgba(99,102,241,0.15)`, borderRadius: 20, padding: 'clamp(24px, 2.5vw, 32px)', position: 'relative', boxShadow: '0 4px 16px rgba(30,27,75,0.04)' }}>
              <div style={{ position: 'relative', width: 46, height: 46, marginBottom: 20 }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(99,102,241,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={19} color={C.accent} />
                </div>
                <div style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(99,102,241,0.35)' }}>{i + 1}</div>
              </div>
              <div style={{ color: C.cardText, fontWeight: 700, fontSize: 'clamp(14px, 1.5vw, 16px)', marginBottom: 8 }}>{title}</div>
              <div style={{ color: C.cardSub, fontSize: 'clamp(12px, 1.3vw, 13.5px)', lineHeight: 1.65 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const revealRef = UseScrollReveal();
  return (
    <section style={{ padding: `clamp(64px, 9vw, 96px) clamp(16px, 4vw, 32px)`, background: C.bg }}>
      <div ref={revealRef} className="reveal-element" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 5vw, 52px)' }}>
          <div style={{ display: 'inline-block', color: C.brand, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '4px 14px', borderRadius: 999, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>Customers</div>
          <h2 style={{ color: C.ink, fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.8px', marginTop: 12 }}>Trusted by HR teams of all sizes</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 'clamp(14px, 2vw, 20px)' }}>
          {TESTIMONIALS.map(({ quote, name, role }) => (
            <div key={name} style={{ background: C.bgCard, border: `1px solid rgba(99,102,241,0.15)`, borderRadius: 20, padding: 'clamp(24px, 2.5vw, 32px)', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 4px 16px rgba(30,27,75,0.04)' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[...Array(5)].map((_, i) => <Star key={i} size={13} color={C.accent} fill={C.accent} />)}
              </div>
              <p style={{ color: C.cardSub, fontSize: 'clamp(13px, 1.4vw, 14.5px)', lineHeight: 1.7, flex: 1, fontStyle: 'italic' }}>"{quote}"</p>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
                <div style={{ color: C.cardText, fontSize: 13.5, fontWeight: 700 }}>{name}</div>
                <div style={{ color: C.cardMuted, fontSize: 11.5, marginTop: 4 }}>{role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing({ onGetStarted }) {
  const revealRef = UseScrollReveal();
  return (
    <section id="pricing" style={{ padding: `clamp(64px, 9vw, 96px) clamp(16px, 4vw, 32px)`, background: C.bgSection }}>
      <div ref={revealRef} className="reveal-element" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 5vw, 52px)' }}>
          <div style={{ display: 'inline-block', color: C.brand, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '4px 14px', borderRadius: 999, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>Pricing</div>
          <h2 style={{ color: C.ink, fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 800, letterSpacing: '-0.8px', marginTop: 12, marginBottom: 12 }}>Pay only for who you enroll</h2>
          <p style={{ color: C.inkMid, fontSize: 'clamp(14px, 1.8vw, 16px)' }}>Remove an employee, stop paying for them. No commitments you can't change.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 'clamp(16px, 2.5vw, 24px)', marginBottom: 'clamp(32px, 5vw, 48px)', alignItems: 'center' }}>
          {PLANS.map(p => (
            <div key={p.name}
              style={{ position: 'relative', background: C.bgCard, border: p.badge ? `2px solid ${C.brand}` : `1px solid rgba(99,102,241,0.15)`, borderRadius: 22, padding: p.badge ? 'clamp(32px, 4vw, 44px) clamp(16px, 2.5vw, 28px)' : 'clamp(24px, 3vw, 36px) clamp(16px, 2.5vw, 28px)', textAlign: 'center', transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s', boxShadow: p.badge ? '0 8px 32px rgba(99,102,241,0.15)' : '0 4px 16px rgba(30,27,75,0.04)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = '0 20px 44px rgba(30,27,75,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = p.badge ? '0 8px 32px rgba(99,102,241,0.15)' : '0 4px 16px rgba(30,27,75,0.04)'; }}
            >
              {p.badge && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: `linear-gradient(135deg, ${C.brand}, #8b5cf6)`, color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(99,102,241,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.badge}</div>
              )}
              <div style={{ color: C.cardText, fontWeight: 700, fontSize: 'clamp(15px, 1.8vw, 18px)', marginBottom: 6 }}>{p.name}</div>
              {p.originalPrice && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: C.cardMuted, fontSize: 12, textDecoration: 'line-through' }}>₱{p.originalPrice}</span>
                  <span style={{ background: p.color, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{p.discount}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3, margin: '12px 0' }}>
                <span style={{ color: C.accent, fontSize: 'clamp(32px, 4.5vw, 44px)', fontWeight: 800, letterSpacing: '-1px' }}>₱{p.price}</span>
                <span style={{ color: C.cardMuted, fontSize: 12.5 }}>/emp/mo</span>
              </div>
              <div style={{ color: C.cardSub, fontSize: 12.5, marginBottom: 4 }}>Up to {p.seats} employees</div>
              <div style={{ width: '100%', height: 2, background: `linear-gradient(90deg, ${C.brand}, #8b5cf6)`, borderRadius: 2, marginTop: 20, opacity: 0.4 }} />
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button onClick={onGetStarted}
            style={{ background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: 'clamp(12px, 2vw, 16px) clamp(28px, 3.5vw, 40px)', fontSize: 'clamp(14px, 1.8vw, 15px)', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(99,102,241,0.25)', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(99,102,241,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.25)'; }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          >Start 14-day free trial <ArrowRight size={15} /></button>
          <p style={{ color: C.inkLight, fontSize: 12, marginTop: 14 }}>Full access during trial · No credit card · Cancel any time</p>
        </div>
      </div>
    </section>
  );
}

function Footer({ onLogin }) {
  return (
    <footer style={{ borderTop: `1px solid ${C.border}`, padding: `clamp(28px, 4vw, 44px) clamp(16px, 4vw, 32px)`, background: C.bgSection }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/logo.svg" alt="ERJ" style={{ width: 16, height: 16, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          </div>
          <div>
            <span style={{ color: C.ink, fontWeight: 800, fontSize: 14 }}>ERJ</span>
            <span style={{ color: C.brand, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 6 }}>Smart Solutions</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <span style={{ color: C.inkLight, fontSize: 12 }}>© {new Date().getFullYear()} ERJ Smart Solutions</span>
          {['Features', 'Pricing'].map(l => (
            <a key={l} href={`#${l.toLowerCase()}`} style={{ color: C.inkLight, fontSize: 12, textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => e.target.style.color = C.brand}
              onMouseLeave={e => e.target.style.color = C.inkLight}
            >{l}</a>
          ))}
          <button onClick={onLogin} style={{ background: 'none', border: 'none', color: C.inkLight, fontSize: 12, cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.target.style.color = C.brand}
            onMouseLeave={e => e.target.style.color = C.inkLight}
          >Sign in</button>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page Container injecting global styles ───────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const goSignup = () => navigate('/pricing');
  const goLogin  = () => navigate('/login');

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Dynamic Keyframes Injection */}
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
      `}</style>
      
      <NavBar onLogin={goLogin} onGetStarted={goSignup} />
      <main>
        <Hero onGetStarted={goSignup} onViewPricing={goSignup} />
        <Features />
        <HowItWorks />
        <Testimonials />
        <Pricing onGetStarted={goSignup} />
      </main>
      <Footer onLogin={goLogin} />
    </div>
  );
}