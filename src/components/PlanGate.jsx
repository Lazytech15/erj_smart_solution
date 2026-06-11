import { useNavigate } from 'react-router-dom';
import { Lock, ArrowUpRight, Zap, BarChart3, FileText, Building2, Fingerprint, Webhook } from 'lucide-react';
import { useSubscription, PLANS } from '../context/SubscriptionContext';

const FEATURE_META = {
  reports: {
    icon: BarChart3,
    title: 'Analytics & Reports',
    description: 'Visual attendance trends, department breakdowns, and leave statistics to keep your team insights sharp.',
    requiredPlan: 'growth',
  },
  shifts: {
    icon: FileText,
    title: 'Shift Management',
    description: 'Define morning, day, afternoon, and night shifts and assign them to employees across your organisation.',
    requiredPlan: 'growth',
  },
  departments: {
    icon: Building2,
    title: 'Department Management',
    description: 'Organise employees into departments and filter attendance and leave reports by team.',
    requiredPlan: 'growth',
  },
  biometric: {
    icon: Fingerprint,
    title: 'Biometric Device Integration',
    description: 'Sync physical fingerprint and face-recognition devices directly to your attendance records.',
    requiredPlan: 'enterprise',
  },
  api: {
    icon: Webhook,
    title: 'API Access & Webhooks',
    description: 'Connect your own tools and automate workflows with a full REST API and real-time webhooks.',
    requiredPlan: 'enterprise',
  },
};

const PLAN_ORDER = ['free_trial', 'starter', 'growth', 'enterprise'];

/**
 * PlanGate wraps any page that requires a minimum plan tier.
 *
 * Usage:
 *   <PlanGate feature="reports">
 *     <ReportsPage />
 *   </PlanGate>
 *
 * `feature` must be one of the keys in FEATURE_META above.
 * If the current plan already includes the feature, children render normally.
 * Otherwise an upgrade prompt is shown.
 */
export default function PlanGate({ feature, children }) {
  const navigate = useNavigate();
  const { subscription, currentPlan } = useSubscription();

  const meta = FEATURE_META[feature];
  if (!meta) return children; // unknown feature key — fail open

  const planLimits = currentPlan?.limits ?? {};
  const hasAccess = planLimits[feature] === true;

  if (hasAccess) return children;

  // Determine the plan the user needs to upgrade to
  const requiredPlan = PLANS.find(p => p.id === meta.requiredPlan);
  const currentIndex = PLAN_ORDER.indexOf(subscription?.planId);
  const requiredIndex = PLAN_ORDER.indexOf(meta.requiredPlan);
  const isDowngrade = currentIndex > requiredIndex; // shouldn't happen but guard anyway

  const Icon = meta.icon;

  // Plans to show as upgrade options (everything above current)
  const upgradePlans = PLANS.filter(p => PLAN_ORDER.indexOf(p.id) > currentIndex);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-lg mx-auto">
      {/* Lock badge */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 relative"
        style={{ background: `${requiredPlan?.color}18` }}
      >
        <Icon size={26} style={{ color: requiredPlan?.color }} />
        <span
          className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-ink-800 border-2 border-white flex items-center justify-center"
        >
          <Lock size={11} className="text-white" />
        </span>
      </div>

      {/* Heading */}
      <p
        className="text-[11px] font-bold uppercase tracking-widest mb-2"
        style={{ color: requiredPlan?.color }}
      >
        {requiredPlan?.name} feature
      </p>
      <h2 className="text-xl font-bold text-ink-900 mb-2">{meta.title}</h2>
      <p className="text-sm text-ink-400 leading-relaxed mb-8">{meta.description}</p>

      {/* Upgrade plan cards */}
      {upgradePlans.length > 0 && (
        <div className={`grid gap-3 w-full mb-6 ${upgradePlans.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {upgradePlans.map(plan => (
            <div
              key={plan.id}
              className="card p-4 text-left border-2 transition-all"
              style={{ borderColor: `${plan.color}40` }}
            >
              {plan.badge && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white inline-block mb-2"
                  style={{ backgroundColor: plan.color }}
                >
                  {plan.badge}
                </span>
              )}
              <p className="font-bold text-ink-900 text-sm">{plan.name} Plan</p>
              <p className="text-xs text-ink-400 mb-3">${plan.price}/employee/month</p>
              <ul className="space-y-1.5">
                {plan.features.slice(0, 4).map(f => (
                  <li key={f} className="text-[11px] text-ink-500 flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0 text-success-500">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => navigate('/app/subscription')}
        className="btn-primary gap-2"
      >
        <Zap size={14} /> Upgrade plan <ArrowUpRight size={13} />
      </button>
      <p className="text-[11px] text-ink-300 mt-3">You're on the <strong className="text-ink-500">{currentPlan?.name}</strong> plan.</p>
    </div>
  );
}
