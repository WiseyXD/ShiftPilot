import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { trialExpiryWarning } from "@/lib/inngest/functions/trial-expiry"
import { weeklyAvailabilityReminder } from "@/lib/inngest/functions/availability-reminder"
import { availabilityCollection } from "@/lib/inngest/functions/availability-collection"
import { weeklyScheduleGeneration } from "@/lib/inngest/functions/schedule-generation"
import { shiftNotifications, shiftReminders } from "@/lib/inngest/functions/shift-notifications"
import { replacementEngine } from "@/lib/inngest/functions/replacement-engine"
import { swapBroker } from "@/lib/inngest/functions/swap-broker"
import { loanConsent } from "@/lib/inngest/functions/loan-consent"
import { sickConfirmationNag } from "@/lib/inngest/functions/sick-confirmation"
import { checkInScheduler, checkInWatch } from "@/lib/inngest/functions/check-in"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    trialExpiryWarning,
    weeklyAvailabilityReminder,
    availabilityCollection,
    weeklyScheduleGeneration,
    shiftNotifications,
    shiftReminders,
    replacementEngine,
    swapBroker,
    loanConsent,
    sickConfirmationNag,
    checkInScheduler,
    checkInWatch,
  ],
})
