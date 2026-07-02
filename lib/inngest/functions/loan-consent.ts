import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { generateToken } from "@/lib/tokens/generate"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import { LoanConsentEmail } from "@/lib/email/templates/loan-consent"
import { formatRate } from "@/lib/marketplace/listings"
import * as React from "react"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL

const formatLoanDate = (date: Date) =>
  date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })

// Fires when both managers have agreed. Asks the worker, then waits durably for
// their tokenised answer — the /api/token handler mutates the deal and emits
// marketplace/loan.response; this function only narrates the outcome (or expires
// the deal if the worker never answers).
export const loanConsent = inngest.createFunction(
  { id: "loan-consent", triggers: [{ event: "marketplace/loan.agreed" }] },
  async ({ event, step }) => {
    const { dealId } = event.data as { dealId: string }

    const deal = await step.run("load-deal", () =>
      prisma.sharingDeal.findUnique({
        where: { id: dealId },
        include: {
          listing: true,
          employee: true,
          lenderLocation: { include: { owner: { select: { email: true } } } },
          borrowerLocation: { include: { owner: { select: { email: true } } } },
        },
      })
    )
    if (!deal) return { error: "Deal not found" }
    if (deal.status !== "MANAGERS_AGREED") return { skipped: `status is ${deal.status}` }

    const dateLabel = formatLoanDate(new Date(deal.listing.date))
    const window = `${deal.listing.startTime}–${deal.listing.endTime}`
    const summary = `${deal.listing.role} on ${dateLabel}, ${window}`
    const managers = [deal.lenderLocation.owner.email, deal.borrowerLocation.owner.email]

    await step.run("ask-worker", async () => {
      const [acceptToken, declineToken] = await Promise.all([
        generateToken(deal.employeeId, "ACCEPT_LOAN", { dealId }),
        generateToken(deal.employeeId, "DECLINE_LOAN", { dealId }),
      ])

      await sendEmail({
        to: deal.employee.email,
        subject: `Pick up a ${deal.listing.role} shift at ${deal.borrowerLocation.name}?`,
        react: React.createElement(LoanConsentEmail, {
          workerName: deal.employee.name,
          role: deal.listing.role,
          venueName: deal.borrowerLocation.name,
          venueAddress: deal.borrowerLocation.address,
          dateLabel,
          window,
          rateLabel: formatRate(deal.agreedRateCents),
          acceptUrl: `${APP_URL}/api/token/${acceptToken.id}`,
          declineUrl: `${APP_URL}/api/token/${declineToken.id}`,
        }),
      })
    })

    const response = await step.waitForEvent("wait-worker-response", {
      event: "marketplace/loan.response",
      match: "data.dealId",
      timeout: "24h",
    })

    if (!response) {
      await step.run("expire-deal", async () => {
        // Guarded: only expire if the worker really never answered.
        const { count } = await prisma.sharingDeal.updateMany({
          where: { id: dealId, status: "MANAGERS_AGREED" },
          data: { status: "EXPIRED" },
        })
        if (count === 0) return

        await prisma.sharingListing.updateMany({
          where: { id: deal.listingId, status: "MATCHED" },
          data: { status: "OPEN" },
        })

        await sendEmail({
          to: managers,
          subject: "Loan expired — the worker didn't respond",
          react: React.createElement(NotificationEmail, {
            heading: "Loan request expired",
            // No worker name here — the borrower manager gets this too, and the
            // name is only revealed on FILLED.
            body: `The worker didn't respond within 24 hours to the loan for ${summary}. The listing is open again.`,
            ctaLabel: "Open marketplace",
            ctaUrl: `${APP_URL}/dashboard/marketplace`,
          }),
        })
      })
      return { outcome: "expired" }
    }

    const accepted = response.data.response === "ACCEPT_LOAN"

    await step.run("notify-managers", async () => {
      await sendEmail({
        to: managers,
        subject: accepted
          ? `Loan filled: ${deal.listing.role} on ${dateLabel}`
          : "Worker declined the loan",
        react: React.createElement(NotificationEmail, {
          heading: accepted ? "The worker said yes — loan filled" : "The worker declined",
          body: accepted
            ? `${deal.employee.name} accepted the ${summary} loan from ${deal.lenderLocation.name} to ${deal.borrowerLocation.name} (${formatRate(deal.agreedRateCents)}).`
            : // Deliberately nameless: the borrower manager is a recipient and the
              // worker's name is only revealed on FILLED.
              `The worker declined the loan for ${summary}. The listing is open again for other venues.`,
          ctaLabel: "Open marketplace",
          ctaUrl: `${APP_URL}/dashboard/marketplace`,
        }),
      })
    })

    return { outcome: accepted ? "filled" : "worker_declined" }
  }
)
