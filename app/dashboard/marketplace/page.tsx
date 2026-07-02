import { auth } from "@/auth"
import { prisma } from "@/prisma/client"
import { redirect } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/dashboard/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DiscoverySettingsForm } from "@/components/marketplace/discovery-settings-form"
import { CreateListingForm } from "@/components/marketplace/create-listing-form"
import { getNearbyVenues } from "@/lib/marketplace/queries"
import { formatRate } from "@/lib/marketplace/listings"
import { cancelListing } from "@/app/actions/marketplace"
import { Building2, Inbox, MapPinOff, Store } from "lucide-react"

const LISTING_TYPE_STYLES = {
  OFFER: "bg-blue-100 text-blue-700 border-blue-200",
  REQUEST: "bg-amber-100 text-amber-700 border-amber-200",
} as const

const LISTING_STATUS_STYLES = {
  OPEN: "bg-green-100 text-green-700 border-green-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
} as const

// Listing dates are stored at UTC midnight, so format in UTC to avoid drifting
// a day in western timezones.
const formatListingDate = (date: Date) =>
  date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const { location: locationParam } = await searchParams

  const locations = await prisma.location.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      employees: { select: { id: true, name: true, roles: true }, orderBy: { name: "asc" } },
      sharingListings: {
        orderBy: { createdAt: "desc" },
        include: { employee: { select: { name: true } } },
      },
    },
  })

  if (locations.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Marketplace"
          description="Lend and borrow staff with nearby venues"
        />
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <Building2 className="h-7 w-7 text-slate-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">No locations yet</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md">
                Add a location first — the marketplace connects your venue with others nearby.
              </p>
            </div>
            <Link href="/dashboard/locations/new">
              <Button>Add location</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const acting = locations.find((l) => l.id === locationParam) ?? locations[0]
  const discoveryReady = acting.isDiscoverable && acting.lat != null && acting.lng != null
  const nearby = await getNearbyVenues(acting)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketplace"
        description="Lend and borrow staff with nearby venues"
      />

      {locations.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {locations.map((l) => (
            <Link key={l.id} href={`/dashboard/marketplace?location=${l.id}`}>
              <Button size="sm" variant={l.id === acting.id ? "default" : "outline"}>
                {l.name}
              </Button>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Nearby venues</CardTitle>
              <CardDescription>
                Opted-in venues within reach of {acting.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!discoveryReady ? (
                <div className="py-8 flex flex-col items-center text-center gap-3 border border-dashed rounded-lg">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <MapPinOff className="h-6 w-6 text-slate-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Discovery is off</h3>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm">
                      Add your address and turn on discovery to see venues near you.
                      Only opted-in venues can see each other.
                    </p>
                  </div>
                </div>
              ) : nearby.length === 0 ? (
                <div className="py-8 flex flex-col items-center text-center gap-3 border border-dashed rounded-lg">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <Store className="h-6 w-6 text-slate-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">No venues nearby yet</h3>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm">
                      No opted-in venues within {acting.discoveryRadiusKm} km so far — check
                      back once neighbours join.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {nearby.map(({ venue, distanceKm }) => (
                    <li key={venue.id} className="flex items-center gap-3 py-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 shrink-0">
                        <Store className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{venue.name}</p>
                        <p className="text-sm text-slate-500">{distanceKm.toFixed(1)} km away</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My listings</CardTitle>
              <CardDescription>Offers and requests posted by {acting.name}</CardDescription>
            </CardHeader>
            <CardContent>
              {acting.sharingListings.length === 0 ? (
                <div className="py-8 flex flex-col items-center text-center gap-3 border border-dashed rounded-lg">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <Inbox className="h-6 w-6 text-slate-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">No listings yet</h3>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm">
                      Post an offer when you're overstaffed or a request when you're short.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {acting.sharingListings.map((listing) => (
                    <li key={listing.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={LISTING_TYPE_STYLES[listing.type]}>
                            {listing.type === "OFFER" ? "Offering" : "Requesting"}
                          </Badge>
                          <span className="font-medium text-slate-900">{listing.role}</span>
                          {listing.employee && (
                            <span className="text-sm text-slate-500">
                              ({listing.employee.name})
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">
                          {formatListingDate(listing.date)} · {listing.startTime}–
                          {listing.endTime} · {formatRate(listing.hourlyRateCents)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={LISTING_STATUS_STYLES[listing.status]}>
                          {listing.status}
                        </Badge>
                        {listing.status === "OPEN" && (
                          <form action={cancelListing.bind(null, listing.id)}>
                            <Button type="submit" size="sm" variant="ghost">
                              Cancel
                            </Button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Discovery settings</CardTitle>
              <CardDescription>How {acting.name} appears to nearby venues</CardDescription>
            </CardHeader>
            <CardContent>
              <DiscoverySettingsForm
                key={acting.id}
                locationId={acting.id}
                address={acting.address}
                isDiscoverable={acting.isDiscoverable}
                discoveryRadiusKm={acting.discoveryRadiusKm}
                isGeocoded={acting.lat != null && acting.lng != null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Post a listing</CardTitle>
              <CardDescription>Manually for now — AI suggestions come later</CardDescription>
            </CardHeader>
            <CardContent>
              <CreateListingForm
                key={acting.id}
                locationId={acting.id}
                employees={acting.employees}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
