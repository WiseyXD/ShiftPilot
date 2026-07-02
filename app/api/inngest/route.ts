import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { trialExpiryWarning } from "@/lib/inngest/functions/trial-expiry"
import { weeklyAvailabilityReminder } from "@/lib/inngest/functions/availability-reminder"
import { weeklyScheduleGeneration } from "@/lib/inngest/functions/schedule-generation"
import { shiftNotifications, shiftReminders } from "@/lib/inngest/functions/shift-notifications"
import { replacementEngine } from "@/lib/inngest/functions/replacement-engine"
import { swapBroker } from "@/lib/inngest/functions/swap-broker"
import { loanConsent } from "@/lib/inngest/functions/loan-consent"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    trialExpiryWarning,
    weeklyAvailabilityReminder,
    weeklyScheduleGeneration,
    shiftNotifications,
    shiftReminders,
    replacementEngine,
    swapBroker,
    loanConsent,
  ],
})
