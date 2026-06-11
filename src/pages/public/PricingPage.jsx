import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, ArrowRight, Zap } from 'lucide-react';
import { PLANS } from '../../context/SubscriptionContext';

const ALL_FEATURES = [
  'Up to employees limit',
  'Clock-in / Clock-out',
  'Attendance records',
  'Basic leave management',
  'CSV export',
  'Email support',
  'Shift management',
  'Department management',
  'Analytics & reports',
  'Overtime tracking',
  'Priority support',
  'Biometric device integration',
  'API access & webhooks',
  'Custom attendance policies',
  'Dedicated account manager',
  'SLA guarantee',
];

const PLAN_CONFIG = {
  free_trial: {
    color: '#26c6da',
    colorDark: '#00acc1',
    colorLight: '#e0f7fa',
    colorShadow: 'rgba(38,198,218,0.18)',
    originalPrice: null,
    discount: null,
    includedFeatures: new Set([
      'Up to employees limit',
      'Clock-in / Clock-out',
      'Attendance records',
      'Basic leave management',
      'CSV export',
    ]),
  },
  starter: {
    color: '#26c6da',
    colorDark: '#0097a7',
    colorLight: '#e0f7fa',
    colorShadow: 'rgba(38,198,218,0.25)',
    originalPrice: null,
    discount: null,
    includedFeatures: new Set([
      'Up to employees limit',
      'Clock-in / Clock-out',
      'Attendance records',
      'Basic leave management',
      'CSV export',
      'Email support',
    ]),
  },
  growth: {
    color: '#26a69a',
    colorDark: '#00897b',
    colorLight: '#e0f2f1',
    colorShadow: 'rgba(38,166,154,0.25)',
    originalPrice: 320,
    discount: '20% OFF',
    includedFeatures: new Set([
      'Up to employees limit',
      'Clock-in / Clock-out',
      'Attendance records',
      'Basic leave management',
      'CSV export',
      'Email support',
      'Shift management',
      'Department management',
      'Analytics & reports',
      'Overtime tracking',
      'Priority support',
    ]),
  },
  enterprise: {
    color: '#ef5350',
    colorDark: '#e53935',
    colorLight: '#ffebee',
    colorShadow: 'rgba(239,83,80,0.25)',
    originalPrice: 530,
    discount: '25% OFF',
    includedFeatures: new Set([
      'Up to employees limit',
      'Clock-in / Clock-out',
      'Attendance records',
      'Basic leave management',
      'CSV export',
      'Email support',
      'Shift management',
      'Department management',
      'Analytics & reports',
      'Overtime tracking',
      'Priority support',
      'Biometric device integration',
      'API access & webhooks',
      'Custom attendance policies',
      'Dedicated account manager',
      'SLA guarantee',
    ]),
  },
};

function getFeatureLabel(feature, plan) {
  if (feature === 'Up to employees limit') {
    return plan.maxSeats === Infinity ? 'Unlimited employees' : `Up to ${plan.maxSeats} employees`;
  }
  return feature;
}

export default function PricingPage() {
  const navigate = useNavigate();
  const [hoveredPlan, setHoveredPlan] = useState(null);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: '#eef0f4', fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Nav */}
      <header
        className="flex items-center justify-between px-8 py-4 bg-white"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="ERJ Smart Solutions" className="h-8 w-auto" />
          <span className="font-bold text-slate-900 text-sm">ERJ Smart Solutions</span>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1.5"
        >
          Already have an account? Sign in <ArrowRight size={12} />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-10 max-w-xl">
          <div
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: '#e8f5e9', color: '#2e7d32' }}
          >
            <Zap size={11} /> Try free for 14 days · No credit card required
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">Choose your plan</h1>
          <p className="text-slate-500 text-sm">
            Pay per employee, scale as you grow. Cancel any time.
          </p>
        </div>

        {/* 4 cards — 2 cols on md, 4 cols on xl */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 w-full max-w-6xl">
          {PLANS.map(plan => {
            const cfg = PLAN_CONFIG[plan.id];
            const isHovered = hoveredPlan === plan.id;
            const isFree = plan.id === 'free_trial';

            return (
              <div
                key={plan.id}
                onMouseEnter={() => setHoveredPlan(plan.id)}
                onMouseLeave={() => setHoveredPlan(null)}
                className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-200"
                style={{
                  background: 'white',
                  boxShadow: isHovered
                    ? `0 12px 40px ${cfg.colorShadow}, 0 2px 8px rgba(0,0,0,0.08)`
                    : '0 2px 12px rgba(0,0,0,0.07)',
                  transform: isHovered ? 'translateY(-6px)' : 'none',
                  outline: isFree ? `2px dashed ${cfg.color}55` : 'none',
                }}
              >
                {/* Colored banner header */}
                <div
                  className="px-5 py-4 text-white text-center relative"
                  style={{
                    background: isFree
                      ? `repeating-linear-gradient(135deg, ${cfg.color} 0px, ${cfg.color} 10px, ${cfg.colorDark} 10px, ${cfg.colorDark} 20px)`
                      : `linear-gradient(135deg, ${cfg.color} 0%, ${cfg.colorDark} 100%)`,
                  }}
                >
                  {plan.badge && (
                    <div
                      className="absolute -top-1 -right-1 px-2.5 py-1 text-[10px] font-black uppercase rounded-bl-xl rounded-tr-xl"
                      style={{ background: 'rgba(0,0,0,0.22)', color: 'white', letterSpacing: '0.05em' }}
                    >
                      {plan.badge}
                    </div>
                  )}
                  <p className="font-black text-base uppercase tracking-widest">{plan.name} Plan</p>
                </div>

                {/* Price */}
                <div className="flex flex-col items-center pt-5 pb-3 px-5">
                  {isFree ? (
                    <>
                      <span className="text-4xl font-black" style={{ color: cfg.color }}>Free</span>
                      <span className="text-xs text-slate-400 mt-0.5">14-day trial · no card needed</span>
                    </>
                  ) : (
                    <>
                      {cfg.originalPrice && (
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-slate-400 line-through">₱{cfg.originalPrice}</span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                            style={{ background: cfg.color }}
                          >
                            {cfg.discount}
                          </span>
                        </div>
                      )}
                      <span className="text-4xl font-black" style={{ color: cfg.color }}>
                        ₱{plan.price}
                      </span>
                      <span className="text-xs text-slate-400 mt-0.5">/ employee / month</span>
                    </>
                  )}
                </div>

                {/* Divider */}
                <div className="mx-5 h-px" style={{ background: '#f1f5f9' }} />

                {/* Feature list */}
                <div className="flex-1 px-5 py-4">
                  <ul className="space-y-2">
                    {ALL_FEATURES.map(feature => {
                      const included = cfg.includedFeatures.has(feature);
                      const label = getFeatureLabel(feature, plan);
                      return (
                        <li key={feature} className="flex items-center gap-2 text-xs">
                          <div
                            className="shrink-0 flex items-center justify-center"
                            style={{
                              width: 17,
                              height: 17,
                              borderRadius: '50%',
                              background: included ? cfg.colorLight : '#f1f5f9',
                            }}
                          >
                            {included ? (
                              <Check size={9} style={{ color: cfg.color }} strokeWidth={3} />
                            ) : (
                              <X size={9} style={{ color: '#cbd5e1' }} strokeWidth={3} />
                            )}
                          </div>
                          <span style={{ color: included ? '#334155' : '#94a3b8' }}>{label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* CTA button */}
                <div className="px-5 pb-5">
                  <button
                    onClick={() => navigate(`/signup?plan=${plan.id}`)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-white transition-all duration-150"
                    style={{
                      background: isFree
                        ? `linear-gradient(135deg, ${cfg.color} 0%, ${cfg.colorDark} 100%)`
                        : `linear-gradient(135deg, ${cfg.color} 0%, ${cfg.colorDark} 100%)`,
                      boxShadow: isHovered ? `0 4px 14px ${cfg.colorShadow}` : 'none',
                      border: isFree ? `1.5px solid ${cfg.colorDark}` : 'none',
                    }}
                  >
                    {isFree ? '🚀 Start Free Trial' : 'Subscribe'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="mt-8 text-xs text-slate-400 text-center">
          Free Trial: 14 days, no credit card · Starter, Growth &amp; Enterprise activate immediately
        </p>

        {/* FAQ */}
        <div className="mt-14 max-w-2xl w-full">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest text-center mb-6">
            Common questions
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                q: 'What happens after the free trial?',
                a: 'After 14 days your workspace enters read-only mode. Upgrade to any paid plan to continue without losing data.',
              },
              {
                q: 'How does per-employee billing work?',
                a: 'You only pay for employees you manually enroll. Removed employees are not billed in the next cycle.',
              },
              {
                q: 'Can I change plans later?',
                a: 'Yes — upgrade or downgrade anytime from Settings > Subscription. Changes apply immediately.',
              },
              {
                q: 'Is there a setup fee?',
                a: 'None. Start your free trial with no payment required, then pay monthly per enrolled employee.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="p-4 rounded-xl bg-white border border-slate-100">
                <p className="text-xs font-semibold text-slate-800 mb-1.5">{q}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
