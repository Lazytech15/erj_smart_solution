import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CreditCard, Users, Zap, Check, AlertTriangle, ArrowUpRight,
  Calendar, X, ChevronRight, Building2, ChevronDown, Star,
  MessageSquare, BarChart3, Fingerprint, Smartphone, Lock
} from 'lucide-react';
import { useSubscription, PLANS } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { SectionHeader, Modal, ProgressBar } from '../components/ui';
import { startCheckout } from '../utils/paymongo';
import { calculateProratedUpgradeAmount } from '../utils/proration';

const PLAN_ORDER = ['free_trial', 'starter', 'growth', 'enterprise'];

// What each plan upgrade unlocks (for the upgrade benefits modal)
const UPGRADE_PERKS = {
  starter: [
    { icon: Check,         color: '#26c6da', label: 'Email notifications',       desc: 'Daily summaries & late alerts sent to managers' },
    { icon: Smartphone,    color: '#26c6da', label: 'Mobile app access',          desc: 'Employees clock in from iOS & Android' },
    { icon: Users,         color: '#26c6da', label: 'Up to 25 employees',         desc: 'Grow your team beyond the trial limit' },
  ],
  growth: [
    { icon: BarChart3,     color: '#26a69a', label: 'Analytics & reports',        desc: 'Visual trends, department breakdowns, leave stats' },
    { icon: MessageSquare, color: '#26a69a', label: 'SMS notifications',          desc: 'Critical alerts sent directly to manager phones' },
    { icon: Calendar,      color: '#26a69a', label: 'Shift & department mgmt',    desc: 'Define shifts, assign departments, track overtime' },
    { icon: Users,         color: '#26a69a', label: 'Up to 200 employees',        desc: 'Scale your workforce without limits' },
  ],
  enterprise: [
    { icon: Fingerprint,   color: '#ef5350', label: 'Biometric device sync',      desc: 'NFC & fingerprint hardware integration' },
    { icon: Zap,           color: '#ef5350', label: 'API access & webhooks',       desc: 'Connect your own tools via full REST API' },
    { icon: Star,          color: '#ef5350', label: 'Dedicated account manager',  desc: 'Personal support and onboarding assistance' },
    { icon: Lock,          color: '#ef5350', label: 'SLA guarantee + encryption', desc: 'AES-256-GCM payloads and uptime commitment' },
  ],
};

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    subscription, currentPlan, seatsUsed, seatsAvailable, trialDaysLeft,
    upgradePlan, cancelSubscription, reactivateSubscription, refreshSubscription,
  } = useSubscription();

  const [changePlanModal, setChangePlanModal] = useState(false);
  const [cancelModal, setCancelModal]         = useState(false);
  const [selectedPlan, setSelectedPlan]       = useState(null);
  const [upgradePreview, setUpgradePreview]   = useState(null); // plan to show benefits for
  const [confirmDowngrade, setConfirmDowngrade] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false); // true while an upgrade checkout is in flight

  // ── Return trip from PayMongo Checkout (renewal) ────────────────────────
  // "Renew now" (below) sends the browser away to PayMongo's hosted Checkout
  // page; PayMongo brings it back here with ?checkout=success|cancelled (see
  // paymongo.js). paymongo-webhook is what actually flips status back to
  // "active" and rolls nextBillingDate forward — this effect just reflects
  // that back to the admin and makes sure we're showing the freshest data,
  // since the webhook update happens out-of-band from this redirect.
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (!checkout) return;

    if (checkout === 'success') {
      toast('Payment received — your subscription is renewed.', 'success');
      refreshSubscription();
    } else if (checkout === 'cancelled') {
      toast('Checkout was cancelled. You can renew any time from this page.', 'info');
    }
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('checkout');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (!subscription) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
          <Zap size={28} className="text-brand-600" />
        </div>
        <h2 className="text-lg font-bold text-ink-900 mb-2">No active subscription</h2>
        <p className="text-sm text-ink-400 mb-6">Start a plan to unlock all features.</p>
        <button onClick={() => navigate('/pricing')} className="btn-primary">
          View plans <ChevronRight size={14} />
        </button>
      </div>
    );
  }

  const currentIdx = PLAN_ORDER.indexOf(subscription.planId);
  const seatPct = currentPlan?.maxSeats === Infinity ? 10 : Math.round((seatsUsed / currentPlan.maxSeats) * 100);
  const nextBilling = subscription.billing?.nextBillingDate
    ? new Date(subscription.billing.nextBillingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';
  const monthlyTotal = currentPlan?.price === 0 ? 'Free' : `₱${(seatsUsed * currentPlan.price).toFixed(2)}`;
  const isTrial       = subscription.status === 'trialing';
  const isCancelled   = subscription.status === 'cancelled';
  const isGracePeriod = subscription.status === 'grace_period';
  const isSuspended   = subscription.status === 'suspended';

  function handleSelectPlan(planId) {
    if (planId === 'free_trial' && subscription.hasUsedTrial) return; // trial already consumed
    const targetIdx = PLAN_ORDER.indexOf(planId);
    setSelectedPlan(planId);
    // Show upgrade benefits if going up, no preview if same/down
    if (targetIdx > currentIdx && UPGRADE_PERKS[planId]) {
      setUpgradePreview(planId);
    } else {
      setUpgradePreview(null);
    }
  }

  function handleConfirmChange() {
    if (!selectedPlan || selectedPlan === subscription.planId) return;
    const targetIdx = PLAN_ORDER.indexOf(selectedPlan);
    if (targetIdx < currentIdx) {
      // Downgrade — show confirmation
      setConfirmDowngrade(true);
    } else {
      applyPlanChange();
    }
  }

  async function applyPlanChange() {
    const plan = PLANS.find(p => p.id === selectedPlan);
    const targetIdx = PLAN_ORDER.indexOf(selectedPlan);

    // Downgrades (and moving to the already-consumed free trial, which
    // upgradePlan() itself rejects) apply immediately, same as before — no
    // charge, no refund for the current cycle's unused higher-tier value.
    if (targetIdx <= currentIdx) {
      try {
        upgradePlan(selectedPlan);
        toast(`Switched to ${plan?.name} plan!`, 'success');
      } catch (err) {
        toast(err.message || 'Could not change plan.', 'error');
        return;
      }
      setChangePlanModal(false);
      setConfirmDowngrade(false);
      setSelectedPlan(null);
      setUpgradePreview(null);
      return;
    }

    // Upgrades: charge the prorated difference for the rest of the current
    // cycle right now via PayMongo, instead of granting the higher tier for
    // free until nextBillingDate. The plan itself only changes once the
    // webhook confirms this payment (see paymongo-webhook's `changeType:
    // "plan_change"` handling) — not optimistically here.
    const prorated = calculateProratedUpgradeAmount({
      oldPrice: currentPlan?.price ?? 0,
      newPrice: plan?.price ?? 0,
      seats: seatsUsed,
      nextBillingDate: subscription.billing?.nextBillingDate,
    });

    if (prorated <= 0) {
      // Nothing to charge (e.g. same price) — just apply it.
      try {
        upgradePlan(selectedPlan);
        toast(`Switched to ${plan?.name} plan!`, 'success');
      } catch (err) {
        toast(err.message || 'Could not change plan.', 'error');
        return;
      }
      setChangePlanModal(false);
      setSelectedPlan(null);
      setUpgradePreview(null);
      return;
    }

    setChangingPlan(true);
    try {
      await startCheckout({
        subscriptionId: subscription.subscriptionId,
        planId: selectedPlan,
        planName: plan?.name,
        amountPhp: prorated,
        seats: seatsUsed,
        email: subscription.company?.adminEmail,
        changeType: 'plan_change',
        successUrl: `${window.location.origin}/app/subscription?checkout=success`,
        cancelUrl: `${window.location.origin}/app/subscription?checkout=cancelled`,
      });
      // startCheckout() redirects the browser on success — nothing left to do here.
    } catch (err) {
      setChangingPlan(false);
      toast(err.message || 'Could not start checkout. Please try again.', 'error');
    }
  }

  function handleCancel() {
    cancelSubscription();
    const until = subscription.billing?.nextBillingDate
      ? new Date(subscription.billing.nextBillingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'the end of your current billing period';
    toast(`Subscription set to cancel. You'll keep full access until ${until}.`, 'warning');
    setCancelModal(false);
  }

  function handleUndoCancel() {
    reactivateSubscription();
    toast('Cancellation undone — your subscription will continue as normal.', 'success');
  }

  async function handleRenewNow() {
    if (!currentPlan || currentPlan.price === 0) return; // trial plans have nothing to renew
    setRenewing(true);
    try {
      await startCheckout({
        subscriptionId: subscription.subscriptionId,
        planId: subscription.planId,
        planName: currentPlan.name,
        amountPhp: seatsUsed * currentPlan.price,
        seats: seatsUsed,
        email: subscription.company?.adminEmail,
      });
      // startCheckout() redirects the browser on success — nothing left to do here.
    } catch (err) {
      setRenewing(false);
      toast(err.message || 'Could not start checkout. Please try again.', 'error');
    }
  }

  const selectedPlanData  = selectedPlan  ? PLANS.find(p => p.id === selectedPlan)  : null;
  const upgradePlanData   = upgradePreview ? PLANS.find(p => p.id === upgradePreview) : null;
  const isDowngrade       = selectedPlan && PLAN_ORDER.indexOf(selectedPlan) < currentIdx;
  const proratedPreview   = selectedPlanData && !isDowngrade
    ? calculateProratedUpgradeAmount({
        oldPrice: currentPlan?.price ?? 0,
        newPrice: selectedPlanData.price ?? 0,
        seats: seatsUsed,
        nextBillingDate: subscription.billing?.nextBillingDate,
      })
    : 0;

  return (
    <div className="space-y-5">
      <SectionHeader title="Subscription & Billing" description="Manage your plan, seats, and billing" />

      {/* Trial banner */}
      {isTrial && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-brand-50 border border-brand-200">
          <Zap size={16} className="text-brand-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-brand-800">
              {trialDaysLeft > 0 ? `${trialDaysLeft} days left in your free trial` : 'Trial ended'}
            </p>
            <p className="text-xs text-brand-600 mt-0.5">After the trial, upgrade to a paid plan to continue.</p>
          </div>
          <button onClick={() => setChangePlanModal(true)} className="btn-primary btn-sm shrink-0">
            Activate plan
          </button>
        </div>
      )}

      {/* Pending cancellation banner — cancelSubscription() no longer locks
          anything immediately; this just reflects the intent until the
          period actually ends (see subscription-lifecycle cron). */}
      {subscription.cancelAtPeriodEnd && !isCancelled && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-warning-50 border border-warning-200">
          <AlertTriangle size={16} className="text-warning-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warning-800">Subscription set to cancel</p>
            <p className="text-xs text-warning-600 mt-0.5">
              You'll keep full access until {nextBilling}, then your workspace switches to read-only mode.
            </p>
          </div>
          <button onClick={handleUndoCancel} className="btn-secondary btn-sm shrink-0">Keep subscription</button>
        </div>
      )}

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-danger-50 border border-danger-200">
          <AlertTriangle size={16} className="text-danger-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-danger-800">Subscription cancelled</p>
            <p className="text-xs text-danger-600 mt-0.5">Your workspace is in read-only mode. Reactivate to continue.</p>
          </div>
          <button onClick={() => navigate('/pricing')} className="btn-danger btn-sm shrink-0">Reactivate</button>
        </div>
      )}

      {/* Grace period banner — payment failed, but the system stays fully usable for 7 days */}
      {isGracePeriod && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-warning-50 border border-warning-200">
          <AlertTriangle size={16} className="text-warning-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warning-800">Payment failed</p>
            <p className="text-xs text-warning-600 mt-0.5">
              We couldn't process your last payment. Pay now to avoid a suspension.
            </p>
          </div>
          <button onClick={handleRenewNow} disabled={renewing} className="btn-primary btn-sm shrink-0">
            {renewing ? 'Redirecting…' : 'Pay now'}
          </button>
        </div>
      )}

      {/* Suspended banner — logins/clock-ins are blocked app-wide except this page */}
      {isSuspended && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-danger-50 border border-danger-200">
          <Lock size={16} className="text-danger-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-danger-800">Account suspended</p>
            <p className="text-xs text-danger-600 mt-0.5">
              Access is locked due to unresolved billing. Your data is safe — reactivate to restore access.
              Unresolved accounts are permanently deleted 30 days after suspension.
            </p>
          </div>
          <button onClick={handleRenewNow} disabled={renewing} className="btn-danger btn-sm shrink-0">
            {renewing ? 'Redirecting…' : 'Reactivate'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Current plan card */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-1">Current Plan</p>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-ink-900">{currentPlan?.name}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: isSuspended ? '#ef5350' : isGracePeriod ? '#f59e0b' : currentPlan?.color }}>
                  {isTrial ? 'TRIAL' : isCancelled ? 'CANCELLED' : isSuspended ? 'SUSPENDED' : isGracePeriod ? 'PAST DUE' : 'ACTIVE'}
                </span>
              </div>
              <p className="text-xs text-ink-400 mt-0.5">
                {currentPlan?.price === 0 ? 'Free 14-day trial' : `₱${currentPlan?.price}/employee/month`}
              </p>
            </div>
            {!isCancelled && (
              <button onClick={() => setChangePlanModal(true)} className="btn-secondary btn-sm">
                <ArrowUpRight size={13} /> Change plan
              </button>
            )}
          </div>

          {/* Seats */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-ink-700 flex items-center gap-1.5"><Users size={12} /> Employee seats</span>
              <span className="text-ink-500">
                {seatsUsed} used{currentPlan?.maxSeats !== Infinity && ` of ${currentPlan?.maxSeats}`}
              </span>
            </div>
            <ProgressBar value={seatPct} color={seatPct > 90 ? 'bg-danger-500' : seatPct > 70 ? 'bg-warning-500' : 'bg-brand-500'} />
            {seatsAvailable !== Infinity && seatsAvailable < 5 && seatsAvailable > 0 && (
              <p className="text-[11px] text-warning-600 mt-1">Only {seatsAvailable} seats remaining — consider upgrading.</p>
            )}
            {seatsAvailable === 0 && currentPlan?.maxSeats !== Infinity && (
              <p className="text-[11px] text-danger-600 mt-1">Seat limit reached. Upgrade to add more employees.</p>
            )}
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 gap-2">
            {currentPlan?.features.map(f => (
              <div key={f} className="flex items-center gap-1.5 text-xs text-ink-600">
                <Check size={11} className="text-success-500 shrink-0" /> {f}
              </div>
            ))}
          </div>
        </div>

        {/* Billing + workspace */}
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Billing</p>
              {!isTrial && !isCancelled && (
                <button onClick={handleRenewNow} disabled={renewing} className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
                  {renewing ? 'Redirecting…' : 'Renew now'}
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-ink-500">Monthly estimate</span>
                <span className="font-bold text-ink-900">{monthlyTotal}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-ink-500">Enrolled employees</span>
                <span className="font-semibold text-ink-700">{seatsUsed}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-ink-500">Next billing date</span>
                <span className="font-semibold text-ink-700">{nextBilling}</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-surface-100">
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Payment method</p>
              <div className="flex items-center gap-2">
                <div className="w-9 h-6 rounded bg-ink-800 flex items-center justify-center">
                  <CreditCard size={12} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-800">Paid via PayMongo Checkout</p>
                  <p className="text-[10px] text-ink-400">Card, GCash, or Maya — entered securely at each payment</p>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Workspace</p>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
                <Building2 size={15} className="text-brand-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-ink-900">{subscription.company.name}</p>
                <p className="text-[11px] text-ink-400">{subscription.company.industry}</p>
              </div>
            </div>
            <p className="text-[11px] text-ink-400">Admin: {subscription.company.adminName}</p>
          </div>

          {!isCancelled && !subscription.cancelAtPeriodEnd && (
            <button onClick={() => setCancelModal(true)} className="w-full text-xs text-danger-500 hover:text-danger-700 hover:underline text-center py-1">
              Cancel subscription
            </button>
          )}
        </div>
      </div>

      {/* ── Change Plan Modal ─────────────────────────────── */}
      <Modal open={changePlanModal} onClose={() => { setChangePlanModal(false); setSelectedPlan(null); setUpgradePreview(null); }}
        title="Change Plan" width="max-w-3xl"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setChangePlanModal(false); setSelectedPlan(null); setUpgradePreview(null); }}>Cancel</button>
            <button
              className={isDowngrade ? 'btn-danger' : 'btn-primary'}
              onClick={handleConfirmChange}
              disabled={!selectedPlan || selectedPlan === subscription.planId || changingPlan}
            >
              {changingPlan
                ? 'Redirecting to checkout…'
                : !selectedPlan || selectedPlan === subscription.planId
                ? 'Select a plan'
                : isDowngrade
                ? '⬇ Downgrade plan'
                : proratedPreview > 0
                ? `⬆ Upgrade plan — pay ₱${proratedPreview.toFixed(2)} now`
                : '⬆ Upgrade plan'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Plan picker — free_trial is excluded once the account has already
              used its one-time trial, so it can never be re-selected after
              it expires or the client moves to a paid plan. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PLANS.filter(p => p.id !== 'free_trial' || !subscription.hasUsedTrial).map(p => {
              const isCurrent = p.id === subscription.planId;
              const isPicked  = selectedPlan === p.id;
              const pidx      = PLAN_ORDER.indexOf(p.id);
              const isDown    = pidx < currentIdx;
              return (
                <button key={p.id} onClick={() => handleSelectPlan(p.id)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    isPicked  ? 'border-brand-500 bg-brand-50'
                    : isCurrent ? 'border-success-400 bg-success-50'
                    : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  {isCurrent && <span className="text-[10px] font-bold text-success-700 block mb-1">✓ Current</span>}
                  {isDown && !isCurrent && <span className="text-[10px] font-semibold text-warning-600 block mb-1">⬇ Downgrade</span>}
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-ink-900 text-sm">{p.name}</p>
                    {p.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: p.color }}>{p.badge}</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-400 mb-2">{p.price === 0 ? 'Free trial' : `₱${p.price}/emp/mo`}</p>
                  <ul className="space-y-1">
                    {p.features.slice(0, 3).map(f => (
                      <li key={f} className="text-[11px] text-ink-500 flex items-start gap-1">
                        <Check size={9} className="mt-0.5 shrink-0 text-success-500" /> {f}
                      </li>
                    ))}
                    {p.features.length > 3 && (
                      <li className="text-[11px] text-ink-400">+{p.features.length - 3} more</li>
                    )}
                  </ul>
                </button>
              );
            })}
          </div>

          {/* Upgrade benefits panel */}
          {upgradePreview && upgradePlanData && UPGRADE_PERKS[upgradePreview] && (
            <div className="rounded-xl p-4 border-2" style={{ borderColor: `${upgradePlanData.color}40`, background: `${upgradePlanData.color}08` }}>
              <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: upgradePlanData.color }}>
                ✦ What you unlock with {upgradePlanData.name}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {UPGRADE_PERKS[upgradePreview].map(perk => {
                  const PerkIcon = perk.icon;
                  return (
                    <div key={perk.label} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${perk.color}18` }}>
                        <PerkIcon size={14} style={{ color: perk.color }} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-ink-800">{perk.label}</p>
                        <p className="text-[11px] text-ink-400 mt-0.5">{perk.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Downgrade warning */}
          {isDowngrade && (
            <div className="rounded-xl p-4 bg-warning-50 border border-warning-200">
              <p className="text-xs font-semibold text-warning-800 flex items-center gap-1.5 mb-2">
                <AlertTriangle size={13} /> You're about to downgrade
              </p>
              <p className="text-xs text-warning-700">
                Switching to <strong>{selectedPlanData?.name}</strong> will immediately remove access to features not included in that plan.
                Your data is preserved, but some functionality will be locked until you upgrade again.
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Downgrade Confirm Modal ───────────────────────── */}
      <Modal open={confirmDowngrade} onClose={() => setConfirmDowngrade(false)}
        title="Confirm Downgrade" width="max-w-sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmDowngrade(false)}>Keep current plan</button>
            <button className="btn-danger" onClick={applyPlanChange}>Yes, downgrade</button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-warning-50 border border-warning-200">
            <p className="text-sm font-semibold text-warning-800 mb-1">
              Downgrade to {selectedPlanData?.name}?
            </p>
            <p className="text-xs text-warning-700">
              You'll lose access to features not included in the {selectedPlanData?.name} plan. This takes effect immediately.
            </p>
          </div>
          {/* Show what will be lost */}
          {selectedPlanData && (
            <div>
              <p className="text-xs font-semibold text-ink-600 mb-2">Features you'll lose:</p>
              <ul className="space-y-1.5">
                {currentPlan?.features
                  .filter(f => !selectedPlanData.features.includes(f))
                  .map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-danger-600">
                      <X size={11} className="shrink-0" /> {f}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-ink-400">Your data is always preserved. You can upgrade again any time.</p>
        </div>
      </Modal>

      {/* ── Cancel Subscription Modal ─────────────────────── */}
      <Modal open={cancelModal} onClose={() => setCancelModal(false)} title="Cancel Subscription"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCancelModal(false)}>Keep subscription</button>
            <button className="btn-danger" onClick={handleCancel}>Yes, cancel</button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-danger-50 border border-danger-100 text-sm text-danger-700">
            <p className="font-semibold mb-1">Are you sure you want to cancel?</p>
            <p className="text-xs">
              You'll keep full access until the end of your current billing period ({nextBilling}). After that,
              your workspace switches to read-only mode. Employee data is preserved.
            </p>
          </div>
          <ul className="text-xs text-ink-500 space-y-1.5">
            <li className="flex items-center gap-2"><X size={11} className="text-danger-400 shrink-0" /> Employees will no longer be able to clock in</li>
            <li className="flex items-center gap-2"><X size={11} className="text-danger-400 shrink-0" /> Reports and exports will be disabled</li>
            <li className="flex items-center gap-2"><Check size={11} className="text-success-500 shrink-0" /> All your data is retained for 90 days</li>
            <li className="flex items-center gap-2"><Check size={11} className="text-success-500 shrink-0" /> You can reactivate at any time</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}