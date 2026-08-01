// src/utils/proration.js
//
// Upgrades used to just flip planId in the DB for free — the client got
// the new plan's features immediately but was never actually charged the
// difference until their existing nextBillingDate rolled around. This
// computes what they should be charged *right now* for the remainder of
// the current cycle, so an upgrade mid-cycle is a real, immediate charge
// rather than free access until next month.
//
// Downgrades deliberately are NOT prorated/refunded here — same as most
// SaaS billing, the value of the higher tier already consumed this cycle
// isn't clawed back; they just pay less starting next cycle.

const CYCLE_LENGTH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Object} params
 * @param {number} params.oldPrice   current plan's price per seat/month
 * @param {number} params.newPrice   target plan's price per seat/month
 * @param {number} params.seats      seats currently enrolled
 * @param {string|null} params.nextBillingDate  ISO date string, or null/unknown
 * @returns {number} prorated amount in PHP, rounded to 2 decimals. 0 if
 *   there's nothing to charge (same price, downgrade, or no seats).
 */
export function calculateProratedUpgradeAmount({ oldPrice, newPrice, seats, nextBillingDate }) {
  const priceDiff = newPrice - oldPrice;
  if (priceDiff <= 0 || !seats) return 0;

  const now = Date.now();
  const cycleEnd = nextBillingDate ? new Date(nextBillingDate).getTime() : now + CYCLE_LENGTH_DAYS * DAY_MS;
  const daysRemaining = Math.max(0, Math.min(CYCLE_LENGTH_DAYS, Math.ceil((cycleEnd - now) / DAY_MS)));

  const amount = priceDiff * seats * (daysRemaining / CYCLE_LENGTH_DAYS);
  return Math.round(amount * 100) / 100;
}
