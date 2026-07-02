"use client"

import { useActionState } from "react"
import { updateDiscoverySettings } from "@/app/actions/marketplace"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MapPin } from "lucide-react"

interface DiscoverySettingsFormProps {
  locationId: string
  address: string | null
  isDiscoverable: boolean
  discoveryRadiusKm: number
  isGeocoded: boolean
}

export function DiscoverySettingsForm({
  locationId,
  address,
  isDiscoverable,
  discoveryRadiusKm,
  isGeocoded,
}: DiscoverySettingsFormProps) {
  const [state, action, pending] = useActionState(updateDiscoverySettings, null)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locationId" value={locationId} />
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{state.error}</p>
      )}
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Venue address</label>
        <Input
          name="address"
          defaultValue={address ?? ""}
          placeholder="Hauptstraße 12, 10827 Berlin"
        />
        {isGeocoded && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            Address located on the map
          </p>
        )}
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Discovery radius (km)</label>
        <Input
          name="discoveryRadiusKm"
          type="number"
          min={1}
          max={50}
          defaultValue={discoveryRadiusKm}
          className="w-24"
        />
      </div>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          name="isDiscoverable"
          defaultChecked={isDiscoverable}
          className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
        />
        <span className="text-sm text-slate-700">
          List this venue in nearby discovery
          <span className="block text-xs text-slate-500">
            Off by default. Only opted-in venues within range can see each other.
          </span>
        </span>
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save discovery settings"}
      </Button>
    </form>
  )
}
