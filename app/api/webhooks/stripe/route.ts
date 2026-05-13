import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe/client"
import { prisma } from "@/prisma/client"
import type { StripePlan } from "@/prisma/generated/client/client"
import type Stripe from "stripe"

function planFromSubscription(sub: Stripe.Subscription): StripePlan {
  if (sub.status !== "active" && sub.status !== "trialing") return "NONE"
  const priceId = sub.items.data[0]?.price.id
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO"
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "STARTER"
  return "NONE"
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          stripePlan: planFromSubscription(sub),
          stripeSubscriptionId: sub.id,
        },
      })
      break
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      await prisma.user.updateMany({
        where: { stripeCustomerId: sub.customer as string },
        data: { stripePlan: "NONE", stripeSubscriptionId: null },
      })
      break
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice
      await prisma.user.updateMany({
        where: { stripeCustomerId: invoice.customer as string },
        data: { stripePlan: "NONE" },
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
