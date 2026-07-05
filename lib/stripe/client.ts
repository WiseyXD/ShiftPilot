import Stripe from "stripe"

// Lazy: Stripe's constructor throws without a key, and Next imports this
// module at build time (page-data collection) — create the client only when
// a Stripe call actually happens.
let _stripe: Stripe | null = null
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    _stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-04-22.dahlia",
    })
    return Reflect.get(_stripe, prop, _stripe)
  },
})

export const PLANS = {
  STARTER: {
    priceId: process.env.STRIPE_STARTER_PRICE_ID!,
    name: "Starter",
    amount: 2900,
  },
  PRO: {
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    name: "Pro",
    amount: 7900,
  },
} as const
