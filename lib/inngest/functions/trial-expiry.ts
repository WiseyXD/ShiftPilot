import { inngest } from "../client"
import { prisma } from "@/prisma/client"
import { sendEmail } from "@/lib/email/send"
import { NotificationEmail } from "@/lib/email/templates/notification"
import * as React from "react"

export const trialExpiryWarning = inngest.createFunction(
  {
    id: "trial-expiry-warning",
    triggers: [{ cron: "0 9 * * *" }],
  },
  async ({ step }) => {
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    const oneDayFromNow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)

    const expiringUsers = await step.run("find-expiring-trials", () =>
      prisma.user.findMany({
        where: {
          stripePlan: "TRIAL",
          trialEndsAt: { gte: oneDayFromNow, lte: threeDaysFromNow },
        },
      })
    )

    await step.run("send-warning-emails", async () => {
      for (const user of expiringUsers) {
        const daysLeft = Math.ceil(
          (new Date(user.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
        await sendEmail({
          to: user.email,
          subject: `Your Covrly trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
          react: React.createElement(NotificationEmail, {
            heading: `Your trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
            body: "Don't lose access to Covrly. Subscribe to keep automated scheduling running.",
            ctaLabel: "Choose a plan",
            ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
          }),
        })
      }
    })

    return { warned: expiringUsers.length }
  }
)
